import logging
import signal
import time
import redis
from celery.exceptions import SoftTimeLimitExceeded, TimeLimitExceeded
from celery.result import AsyncResult
from celery.utils.log import get_task_logger
from six import text_type

from redash import models, redis_connection, settings, statsd_client
from redash.models.parameterized_query import InvalidParameterError, QueryDetachedFromDataSourceError
from redash.query_runner import InterruptException
from redash.tasks.alerts import check_alerts_for_query
from redash.tasks.failure_report import notify_of_failure
from redash.utils import gen_query_hash, json_dumps, utcnow, mustache_render
from redash.worker import celery

logger = get_task_logger(__name__)
TIMEOUT_MESSAGE = "Query exceeded Redash query execution time limit."


def _job_lock_id(query_hash, data_source_id):
    return "query_hash_job:%s:%s" % (data_source_id, query_hash)


def _unlock(query_hash, data_source_id):
    redis_connection.delete(_job_lock_id(query_hash, data_source_id))


class QueryTask(object):
    # TODO: this is mapping to the old Job class statuses. Need to update the client side and remove this
    STATUSES = {
        'PENDING': 1,
        'STARTED': 2,
        'SUCCESS': 3,
        'FAILURE': 4,
        'REVOKED': 4
    }

    def __init__(self, job_id=None, async_result=None):
        if async_result:
            self._async_result = async_result
        else:
            self._async_result = AsyncResult(job_id, app=celery)

    @property
    def id(self):
        return self._async_result.id

    def to_dict(self):
        task_info = self._async_result._get_task_meta()
        result, task_status = task_info['result'], task_info['status']
        if task_status == 'STARTED':
            updated_at = result.get('start_time', 0)
        else:
            updated_at = 0

        status = self.STATUSES[task_status]

        if isinstance(result, (TimeLimitExceeded, SoftTimeLimitExceeded)):
            error = TIMEOUT_MESSAGE
            status = 4
        elif isinstance(result, Exception):
            error = result.message
            status = 4
        elif task_status == 'REVOKED':
            error = 'Query execution cancelled.'
        else:
            error = ''

        if task_status == 'SUCCESS' and not error:
            query_result_id = result
        else:
            query_result_id = None

        return {
            'id': self._async_result.id,
            'updated_at': updated_at,
            'status': status,
            'error': error,
            'query_result_id': query_result_id,
        }

    @property
    def is_cancelled(self):
        return self._async_result.status == 'REVOKED'

    @property
    def celery_status(self):
        return self._async_result.status

    def ready(self):
        return self._async_result.ready()

    def cancel(self):
        return self._async_result.revoke(terminate=True, signal='SIGINT')


def enqueue_query(query, data_source, user_id, is_api_key=False, scheduled_query=None, metadata={}):
    query_hash = gen_query_hash(query)
    logging.info("Inserting job for %s with metadata=%s", query_hash, metadata)
    try_count = 0
    job = None

    while try_count < 5:
        try_count += 1

        pipe = redis_connection.pipeline()
        try:
            pipe.watch(_job_lock_id(query_hash, data_source.id))
            job_id = pipe.get(_job_lock_id(query_hash, data_source.id))
            if job_id:
                logging.info("[%s] Found existing job: %s", query_hash, job_id)

                job = QueryTask(job_id=job_id)

                if job.ready():
                    logging.info("[%s] job found is ready (%s), removing lock", query_hash, job.celery_status)
                    redis_connection.delete(_job_lock_id(query_hash, data_source.id))
                    job = None

            if not job:
                pipe.multi()

                if scheduled_query:
                    queue_name = data_source.scheduled_queue_name
                    scheduled_query_id = scheduled_query.id
                else:
                    queue_name = data_source.queue_name
                    scheduled_query_id = None

                args = (query, data_source.id, metadata, user_id, scheduled_query_id, is_api_key)
                argsrepr = json_dumps({
                    'org_id': data_source.org_id,
                    'data_source_id': data_source.id,
                    'enqueue_time': time.time(),
                    'scheduled': scheduled_query_id is not None,
                    'query_id': metadata.get('Query ID'),
                    'user_id': user_id
                })

                time_limit = settings.dynamic_settings.query_time_limit(scheduled_query, user_id, data_source.org_id)

                result = execute_query.apply_async(args=args,
                                                   argsrepr=argsrepr,
                                                   queue=queue_name,
                                                   soft_time_limit=time_limit)

                job = QueryTask(async_result=result)
                logging.info("[%s] Created new job: %s", query_hash, job.id)
                pipe.set(_job_lock_id(query_hash, data_source.id), job.id, settings.JOB_EXPIRY_TIME)
                pipe.execute()
            break

        except redis.WatchError:
            continue

    if not job:
        logging.error("[Manager][%s] Failed adding job for query.", query_hash)

    return job


@celery.task(name="redash.tasks.empty_schedules")
def empty_schedules():
    logger.info("Deleting schedules of past scheduled queries...")

    queries = models.Query.past_scheduled_queries()
    for query in queries:
        query.schedule = None
    models.db.session.commit()

    logger.info("Deleted %d schedules.", len(queries))


