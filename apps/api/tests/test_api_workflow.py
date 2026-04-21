from apps.api.app.core.database import SessionLocal
from apps.api.app.services.jobs import process_due_jobs


def test_health_endpoint_reports_providers(client):
    response = client.get("/system/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["providers"]
    assert any(item["port"] == "trademarkSearch" for item in payload["providers"])


def test_diagnosis_job_flow(client, auth_headers):
    response = client.post(
        "/diagnosis/jobs",
        headers=auth_headers,
        json={
            "business_name": "Galaxy Lab",
            "business_description": "A SaaS toolkit for cross-border sellers",
            "industry": "SaaS",
            "stage": "seed",
        },
    )
    assert response.status_code == 200
    job_id = response.json()["id"]

    with SessionLocal() as db:
        process_due_jobs(db)

    result = client.get(f"/jobs/{job_id}", headers=auth_headers)
    assert result.status_code == 200
    assert result.json()["status"] == "completed"
    track = result.json()["result"]["normalizedPayload"]["recommendedTrack"]
    # LLM-backed picker may suggest a composite track (e.g. "trademark|copyright");
    # the contract is that ``trademark`` must be one of the recommendations.
    assert "trademark" in track.split("|")


def test_trademark_check_and_application_flow(client, auth_headers):
    check = client.post(
        "/trademarks/check",
        headers=auth_headers,
        json={
            "trademark_name": "QiShield",
            "business_description": "Business service platform",
            "applicant_name": "Example Co",
            "applicant_type": "company",
            "categories": ["35", "42"],
        },
    )
    assert check.status_code == 200
    assert check.json()["normalizedPayload"]["riskLevel"] in {"green", "yellow", "red"}

    application = client.post(
        "/trademarks/application/jobs",
        headers=auth_headers,
        json={
            "trademark_name": "QiShield Nova",
            "applicant_name": "Example Co",
            "applicant_type": "company",
            "business_description": "Business service platform",
            "categories": ["35", "42"],
            "risk_level": "yellow",
        },
    )
    assert application.status_code == 200
    job_id = application.json()["id"]

    with SessionLocal() as db:
        process_due_jobs(db)

    result = client.get(f"/jobs/{job_id}", headers=auth_headers)
    assert result.status_code == 200
    assert result.json()["status"] == "completed"
    draft = result.json()["result"]
    assert draft["downloadEndpoints"]["docx"].endswith(".docx")
    assert draft["downloadEndpoints"]["pdf"].endswith(".pdf")
    assert draft["downloadEndpoints"]["md"].endswith(".md")

    # All three formats should be served and carry the expected MIME type.
    docx_resp = client.get(draft["downloadEndpoints"]["docx"], headers=auth_headers)
    pdf_resp = client.get(draft["downloadEndpoints"]["pdf"], headers=auth_headers)
    md_resp = client.get(draft["downloadEndpoints"]["md"], headers=auth_headers)
    assert docx_resp.status_code == 200
    assert pdf_resp.status_code == 200
    assert md_resp.status_code == 200
    assert pdf_resp.content.startswith(b"%PDF-")
    assert b"PK" == docx_resp.content[:2]  # DOCX is a ZIP container
    assert "QiShield Nova" in md_resp.text

    assets = client.get("/assets", headers=auth_headers)
    reminders = client.get("/reminders", headers=auth_headers)
    assert assets.status_code == 200
    assert reminders.status_code == 200
    assert len(assets.json()) == 1
    assert len(reminders.json()) == 4


def test_compliance_report_multi_format_downloads(client, auth_headers):
    """/compliance/profile/{id}/report.{ext} should serve md/docx/pdf alike."""
    audit = client.post(
        "/compliance/audit",
        headers=auth_headers,
        json={"companyName": "Galaxy Lab", "industry": "SaaS", "scale": "small"},
    )
    assert audit.status_code == 200, audit.text
    profile_id = audit.json()["profile_id"]

    md_resp = client.get(f"/compliance/profile/{profile_id}/report.md", headers=auth_headers)
    docx_resp = client.get(f"/compliance/profile/{profile_id}/report.docx", headers=auth_headers)
    pdf_resp = client.get(f"/compliance/profile/{profile_id}/report.pdf", headers=auth_headers)

    assert md_resp.status_code == 200
    assert "markdown" in md_resp.headers["content-type"]
    assert "合规体检报告" in md_resp.text or "Galaxy Lab" in md_resp.text

    assert docx_resp.status_code == 200
    assert docx_resp.content[:2] == b"PK"

    assert pdf_resp.status_code == 200
    assert pdf_resp.content.startswith(b"%PDF-")

    bad = client.get(f"/compliance/profile/{profile_id}/report.html", headers=auth_headers)
    assert bad.status_code == 400


def test_placeholder_modules_are_exposed(client, auth_headers):
    endpoints = [
        "/monitoring/status",
        "/competitors/status",
        "/contracts/status",
        "/patents/status",
        "/policies/status",
        "/due-diligence/status",
    ]
    for path in endpoints:
        response = client.get(path, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "module" in data
        assert "enabled" in data
