import pytest

from onitsir.roster import Roster, Specialist
from onitsir.router import Router


@pytest.fixture()
def sample_specialists():
    return [
        Specialist(
            id="design-brand-guardian", name="Brand Guardian", category="design",
            description="Expert brand strategist specializing in identity systems.",
            keywords=("design", "brand", "guardian", "identity"),
        ),
        Specialist(
            id="engineering-frontend-developer", name="Frontend Developer", category="engineering",
            description="Expert frontend engineer building fast, accessible web apps.",
            keywords=("engineering", "frontend", "developer", "web"),
        ),
        Specialist(
            id="marketing-growth-hacker", name="Growth Hacker", category="marketing",
            description="Expert growth marketer optimizing acquisition funnels.",
            keywords=("marketing", "growth", "hacker", "acquisition"),
        ),
        Specialist(
            id="specialized-theoretical-cs-researcher", name="Theoretical CS Researcher",
            category="specialized",
            description="Extends Dux's literature review practice for open CS problems.",
            keywords=("specialized", "theoretical", "research", "literature"),
        ),
    ]


@pytest.fixture()
def sample_roster(sample_specialists):
    return Roster(sample_specialists)


@pytest.fixture()
def sample_router(sample_roster):
    return Router(sample_roster)


@pytest.fixture()
def real_roster():
    """Loads the actual 164-entry roster.json shipped with onitsir-core."""
    return Roster.load()
