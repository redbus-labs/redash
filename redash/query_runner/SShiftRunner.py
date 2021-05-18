from __future__ import print_function
from redash.query_runner import *
from redash.utils import JSONEncoder
from redash.utils import json_dumps, json_loads
import grpc
import gsshift_pb2
import gsshift_pb2_grpc


class SShiftRunner(BaseSQLQueryRunner):
    should_annotate_query = False

    @classmethod
    def configuration_schema(cls):
        return {
            "type": "object",
            "properties": {
                "host": {
                    "type": "string"
                },
                "user": {
                    "type": "string"
                },
                "password": {
                    "type": "string"
                },
                "database": {
                    "type": "string"
                },
                "iam_role": {
                    "type": "string"
                }
            },
            "required": ["user", "password", "host", "database", "iam_role"],
            "secret": ["password"]
        }

    def test_connection(self):
        list("T2")

    @classmethod
    def enabled(cls):
        return True

    def __init__(self, configuration):
        super(SShiftRunner, self).__init__(configuration)
        self.syntax = "json"

    def _connect(self):
        return 1

    def load_default(self, query):
        default_dict = {
            "SPREADSHEET_ID": "",
            "SHEETNAME": "",
            "TABLE_NAME": "",
            "MODE": "overwrite",
            "DISTRIBUTION_STYLE": "even",
            "DIST_KEY": "null",
            "SORT_KEY": "null"
        }
        d_key = default_dict
        d_key.update(query)
        query = d_key
        return query

    def validate_parameters(self, query_json):
        empty_key = [k for k, v in query_json.items() if v == ""]
        schema_name = query_json["TABLE_NAME"].split(".")[0].lower()
        mode = query_json["MODE"].lower()
        dist_style = query_json["DISTRIBUTION_STYLE"].lower()

        if "SPREADSHEET_ID" in empty_key:
            return {"error_msg": "Spreadsheet ID cannot be empty..."}
        elif "SHEETNAME" in empty_key:
            return {"error_msg": "sheet name cannot be empty..."}
        elif "TABLE_NAME" in empty_key:
            return {"error_msg": "Table name cannot be empty..."}
        elif schema_name != "sshift":
            return {"error_msg": "Only supported schema is sshift..."}
        elif mode not in ["append", "overwrite"]:
            return {"error_msg": "Mode value should either be append or overwrite"}
        elif dist_style not in ["auto", "even", "key", "all"]:
            return {"error_msg": "DISTRIBUTION_STYLE value should either be auto or even or key or all"}
        else:
            return {"error_msg": None}

    def run_query(self, query, user):
        
        query_json = json_loads(query)
        query_json = self.load_default(query_json)
        validation = self.validate_parameters(query_json)

        user = self.configuration['user']
        password = self.configuration['password']
        host = self.configuration['host']
        database = self.configuration['database']
        iam_role = self.configuration['iam_role']
        spreadsheet_id = query_json["SPREADSHEET_ID"]
        sheet_name = query_json["SHEETNAME"]
        table_name = query_json["TABLE_NAME"].lower()
        mode = query_json["MODE"]
        distribution_style = query_json["DISTRIBUTION_STYLE"]
        dist_key = query_json["DIST_KEY"]
        sort_key = query_json["SORT_KEY"]

        if not validation["error_msg"]:
            try:

                with grpc.insecure_channel('sshift:50055') as channel:
                    stub = gsshift_pb2_grpc.SshiftStub(channel)
                    message = stub.Runner(
                        gsshift_pb2.Input(spreadsheet_id=spreadsheet_id, sheet_name=sheet_name, table_name=table_name,
                                          mode=mode, distribution_style=distribution_style, dist_key=dist_key,
                                          sort_key=sort_key, database=database, host=host, user=user, password=password,
                                          iam_role=iam_role))
                output = '"{}"'.format(message)
                data = {}
                data['columns'] = [{u'friendly_name': u'status', u'name': u'status', u'type': None}]
                data['rows'] = [{"status": output}]
                json_data = json_dumps(data, cls=JSONEncoder)
                return json_data, None;
            except Exception as ex:
                return None, """{error}""".format(error="%s" % (ex))
        else:
            return None, """{error}""".format(error=validation["error_msg"])


register(SShiftRunner)
