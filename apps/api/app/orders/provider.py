"""Payment provider abstraction with a dummy implementation.

Contract for future providers (Stripe/Razorpay/...): implement
``PaymentProviderBase`` and return a ``PaymentResult``. The API layer only
depends on the interface, so swapping providers never changes order
workflows. No card numbers, CVV, tokens, or secrets flow through here —
the dummy provider settles locally with generated references.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Protocol

from app.orders.models import PaymentProvider


@dataclass(frozen=True)
class PaymentResult:
    ok: bool
    provider_reference: str
    failure_code: str | None = None
    failure_message: str | None = None
    metadata: dict = field(default_factory=dict)


class PaymentProviderBase(Protocol):
    """Interface every payment provider must implement."""

    name: PaymentProvider

    def process(
        self,
        *,
        amount_minor: int,
        currency: str,
        simulate: str = "success",
    ) -> PaymentResult:
        """Settle ``amount_minor``. ``simulate`` is dummy-only (success|failure)."""
        ...


class DummyPaymentProvider:
    """Local settlement for development/testing. No external calls."""

    name = PaymentProvider.DUMMY

    def process(
        self,
        *,
        amount_minor: int,
        currency: str,
        simulate: str = "success",
    ) -> PaymentResult:
        reference = f"dummy_{uuid.uuid4().hex}"
        if simulate == "failure":
            return PaymentResult(
                ok=False,
                provider_reference=reference,
                failure_code="DUMMY_DECLINED",
                failure_message="Simulated dummy payment decline.",
                metadata={"simulated": True},
            )
        return PaymentResult(
            ok=True,
            provider_reference=reference,
            metadata={"simulated": True, "amount_minor": amount_minor, "currency": currency},
        )


def get_provider(name: PaymentProvider) -> PaymentProviderBase:
    """Resolve a provider implementation. Only DUMMY exists in this phase."""

    if name == PaymentProvider.DUMMY:
        return DummyPaymentProvider()
    raise ValueError(f"Unsupported payment provider: {name}")
