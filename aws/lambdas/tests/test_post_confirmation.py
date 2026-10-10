"""Unit tests for aws/lambdas/cruddur-post-confirmation/lambda_function.py.

Backlog #50. Standard library only: psycopg2 and boto3 are replaced by small
fakes, so this runs on any machine with python3 and touches no AWS service and
no database. The events in events/ have the shape Cognito sends (fake values).

Run from the repo root:
    python3 -B -m unittest discover -s aws/lambdas/tests -v
"""
import importlib.util
import json
import os
import sys
import types
import unittest

sys.dont_write_bytecode = True  # keep __pycache__ out of the Lambda folder

HERE = os.path.dirname(os.path.abspath(__file__))
LAMBDA_FILE = os.path.join(HERE, '..', 'cruddur-post-confirmation', 'lambda_function.py')


# ---------- fakes ----------------------------------------------------------
class FakePgError(Exception):
    def __init__(self, msg='', pgcode=None, constraint_name=None):
        super().__init__(msg)
        self.pgcode = pgcode
        self.diag = types.SimpleNamespace(constraint_name=constraint_name)


class FakeOperationalError(FakePgError):
    pass


class FakeCursor:
    def __init__(self, db):
        self.db = db
        self.rowcount = -1

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params):
        self.db.executed.append((sql, list(params)))
        if self.db.raise_on_execute is not None:
            raise self.db.raise_on_execute
        self.rowcount = self.db.rowcount


class FakeConn:
    def __init__(self, db):
        self.db = db

    def cursor(self):
        return FakeCursor(self.db)

    def commit(self):
        self.db.commits += 1

    def close(self):
        self.db.closes += 1


class FakeDb:
    def __init__(self):
        self.reset()

    def reset(self, rowcount=1, raise_on_execute=None):
        self.connects = 0
        self.commits = 0
        self.closes = 0
        self.executed = []
        self.rowcount = rowcount
        self.raise_on_execute = raise_on_execute

    def connect(self, **kwargs):
        self.connects += 1
        return FakeConn(self)


FAKE_DB = FakeDb()


def load_lambda():
    psycopg2 = types.ModuleType('psycopg2')
    psycopg2.Error = FakePgError
    psycopg2.OperationalError = FakeOperationalError
    psycopg2.connect = FAKE_DB.connect
    boto3 = types.ModuleType('boto3')

    class FakeSecrets:
        def get_secret_value(self, SecretId):
            return {'SecretString': json.dumps({'username': 'u', 'password': 'p'})}

    boto3.client = lambda name: FakeSecrets()
    sys.modules['psycopg2'] = psycopg2
    sys.modules['boto3'] = boto3
    os.environ.setdefault('DB_SECRET_ARN', 'arn:aws:secretsmanager:us-east-1:000000000000:secret:fake')
    os.environ.setdefault('PG_HOST', 'fake-host')
    spec = importlib.util.spec_from_file_location('lambda_function_under_test', LAMBDA_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


LAMBDA = load_lambda()


def event(name):
    with open(os.path.join(HERE, 'events', name)) as f:
        return json.load(f)


# ---------- tests ----------------------------------------------------------
class PostConfirmationTests(unittest.TestCase):

    def setUp(self):
        FAKE_DB.reset()

    def test_signup_inserts_one_row_guarded_by_not_exists(self):
        ev = event('confirm_signup.json')
        self.assertIs(LAMBDA.lambda_handler(ev, None), ev)
        self.assertEqual(FAKE_DB.connects, 1)
        self.assertEqual(FAKE_DB.commits, 1)
        sql, params = FAKE_DB.executed[0]
        self.assertIn('WHERE NOT EXISTS', sql)
        self.assertIn('SELECT 1 FROM public.users WHERE cognito_user_id = %s', sql)
        sub = ev['request']['userAttributes']['sub']
        self.assertEqual(params, ['Test User', 'test.user@example.com', 'testuser', sub, sub])

    def test_password_reset_is_skipped_and_never_touches_the_database(self):
        # The #50 incident: this trigger used to insert a second row.
        ev = event('confirm_forgot_password.json')
        self.assertIs(LAMBDA.lambda_handler(ev, None), ev)
        self.assertEqual(FAKE_DB.connects, 0)
        self.assertEqual(FAKE_DB.executed, [])

    def test_unknown_trigger_is_skipped(self):
        ev = event('confirm_signup.json')
        ev['triggerSource'] = 'PostConfirmation_SomethingNew'
        self.assertIs(LAMBDA.lambda_handler(ev, None), ev)
        self.assertEqual(FAKE_DB.connects, 0)

    def test_existing_row_is_not_an_error(self):
        FAKE_DB.reset(rowcount=0)  # NOT EXISTS was false: row already there
        ev = event('confirm_signup.json')
        self.assertIs(LAMBDA.lambda_handler(ev, None), ev)
        self.assertEqual(FAKE_DB.commits, 1)

    def test_concurrent_insert_on_our_constraint_is_not_an_error(self):
        FAKE_DB.reset(raise_on_execute=FakePgError(
            'duplicate key', pgcode='23505', constraint_name='users_cognito_user_id_key'))
        ev = event('confirm_signup.json')
        self.assertIs(LAMBDA.lambda_handler(ev, None), ev)
        self.assertEqual(FAKE_DB.commits, 0)
        self.assertEqual(FAKE_DB.closes, 1)

    def test_other_unique_violation_still_raises(self):
        # e.g. a future unique handle: must NOT be silently skipped.
        FAKE_DB.reset(raise_on_execute=FakePgError(
            'duplicate key', pgcode='23505', constraint_name='users_handle_key'))
        with self.assertRaises(FakePgError):
            LAMBDA.lambda_handler(event('confirm_signup.json'), None)

    def test_other_database_error_still_raises(self):
        FAKE_DB.reset(raise_on_execute=FakePgError('relation does not exist', pgcode='42P01'))
        with self.assertRaises(FakePgError):
            LAMBDA.lambda_handler(event('confirm_signup.json'), None)

    def test_missing_attribute_on_signup_raises(self):
        ev = event('confirm_signup.json')
        del ev['request']['userAttributes']['preferred_username']
        with self.assertRaises(KeyError):
            LAMBDA.lambda_handler(ev, None)
        self.assertEqual(FAKE_DB.connects, 0)


if __name__ == '__main__':
    unittest.main()