@celery.task(name="redash.tasks.refresh_queries")
def refresh_queries():
    logger.info("Refreshing queries...")

    outdated_queries_count = 0
    query_ids = []

    with statsd_client.timer('manager.outdated_queries_lookup'):
        for query in models.Query.outdated_queries():
            if settings.FEATURE_DISABLE_REFRESH_QUERIES:
                logging.info("Disabled refresh queries.")
            elif query.org.is_disabled:
                logging.debug("Skipping refresh of %s because org is disabled.", query.id)
            elif query.data_source is None:
                logging.debug("Skipping refresh of %s because the datasource is none.", query.id)
            elif query.data_source.paused:
                logging.debug("Skipping refresh of %s because datasource - %s is paused (%s).",
                              query.id, query.data_source.name, query.data_source.pause_reason)
            else:
                query_text = query.query_text

                parameters = {p['name']: p.get('value') for p in query.parameters}
                if any(parameters):
                    try:
                        query_text = query.parameterized.apply(parameters).query
                    except InvalidParameterError as e:
                        error = u"Skipping refresh of {} because of invalid parameters: {}".format(query.id, e.message)
                        track_failure(query, error)
                        continue
                    except QueryDetachedFromDataSourceError as e:
                        error = ("Skipping refresh of {} because a related dropdown "
                                 "query ({}) is unattached to any datasource.").format(query.id, e.query_id)
                        track_failure(query, error)
                        continue

                enqueue_query(query_text, query.data_source, query.user_id,
                              scheduled_query=query,
                              metadata={'Query ID': query.id, 'Username': 'Scheduled'})

                query_ids.append(query.id)
                outdated_queries_count += 1

    statsd_client.gauge('manager.outdated_queries', outdated_queries_count)

    logger.info("Done refreshing queries. Found %d outdated queries: %s" % (outdated_queries_count, query_ids))

    status = redis_connection.hgetall('redash:status')
    now = time.time()

    redis_connection.hmset('redash:status', {
        'outdated_queries_count': outdated_queries_count,
        'last_refresh_at': now,
        'query_ids': json_dumps(query_ids)
    })

    statsd_client.gauge('manager.seconds_since_refresh', now - float(status.get('last_refresh_at', now)))


@celery.task(name="redash.tasks.cleanup_query_results")
def cleanup_query_results():
    """
    Job to cleanup unused query results -- such that no query links to them anymore, and older than
    settings.QUERY_RESULTS_MAX_AGE (a week by default, so it's less likely to be open in someone's browser and be used).

    Each time the job deletes only settings.QUERY_RESULTS_CLEANUP_COUNT (100 by default) query results so it won't choke
    the database in case of many such results.
    """

    logging.info("Running query results clean up (removing maximum of %d unused results, that are %d days old or more)",
                 settings.QUERY_RESULTS_CLEANUP_COUNT, settings.QUERY_RESULTS_CLEANUP_MAX_AGE)

    unused_query_results = models.QueryResult.unused(settings.QUERY_RESULTS_CLEANUP_MAX_AGE).limit(settings.QUERY_RESULTS_CLEANUP_COUNT)
    deleted_count = models.QueryResult.query.filter(
        models.QueryResult.id.in_(unused_query_results.subquery())
    ).delete(synchronize_session=False)
    models.db.session.commit()
    logger.info("Deleted %d unused query results.", deleted_count)


