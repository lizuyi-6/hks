"""Pluggable sub-audit framework for compliance.

`RealComplianceAuditAdapter` used to hardcode the policy-radar and trademark
overlays. That made it painful to add a new "domain" audit (copyright,
cross-border, data security, …). This module turns every sub-audit into a
plug-in: each plug-in declares a ``name`` + ``category`` and emits a
``SubAuditResult`` containing extra findings, ``SourceRef`` entries, and an
optional heatmap delta.

Plug-ins register themselves via ``register_subaudit`` (or the
``@subaudit`` decorator). The main adapter iterates the registry, letting
deployments enable/disable plug-ins through a single env-var.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Protocol, runtime_checkable

from apps.api.app.schemas.common import SourceRef

logger = logging.getLogger(__name__)


@dataclass
class SubAuditContext:
    """Read-only context handed to each plug-in."""

    company: dict[str, Any]
    assets: list[dict[str, Any]]
    trace_id: str
    # Findings accumulated so far by prior plug-ins — available so a
    # later plug-in can correlate (e.g. "if trademark pending + policy shift").
    prior_findings: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SubAuditResult:
    findings: list[dict[str, Any]] = field(default_factory=list)
    source_refs: list[SourceRef] = field(default_factory=list)
    # Optional bump to the risk_heatmap dict — keys are category names,
    # values are 0-100 additions (will be clamped by the adapter).
    heatmap_delta: dict[str, int] = field(default_factory=dict)


@runtime_checkable
class ComplianceSubAudit(Protocol):
    """Runtime protocol every plug-in must satisfy."""

    name: str
    category: str

    def run(self, ctx: SubAuditContext) -> SubAuditResult: ...  # pragma: no cover


_REGISTRY: dict[str, ComplianceSubAudit] = {}


def register_subaudit(plugin: ComplianceSubAudit) -> ComplianceSubAudit:
    """Register ``plugin`` into the global sub-audit registry."""
    name = plugin.name
    if not name:
        raise ValueError("sub-audit plugin requires a non-empty name")
    if name in _REGISTRY:
        logger.debug("replacing existing sub-audit plugin: %s", name)
    _REGISTRY[name] = plugin
    return plugin


def subaudit(
    name: str, category: str
) -> Callable[[Callable[[SubAuditContext], SubAuditResult]], ComplianceSubAudit]:
    """Decorator sugar for registering plain functions as plug-ins."""

    def _wrap(fn: Callable[[SubAuditContext], SubAuditResult]) -> ComplianceSubAudit:
        class _FnPlugin:
            def __init__(self) -> None:
                self.name = name
                self.category = category

            def run(self, ctx: SubAuditContext) -> SubAuditResult:
                return fn(ctx)

        plugin = _FnPlugin()
        return register_subaudit(plugin)

    return _wrap


def enabled_subaudits() -> Iterable[ComplianceSubAudit]:
    """Iterate the enabled sub-audit plug-ins.

    Honors ``COMPLIANCE_SUBAUDITS_DISABLED`` (comma-separated list of plugin
    names) so deployments can hotfix a misbehaving plug-in without a code
    change.
    """
    disabled = {
        p.strip()
        for p in (os.getenv("COMPLIANCE_SUBAUDITS_DISABLED") or "").split(",")
        if p.strip()
    }
    for name, plugin in _REGISTRY.items():
        if name in disabled:
            continue
        yield plugin


def registered_names() -> list[str]:
    return sorted(_REGISTRY.keys())


# Import built-in plug-ins so they self-register on module load.
# Kept at bottom to avoid circular imports since plug-ins may pull in the
# provider registry themselves.
from . import builtin_plugins  # noqa: E402,F401
