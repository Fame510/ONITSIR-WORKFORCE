"""ONITSIR command-line interface (unified).

Ported from ONITSIR/onitsir/cli.py, extended with:
  - `onitsir shackle-rules` — SYNERGY #11 demo of the declarative veto layer.
  - `onitsir ethics` — SYNERGY #12 demo of additive ethics scoring.
  - `onitsir conformance` — SYNERGY #20: run the conformance suite and print
    a certificate, mirroring ADROS's `run.py --test` self-diagnostic pattern
    (SYNERGY #13's philosophical template, applied here to the Python side).
  - `onitsir swarm-demo` — SYNERGY #17 demo of the swarm coordinator.

Usage:
    onitsir roster
    onitsir crew "goal text"
    onitsir run  "goal text"
    onitsir shackle
    onitsir shackle-rules
    onitsir ethics
    onitsir conformance
    onitsir swarm-demo
"""
from __future__ import annotations

import argparse
import sys

from .engine import Engine
from .roster import Roster
from .verification import Evidence
from .workflow import Phase

TAGLINE = 'ONITSIR — "On It, Sir." (unified)'


def _demo_verifier(phase: Phase) -> Evidence:
    return Evidence(
        command=f"onitsir selfcheck --phase {phase.value}",
        output=f"[{phase.value}] demo check: 1 passed, 0 failed",
        passed=True,
    )


def cmd_roster(args: argparse.Namespace) -> int:
    roster = Roster.load(args.data)
    print(f"{TAGLINE}\nRoster: {len(roster)} specialists across {len(roster.categories())} categories")
    for c, n in sorted(roster.category_counts().items()):
        print(f"  - {c}: {n}")
    return 0


def cmd_crew(args: argparse.Namespace) -> int:
    engine = Engine(roster=Roster.load(args.data), crew_size=args.crew_size)
    crew = engine.preview_crew(args.goal)
    print(f"{TAGLINE}\nGoal: {args.goal}\n")
    if not crew:
        print("No confident specialist match — refine the goal or broaden the roster.")
        return 1
    print("Staffed crew:")
    for a in crew:
        print(f"  [{a.confidence:>6}] {a.specialist.name}  ({a.specialist.category})")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    engine = Engine(roster=Roster.load(args.data), crew_size=args.crew_size)
    mission = engine.run(args.goal, verifier=_demo_verifier)
    print(f"{TAGLINE}\nGoal: {mission.goal}")
    print(f"Crew: {', '.join(mission.crew_names) or '(none matched)'}\n")
    for line in mission.phase_log:
        print(f"  {line}")
    if mission.governor is not None:
        led = mission.governor.ledger
        print(f"\n  Shackle audit ledger: {len(led)} rulings, chain intact: {led.verify()}")
    print()
    if mission.shipped:
        print("Mission SHIPPED — cleared the Shackle policy gate and the Iron Law gate. On it, done.")
        return 0
    if mission.hitl_required:
        print(f"Mission PAUSED for human review — {mission.blocked_reason}")
        return 2
    print(f"Mission BLOCKED — {mission.blocked_reason}")
    return 1


def cmd_shackle(args: argparse.Namespace) -> int:
    from .shackle import Governor, GovernorConfig
    gov = Governor(GovernorConfig(budget_usd=args.budget, max_repeat_calls=3))
    print(f"{TAGLINE}\nShackle Governor — budget ${args.budget:.2f}, repeat limit 3\n")
    actions = [
        ("web.search", 0.02), ("web.search", 0.02), ("web.search", 0.02),
        ("llm.generate", args.budget), ("email.send", 0.0),
    ]
    for name, cost in actions:
        verdict, reason = gov.evaluate(name, cost_usd=cost)
        print(f"  {verdict:>5}  {name:<14} (${cost:.2f})  — {reason}")
    print(f"\n  Audit ledger: {len(gov.ledger)} rulings · chain intact: {gov.ledger.verify()}")
    return 0


def cmd_shackle_rules(args: argparse.Namespace) -> int:
    """SYNERGY #11 demo."""
    from .shackle_rules import ShackleValidator
    validator = ShackleValidator.from_path(args.rules)
    print(f"{TAGLINE}\nSHACKLE declarative rules — standard={validator.standard} version={validator.version}\n")
    print(f"Loaded {len(validator.rules)} rule(s).")
    demo_cases = [
        (["human_harm"], {}),
        (["consent_given"], {}),
        (["github_write", "public_repo"], {}),
        ([], {"environment": "production"}),
    ]
    for tags, params in demo_cases:
        vetoes = validator.validate(tags=tags, params=params)
        verdict = "VETO" if vetoes else "clear"
        print(f"  tags={tags} params={params} -> {verdict} {vetoes}")
    return 0