@celery.task(name="redash.tasks.refresh_schema", time_limit=90, soft_time_limit=60)
def refresh_schema(data_source_id):
    ds = models.DataSource.get_by_id(data_source_id)
    logger.info(u"task=refresh_schema state=start ds_id=%s", ds.id)
    start_time = time.time()
    try:
        ds.get_schema(refresh=True)
        logger.info(u"task=refresh_schema state=finished ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)
        statsd_client.incr('refresh_schema.success')
    except SoftTimeLimitExceeded:
        logger.info(u"task=refresh_schema state=timeout ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)
        statsd_client.incr('refresh_schema.timeout')
    except Exception:
        logger.warning(u"Failed refreshing schema for the data source: %s", ds.name, exc_info=1)
        statsd_client.incr('refresh_schema.error')
        logger.info(u"task=refresh_schema state=failed ds_id=%s runtime=%.2f", ds.id, time.time() - start_time)


@celery.task(name="redash.tasks.refresh_schemas")
def refresh_schemas():
    """
    Refreshes the data sources schemas.
    """
    blacklist = [int(ds_id) for ds_id in redis_connection.smembers('data_sources:schema:blacklist') if ds_id]
    global_start_time = time.time()

    logger.info(u"task=refresh_schemas state=start")

    for ds in models.DataSource.query:
        if ds.paused:
            logger.info(u"task=refresh_schema state=skip ds_id=%s reason=paused(%s)", ds.id, ds.pause_reason)
        elif ds.id in blacklist:
            logger.info(u"task=refresh_schema state=skip ds_id=%s reason=blacklist", ds.id)
        elif ds.org.is_disabled:
            logger.info(u"task=refresh_schema state=skip ds_id=%s reason=org_disabled", ds.id)
        else:
            refresh_schema.apply_async(args=(ds.id,), queue=settings.SCHEMAS_REFRESH_QUEUE)

    logger.info(u"task=refresh_schemas state=finish total_runtime=%.2f", time.time() - global_start_time)


def signal_handler(*args):
    raise InterruptException


class QueryExecutionError(Exception):
    pass


def _resolve_user(user_id, is_api_key, query_id):
    if user_id is not None:
        if is_api_key:
            api_key = user_id
            if query_id is not None:
                q = models.Query.get_by_id(query_id)
            else:
                q = models.Query.by_api_key(api_key)

            return models.ApiUser(api_key, q.org, q.groups)
        else:
            return models.User.get_by_id(user_id)
    else:
        return None


def track_failure(query, error):
    logging.debug(error)

    query.schedule_failures += 1
    models.db.session.add(query)
    models.db.session.commit()

    notify_of_failure(error, query)


# We could have created this as a celery.Task derived class, and act as the task itself. But this might result in weird
# issues as the task class created once per process, so decided to have a plain object instead.
class QueryExecutor(object):
    def __init__(self, task, query, data_source_id, user_id, is_api_key, metadata,
                 scheduled_query):
        self.task = task
        self.query = query
        self.data_source_id = data_source_id
        self.metadata = metadata
        self.data_source = self._load_data_source()
        self.user = _resolve_user(user_id, is_api_key, metadata.get('Query ID'))

        # Close DB connection to prevent holding a connection for a long time while the query is executing.
        models.db.session.close()
        self.query_hash = gen_query_hash(self.query)
        self.scheduled_query = scheduled_query
        # Load existing tracker or create a new one if the job was created before code update:
        if scheduled_query:
            models.scheduled_queries_executions.update(scheduled_query.id)

    def run(self):
        signal.signal(signal.SIGINT, signal_handler)
        started_at = time.time()

        logger.debug("Executing query:\n%s", self.query)
        self._log_progress('executing_query')

        query_runner = self.data_source.query_runner
        annotated_query = self._annotate_query(query_runner)

        try:
            data, error = query_runner.run_query(annotated_query, self.user)
        except Exception as e:
            if isinstance(e, SoftTimeLimitExceeded):
                error = TIMEOUT_MESSAGE
            else:
                error = text_type(e)

            data = None
            logging.warning('Unexpected error while running query:', exc_info=1)

        run_time = time.time() - started_at

        logger.info(u"task=execute_query query_hash=%s data_length=%s error=[%s]", self.query_hash, data and len(data), error)

        _unlock(self.query_hash, self.data_source.id)

        if error is not None and data is None:
            result = QueryExecutionError(error)
            if self.scheduled_query is not None:
                self.scheduled_query = models.db.session.merge(self.scheduled_query, load=False)
                track_failure(self.scheduled_query, error)
            raise result
        else:
            if (self.scheduled_query and self.scheduled_query.schedule_failures > 0):
                self.scheduled_query = models.db.session.merge(self.scheduled_query, load=False)
                self.scheduled_query.schedule_failures = 0
                models.db.session.add(self.scheduled_query)
            query_result, updated_query_ids = models.QueryResult.store_result(
                self.data_source.org_id, self.data_source,
                self.query_hash, self.query, data,
                run_time, utcnow())
            models.db.session.commit()  # make sure that alert sees the latest query result
            self._log_progress('checking_alerts')
            for query_id in updated_query_ids:
                check_alerts_for_query.delay(query_id)
            self._log_progress('finished')

            result = query_result.id
            models.db.session.commit()
            return result

    def _annotate_query(self, query_runner):
        self.metadata['Task ID'] = self.task.request.id
        self.metadata['Query Hash'] = self.query_hash
        self.metadata['Queue'] = self.task.request.delivery_info['routing_key']
        self.metadata['Scheduled'] = self.scheduled_query is not None
            
        return query_runner.annotate_query(self.query, self.metadata)

    def _log_progress(self, state):
        logger.info(
            u"task=execute_query state=%s query_hash=%s type=%s ds_id=%d  "
            "task_id=%s queue=%s query_id=%s username=%s",
            state, self.query_hash, self.data_source.type, self.data_source.id,
            self.task.request.id,
            self.task.request.delivery_info['routing_key'],
            self.metadata.get('Query ID', 'unknown'),
            self.metadata.get('Username', 'unknown'))

    def _load_data_source(self):
        logger.info("task=execute_query state=load_ds ds_id=%d", self.data_source_id)
        return models.DataSource.query.get(self.data_source_id)


# user_id is added last as a keyword argument for backward compatability -- to support executing previously submitted
# jobs before the upgrade to this version.
@celery.task(name="redash.tasks.execute_query", bind=True, track_started=True)
def execute_query(self, query, data_source_id, metadata, user_id=None,
                  scheduled_query_id=None, is_api_key=False):
    if scheduled_query_id is not None:
        scheduled_query = models.Query.query.get(scheduled_query_id)
    else:
        scheduled_query = None

    return QueryExecutor(self, query, data_source_id, user_id, is_api_key, metadata,
                         scheduled_query).run()
