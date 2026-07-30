from fastapi.testclient import TestClient

from app.main import app


def test_health_is_available_without_credentials():
    response = TestClient(app).get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_resume_improvement_capability_never_exposes_provider_secret():
    response = TestClient(app).get("/api/v1/resume-improvements/capabilities")
    assert response.status_code == 200
    body = response.json()
    assert body["export_formats"] == ["pdf", "docx"]
    assert "api_key" not in body
    assert "secret" not in body
