from app.background_jobs import create_job, public_job, update_job


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, rows):
        self.rows = rows
        self.operation = None
        self.updates = None

    def insert(self, row):
        self.operation = "insert"
        self.rows.append(dict(row))
        return self

    def update(self, updates):
        self.operation = "update"
        self.updates = updates
        return self

    def eq(self, *_args):
        return self

    def execute(self):
        if self.operation == "update" and self.rows:
            self.rows[0].update(self.updates or {})
            return _Result([self.rows[0]])
        return _Result(self.rows)


class _Client:
    def __init__(self):
        self.rows = []
        self.table_obj = _Table(self.rows)

    def table(self, _name):
        return self.table_obj


def test_background_job_public_payload_is_private_and_progress_is_clamped():
    client = _Client()
    row = create_job(client, user_id="user-1", job_type="resume_extraction", payload={"secret": "value"})
    assert row["status"] == "queued"

    updated = update_job(client, row["id"], status="running", progress=140)
    public = public_job(updated)

    assert public["status"] == "running"
    assert public["progress"] == 100
    assert "payload" not in public