def cmd_ethics(args: argparse.Namespace) -> int:
    """SYNERGY #12 demo."""
    from .ethics import EthicsEngine
    engine = EthicsEngine(threshold=args.threshold)
    print(f"{TAGLINE}\nEthics engine — threshold {args.threshold}\n")
    demo_cases = [
        ["consent_given", "human_safety"],
        ["privacy_violation", "deception"],
        ["no_harm", "transparency", "privacy_respect"],
    ]
    for tags in demo_cases:
        outcome, score = engine.evaluate(tags)
        print(f"  tags={tags} -> score={score} -> {outcome}")
    return 0


def cmd_conformance(args: argparse.Namespace) -> int:
    """SYNERGY #20 demo — run the conformance suite, print + save a certificate."""
    from .conformance import ConformanceRunner, issue_certificate
    report = ConformanceRunner().run()
    print(f"{TAGLINE}\n{report.summary_line()}\n")
    for cr in report.clause_results:
        status = "PASS" if cr.passed else "FAIL"
        print(f"  [{status}] {cr.clause} ({cr.level}) — {cr.title}")
        for f in cr.failures:
            print(f"      - {f}")
    cert = issue_certificate(report)
    print(f"\nCertificate digest: {cert['digest']}")
    return 0 if report.verdict == "CONFORMANT" else 1


def cmd_swarm_demo(args: argparse.Namespace) -> int:
    """SYNERGY #17 demo."""
    from .swarm import AgentDescriptor, SwarmCoordinator, SwarmTask
    coord = SwarmCoordinator()
    coord.register(AgentDescriptor(agent_id="worker-1", capabilities=["chat", "chain"]))
    coord.register(AgentDescriptor(agent_id="worker-2", capabilities=["chain", "browser"]))
    tasks = [
        SwarmTask(task_id="mission-1", required_capabilities=["chat"], priority=2),
        SwarmTask(task_id="mission-2", required_capabilities=["browser"], priority=1),
        SwarmTask(task_id="mission-3", required_capabilities=["vision"], priority=1),
    ]
    assignments = coord.allocate(tasks)
    print(f"{TAGLINE}\nSwarm coordinator demo\n")
    for a in assignments:
        print(f"  {a.task_id} -> {a.agent_id or '(unassigned)'} ({a.reason})")
    print(f"\n  {coord.status_summary()}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="onitsir", description=TAGLINE)
    p.add_argument("--data", default=None, help="Path to roster.json (optional)")
    p.add_argument("--crew-size", type=int, default=3, help="Specialists per mission")
    sub = p.add_subparsers(dest="command", required=True)

    sub.add_parser("roster", help="Show roster stats").set_defaults(func=cmd_roster)

    c = sub.add_parser("crew", help="Preview staffed crew for a goal")
    c.add_argument("goal")
    c.set_defaults(func=cmd_crew)

    r = sub.add_parser("run", help="Run a demo mission end to end")
    r.add_argument("goal")
    r.set_defaults(func=cmd_run)

    sk = sub.add_parser("shackle", help="Demo the Shackle governance gate")
    sk.add_argument("--budget", type=float, default=0.05)
    sk.set_defaults(func=cmd_shackle)

    skr = sub.add_parser("shackle-rules", help="Demo the declarative veto layer (Synergy #11)")
    skr.add_argument("--rules", default=None)
    skr.set_defaults(func=cmd_shackle_rules)

    et = sub.add_parser("ethics", help="Demo additive ethics scoring (Synergy #12)")
    et.add_argument("--threshold", type=int, default=0)
    et.set_defaults(func=cmd_ethics)

    cf = sub.add_parser("conformance", help="Run the conformance suite (Synergy #20)")
    cf.set_defaults(func=cmd_conformance)

    sw = sub.add_parser("swarm-demo", help="Demo the swarm coordinator (Synergy #17)")
    sw.set_defaults(func=cmd_swarm_demo)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv if argv is not None else sys.argv[1:])
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
