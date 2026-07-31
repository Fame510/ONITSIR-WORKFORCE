"""Pluggable evidence producers (SYNERGY #4).

Each producer implements `onitsir.verification.EvidenceProducer` and turns a
raw, domain-specific result into `Evidence` the Iron Law gate can check.
"""
from .chain_step import ChainStepEvidenceProducer
from .research import ResearchEvidenceProducer

__all__ = ["ChainStepEvidenceProducer", "ResearchEvidenceProducer"]
