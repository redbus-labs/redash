import datetime
import csv
import cStringIO

from tests import BaseTestCase

from redash import models
from redash.utils import utcnow, json_dumps
from redash.serializers import serialize_query_result, serialize_query_result_to_csv


data = {
    "rows": [
        {"datetime": "2019-05-26T12:39:23.026Z", "bool": True, "date": "2019-05-26"},
        {"datetime": "", "bool": False, "date": ""},
        {"datetime": None, "bool": None, "date": None},
        {"datetime": 459, "bool": None, "date": 123},
        {"datetime": "459", "bool": None, "date": "123"},
    ], 
    "columns": [
        {"friendly_name": "bool", "type": "boolean", "name": "bool"}, 
        {"friendly_name": "date", "type": "datetime", "name": "datetime"},
        {"friendly_name": "date", "type": "date", "name": "date"}
    ]
}

class QueryResultSerializationTest(BaseTestCase):
    def test_serializes_all_keys_for_authenticated_users(self):
        query_result = self.factory.create_query_result(data=json_dumps({}))
        serialized = serialize_query_result(query_result, False)
        self.assertSetEqual(set(query_result.to_dict().keys()),
                            set(serialized.keys()))

    def test_doesnt_serialize_sensitive_keys_for_unauthenticated_users(self):
        query_result = self.factory.create_query_result(data=json_dumps({}))
        serialized = serialize_query_result(query_result, True)
        self.assertSetEqual(set(['data', 'retrieved_at']),
                            set(serialized.keys()))

class CsvSerializationTest(BaseTestCase):
    def get_csv_content(self):
        query_result = self.factory.create_query_result(data=json_dumps(data))
        return serialize_query_result_to_csv(query_result)

    def test_serializes_booleans_correctly(self):
        with self.app.test_request_context('/'):
            parsed = csv.DictReader(cStringIO.StringIO(self.get_csv_content()))
        rows = list(parsed)

        self.assertEqual(rows[0]['bool'], 'true')
        self.assertEqual(rows[1]['bool'], 'false')
        self.assertEqual(rows[2]['bool'], '')

    def test_serializes_datatime_with_correct_format(self):
        with self.app.test_request_context('/'):
            parsed = csv.DictReader(cStringIO.StringIO(self.get_csv_content()))
        rows = list(parsed)

        self.assertEqual(rows[0]['datetime'], '26/05/19 12:39')
        self.assertEqual(rows[1]['datetime'], '')
        self.assertEqual(rows[2]['datetime'], '')
        self.assertEqual(rows[0]['date'], '26/05/19')
        self.assertEqual(rows[1]['date'], '')
        self.assertEqual(rows[2]['date'], '')

    def test_serializes_datatime_as_is_in_case_of_error(self):
        with self.app.test_request_context('/'):
            parsed = csv.DictReader(cStringIO.StringIO(self.get_csv_content()))
        rows = list(parsed)

        self.assertEqual(rows[3]['datetime'], '459')
        self.assertEqual(rows[3]['date'], '123')
