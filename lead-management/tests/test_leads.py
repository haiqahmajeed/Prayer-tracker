"""
Tests for the lead management API.
Each test gets a fresh empty database (see conftest.py autouse fixture).
"""


def make_lead(client, **overrides):
    """Helper — create a lead with sensible defaults, return the response JSON."""
    payload = {
        "name": "Jane Smith",
        "email": "jane@example.com",
        "source": "website",
    }
    payload.update(overrides)
    return client.post("/api/v1/leads/", json=payload)


# ── Create ────────────────────────────────────────────────────────────────────

def test_create_lead_success(client):
    res = make_lead(client)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Jane Smith"
    assert data["email"] == "jane@example.com"
    assert data["status"] == "new"
    assert data["source"] == "website"
    assert "id" in data
    assert "created_at" in data


def test_create_lead_duplicate_email(client):
    make_lead(client)
    res = make_lead(client)  # same email
    assert res.status_code == 409


def test_create_lead_missing_required_field(client):
    # email is required
    res = client.post("/api/v1/leads/", json={"name": "Bob", "source": "website"})
    assert res.status_code == 422


def test_create_lead_invalid_email(client):
    res = make_lead(client, email="not-an-email")
    assert res.status_code == 422


def test_create_lead_invalid_source(client):
    res = make_lead(client, source="smoke_signal")
    assert res.status_code == 422


# ── Read ──────────────────────────────────────────────────────────────────────

def test_get_lead_by_id(client):
    created = make_lead(client).json()
    res = client.get(f"/api/v1/leads/{created['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]


def test_get_lead_not_found(client):
    res = client.get("/api/v1/leads/9999")
    assert res.status_code == 404


def test_list_leads_empty(client):
    res = client.get("/api/v1/leads/")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 0
    assert body["items"] == []


def test_list_leads_returns_all(client):
    make_lead(client, email="a@example.com")
    make_lead(client, email="b@example.com")
    res = client.get("/api/v1/leads/")
    assert res.json()["total"] == 2


def test_list_leads_filter_by_status(client):
    make_lead(client, email="a@example.com")
    lead_b = make_lead(client, email="b@example.com").json()
    # Promote lead_b to contacted
    client.patch(f"/api/v1/leads/{lead_b['id']}/status", json={"status": "contacted"})

    res = client.get("/api/v1/leads/?status=contacted")
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["email"] == "b@example.com"


def test_list_leads_search(client):
    make_lead(client, email="a@example.com", name="Alice", company="Acme")
    make_lead(client, email="b@example.com", name="Bob", company="Beta Corp")

    res = client.get("/api/v1/leads/?search=acme")
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["name"] == "Alice"


def test_list_leads_pagination(client):
    for i in range(5):
        make_lead(client, email=f"lead{i}@example.com")

    res = client.get("/api/v1/leads/?limit=2&skip=0")
    body = res.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2


# ── Update ────────────────────────────────────────────────────────────────────

def test_update_lead(client):
    created = make_lead(client).json()
    res = client.put(
        f"/api/v1/leads/{created['id']}",
        json={"name": "Jane Doe", "company": "New Corp"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Jane Doe"
    assert data["company"] == "New Corp"
    # Fields not in the update payload should be unchanged
    assert data["email"] == "jane@example.com"


def test_update_lead_not_found(client):
    res = client.put("/api/v1/leads/9999", json={"name": "Ghost"})
    assert res.status_code == 404


def test_update_lead_duplicate_email(client):
    make_lead(client, email="a@example.com")
    lead_b = make_lead(client, email="b@example.com").json()
    res = client.put(f"/api/v1/leads/{lead_b['id']}", json={"email": "a@example.com"})
    assert res.status_code == 409


# ── Status update ─────────────────────────────────────────────────────────────

def test_update_status(client):
    created = make_lead(client).json()
    res = client.patch(
        f"/api/v1/leads/{created['id']}/status",
        json={"status": "contacted", "note": "Called them"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "contacted"


def test_update_status_same_value(client):
    created = make_lead(client).json()
    res = client.patch(
        f"/api/v1/leads/{created['id']}/status",
        json={"status": "new"},  # already new
    )
    assert res.status_code == 400


def test_update_status_creates_activity(client):
    created = make_lead(client).json()
    client.patch(
        f"/api/v1/leads/{created['id']}/status",
        json={"status": "qualified", "note": "Confirmed budget"},
    )
    activities = client.get(f"/api/v1/leads/{created['id']}/activities").json()
    assert activities["total"] == 1
    entry = activities["items"][0]
    assert entry["activity_type"] == "status_change"
    assert entry["old_status"] == "new"
    assert entry["new_status"] == "qualified"
    assert entry["note"] == "Confirmed budget"


# ── Delete ────────────────────────────────────────────────────────────────────

def test_delete_lead(client):
    created = make_lead(client).json()
    res = client.delete(f"/api/v1/leads/{created['id']}")
    assert res.status_code == 204
    assert client.get(f"/api/v1/leads/{created['id']}").status_code == 404


def test_delete_lead_not_found(client):
    res = client.delete("/api/v1/leads/9999")
    assert res.status_code == 404


# ── Activities ────────────────────────────────────────────────────────────────

def test_add_manual_note(client):
    created = make_lead(client).json()
    res = client.post(
        f"/api/v1/leads/{created['id']}/activities",
        json={"note": "Sent follow-up email"},
    )
    assert res.status_code == 201
    assert res.json()["activity_type"] == "note_added"
    assert res.json()["note"] == "Sent follow-up email"


def test_list_activities_for_missing_lead(client):
    res = client.get("/api/v1/leads/9999/activities")
    assert res.status_code == 404


# ── Stats ─────────────────────────────────────────────────────────────────────

def test_stats_empty(client):
    res = client.get("/api/v1/leads/stats")
    assert res.status_code == 200
    body = res.json()
    assert body["total_leads"] == 0
    assert body["conversion_rate"] == 0.0


def test_stats_with_leads(client):
    make_lead(client, email="a@example.com")
    lead_b = make_lead(client, email="b@example.com").json()
    client.patch(f"/api/v1/leads/{lead_b['id']}/status", json={"status": "won"})

    res = client.get("/api/v1/leads/stats")
    body = res.json()
    assert body["total_leads"] == 2
    assert body["by_status"]["won"] == 1
    assert body["conversion_rate"] == 50.0


# ── Health ────────────────────────────────────────────────────────────────────

def test_health_check(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
