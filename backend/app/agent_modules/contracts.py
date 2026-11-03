"""Stable, JSON-only input/output contract for independently developed agents."""
from typing import TypedDict, NotRequired

class AgentResult(TypedDict):
    summary: str
    evidence: list[str]
    findings: list[str]
    metrics: dict[str, float]
    maintenance_assets: NotRequired[list[str]]

def fact(summary,metrics,evidence,findings)->AgentResult:
    return {'summary':summary,'metrics':metrics,'evidence':evidence,'findings':findings}
