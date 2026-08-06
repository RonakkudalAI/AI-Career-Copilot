from app.api.router import _prepare_candidate_payload


def test_manual_profile_records_get_a_display_order_for_firestore_reads():
    for resource in ("experiences", "education", "links"):
        prepared = _prepare_candidate_payload(resource, {}, require_core=False)
        assert prepared["display_order"] == 0
