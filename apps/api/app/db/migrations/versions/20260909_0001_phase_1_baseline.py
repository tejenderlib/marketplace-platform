"""phase 1 baseline

Revision ID: 20260909_0001
Revises:
Create Date: 2026-09-09
"""

from collections.abc import Sequence


revision: str = "20260909_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create no domain tables during foundation phase."""


def downgrade() -> None:
    """Revert no domain tables during foundation phase."""
