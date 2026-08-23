"""Tests for the activated open-shelter layer. The FEMA NSS parser and mappers run
against synthetic ArcGIS features and the mock fixtures. The live query gets checked
by hand."""
import asyncio

from api.services.open_shelters import (
    _int_or_none,
    _map_feature,
    _pet_friendly,
    _yn,
    fetch_open_shelters,
)

# Shaped like a real FEMA NSS record, where the coordinates live in the geometry
# and many attribute fields come back partial or unknown.
_FEATURE = {
    "attributes": {
        "shelter_id": "ABC123",
        "shelter_name": "Santa Teresa De Avila Episcopal",
        "address_1": "1872 N Mohawk St",
        "city": "Chicago",
        "state": "IL",
        "zip": "60614",
        "evacuation_capacity": None,
        "post_impact_capacity": None,
        "total_population": None,
        "general_population": None,
        "ada_compliant": "UNK",
        "wheelchair_accessible": "Y",
        "pet_accommodations_code": "NONE",
        "org_organization_name": "American Red Cross of Chicago",
        "shelter_status_code": "OPEN",
        "reporting_period": None,
        "shelter_open_date": 1780185600000,
        "incident_name": "Chicago-IL-MFF-1",
        "objectid": 5,
    },
    "geometry": {"x": -87.71015, "y": 41.78049},
}


def test_map_feature_parses_real_shape():
    s = _map_feature(_FEATURE)
    assert s is not None
    assert s.name == "Santa Teresa De Avila Episcopal"
    assert abs(s.lat - 41.78049) < 1e-4 and abs(s.lon - (-87.71015)) < 1e-4
    assert s.status == "OPEN"
    assert s.address == "1872 N Mohawk St, Chicago, IL"
    assert s.managing_org == "American Red Cross of Chicago"
    assert s.pet_friendly is False          # pet_accommodations_code == NONE
    assert s.ada_accessible is True          # ada was UNK, so it read wheelchair
    assert s.updated_at is None              # reporting_period was null
    assert s.opened_at is not None           # from shelter_open_date epoch ms


def test_map_feature_skips_missing_geometry():
    no_geom = {"attributes": _FEATURE["attributes"], "geometry": {}}
    assert _map_feature(no_geom) is None
    null_xy = {"attributes": _FEATURE["attributes"], "geometry": {"x": None, "y": None}}
    assert _map_feature(null_xy) is None


def test_map_feature_marks_full_at_capacity():
    feat = {
        "attributes": {
            **_FEATURE["attributes"],
            "evacuation_capacity": 100,
            "total_population": 100,
        },
        "geometry": {"x": -87.7, "y": 41.78},
    }
    s = _map_feature(feat)
    assert s is not None
    assert s.status == "FULL"
    assert s.capacity == 100 and s.occupancy == 100


def test_yn_mapper():
    assert _yn("Y") is True
    assert _yn("N") is False
    assert _yn("UNK") is None
    assert _yn(None) is None


def test_pet_mapper():
    assert _pet_friendly("NONE") is False
    assert _pet_friendly("HOUSEHOLD_PETS") is True
    assert _pet_friendly("UNK") is None
    assert _pet_friendly(None) is None


def test_int_or_none():
    assert _int_or_none("12") == 12
    assert _int_or_none(12.0) == 12
    assert _int_or_none(None) is None
    assert _int_or_none("nope") is None


def test_mock_fixtures(monkeypatch):
    monkeypatch.setenv("MOCK_OPEN_SHELTERS", "1")
    rows = asyncio.run(fetch_open_shelters(37.87, -122.27))
    assert len(rows) >= 1
    assert any(r.status == "OPEN" for r in rows)
    for r in rows:
        assert abs(r.lat - 37.87) < 0.5 and abs(r.lon - (-122.27)) < 0.5
