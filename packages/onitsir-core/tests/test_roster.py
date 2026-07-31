"""Roster loading and persona resolution (SYNERGY #1)."""
import pytest

from onitsir.roster import Roster, Specialist


def test_roster_cannot_be_empty():
    with pytest.raises(ValueError):
        Roster([])


def test_roster_loads_real_data(real_roster):
    assert len(real_roster) == 164
    assert "design" in real_roster.categories()


def test_roster_category_counts_are_live(real_roster):
    counts = real_roster.category_counts()
    assert sum(counts.values()) == len(real_roster)
    assert counts["design"] == 8


def test_get_specialist_by_id(sample_roster):
    s = sample_roster.get("design-brand-guardian")
    assert s.name == "Brand Guardian"


def test_get_unknown_specialist_raises(sample_roster):
    with pytest.raises(KeyError):
        sample_roster.get("does-not-exist")


def test_search_scores_category_and_keyword_hits(sample_roster):
    results = sample_roster.search("marketing growth hacking", limit=3)
    assert results
    top_specialist, score = results[0]
    assert top_specialist.id == "marketing-growth-hacker"
    assert score > 0


def test_search_returns_empty_for_no_match(sample_roster):
    results = sample_roster.search("zzzznonsense_no_match_xyz", limit=3)
    assert results == []


def test_specialist_score_weights_category_over_keyword():
    s = Specialist(id="x", name="X", category="marketing", description="", keywords=("growth",))
    # category hit (3) + keyword hit (2) for term "marketing"/"growth"
    score = s.score(["marketing", "growth"])
    assert score == 3 + 2


def test_load_content_falls_back_to_description(tmp_path):
    s = Specialist(id="design-x", name="X", category="design", description="fallback description")
    content = s.load_content(persona_root=tmp_path)
    assert content == "fallback description"


def test_load_content_reads_markdown_and_strips_frontmatter(tmp_path):
    persona_dir = tmp_path / "design"
    persona_dir.mkdir()
    md_file = persona_dir / "design-x.md"
    md_file.write_text("---\nname: X\n---\nThe real persona body.")
    s = Specialist(id="design-x", name="X", category="design", description="fallback")
    content = s.load_content(persona_root=tmp_path)
    assert content == "The real persona body."


def test_from_records_builds_equivalent_roster():
    records = [
        {"id": "a", "name": "A", "category": "design", "description": "d", "keywords": ["a"]},
    ]
    roster = Roster.from_records(records)
    assert len(roster) == 1
    assert roster.get("a").name == "A"
