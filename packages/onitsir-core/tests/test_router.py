"""Router routing and pre-filter (SYNERGY #2, #8)."""
import pytest

from onitsir.router import Assignment, Router


def test_route_empty_goal_raises(sample_router):
    with pytest.raises(ValueError):
        sample_router.route("")


def test_route_zero_crew_size_raises(sample_router):
    with pytest.raises(ValueError):
        sample_router.route("build a brand identity", crew_size=0)


def test_route_returns_ranked_assignments(sample_router):
    crew = sample_router.route("I need a brand identity guardian", crew_size=2)
    assert crew
    assert crew[0].specialist.id == "design-brand-guardian"


def test_route_never_fabricates_a_match(sample_router):
    crew = sample_router.route("zzz_unmatchable_nonsense_xyz", crew_size=3)
    assert crew == []


def test_confidence_tiers():
    from onitsir.roster import Specialist
    s = Specialist(id="x", name="X", category="c", description="")
    assert Assignment(specialist=s, score=10).confidence == "high"
    assert Assignment(specialist=s, score=5).confidence == "medium"
    assert Assignment(specialist=s, score=1).confidence == "low"


def test_pre_filter_is_a_wider_scan(sample_router):
    """SYNERGY #2: pre_filter has a larger default limit than route()."""
    shortlist = sample_router.pre_filter("frontend web engineering work", limit=8)
    assert len(shortlist) <= 8
    assert all(isinstance(a, Assignment) for a in shortlist)


def test_pre_filter_same_scoring_as_route(sample_router):
    """pre_filter and route share the same underlying score for a given goal."""
    goal = "brand identity guardian work"
    a = sample_router.route(goal, crew_size=1)
    b = sample_router.pre_filter(goal, limit=1)
    assert a[0].specialist.id == b[0].specialist.id
    assert a[0].score == b[0].score


def test_assignment_to_dict_shape(sample_router):
    crew = sample_router.route("brand identity", crew_size=1)
    d = crew[0].to_dict()
    assert set(d) == {"id", "name", "category", "description", "score", "confidence"}
