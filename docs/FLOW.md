# System & Business Flows

Main flows of the marketplace-platform, described with the actual statuses,
endpoints, and state transitions implemented in the code. All endpoints are
under `/api/v1`.

Legend: `(lazy)` = flipped lazily on the next read/action touching the row;
buyer/seller/admin roles are server-side (`ADMIN` from role rows only).

## High-level system architecture

```mermaid
flowchart LR
    Browser[Browser] --> Web[React / Vite SPA]
    Web -->|REST /api/v1| API[FastAPI modular monolith]
    Web <-.|WebSocket push /api/v1/ws| API
    API -->|SQLAlchemy 2.x + Alembic| DB[(PostgreSQL 17)]
    API --> PAY[DummyPaymentProvider]
    API --> STORE[Local storage abstraction<br/>storage_key references]
```

One API process owns all domain modules (identity, catalog, trading,
orders, admin, notifications, messaging, reports, reviews, support, ws)
and one PostgreSQL database. Redis/queues are intentionally absent (see
[DECISIONS.md](DECISIONS.md) §12).

## Registration / login

```text
POST /auth/register  -> users row (BUYER role, password bcrypt hash)
POST /auth/login     -> access JWT (15 min) + refresh token (hashed row, 30 d)
POST /auth/refresh   -> rotate refresh token (new row, same family_id);
                        reuse of a rotated token revokes the whole family
POST /auth/logout    -> revoke current refresh token
```

```mermaid
flowchart TD
    R[POST /auth/register] --> U[User row created<br/>BUYER role, bcrypt hash]
    L[POST /auth/login] --> A{Rate limit ok?<br/>IP + failed-attempt counters}
    A -- no --> R429[429 Too Many Requests]
    A -- yes --> C{Credentials + ACTIVE user?}
    C -- no --> F[Failed counter +1]
    C -- yes --> T[Access JWT 15 min<br/>+ refresh token 30 d, hashed]
    T --> RF[POST /auth/refresh]
    RF --> ROT[Rotate: new row, same family_id]
    ROT --> REUSE{Rotated token reused?}
    REUSE -- yes --> REV[Revoke entire family]
    REUSE -- no --> NEW[New access + refresh pair]
```

Suspended users cannot log in.

## Fixed-price purchase (Buy Now)

```mermaid
flowchart TD
    S[Seller: POST /catalog/listings<br/>DRAFT, FIXED_PRICE, fixed_price_minor] --> SUB[submit]
    SUB --> PR[PENDING_REVIEW]
    ADM[Admin: approve] --> ACT[listing ACTIVE]
    B[Buyer: POST /checkout/fixed-price] --> LOCK{{Lock listing FOR UPDATE<br/>must be ACTIVE}}
    LOCK --> O[Order PENDING_PAYMENT<br/>source FIXED_PRICE<br/>price = listing.fixed_price_minor<br/>checkout_expires_at stamped]
    O --> RES[listing ACTIVE -> RESERVED]
    RES --> PAY[POST /orders/id/payment]
    PAY -- success --> OK[Order PAID, listing SOLD]
    PAY -- failure --> PFAIL[Order PAYMENT_FAILED<br/>listing RESERVED -> ACTIVE]
```

## Accepted-offer purchase

```text
buyer:  POST /offers          Offer(PENDING, expires_at optional)
seller: PATCH /offers/{id}    PENDING -> ACCEPTED | REJECTED  (CANCELLED = buyer withdraw)
        (lazy) past expires_at: PENDING -> EXPIRED
buyer:  POST /checkout/offer  (offer must be ACCEPTED; one order per offer)
          Order(PENDING_PAYMENT, source=ACCEPTED_OFFER, price from offer row)
          listing -> RESERVED
then:   payment flow identical to fixed price
```

## Auction lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT: seller creates auction<br/>on an AUCTION listing
    DRAFT --> SCHEDULED: schedule (starts_at set)
    SCHEDULED --> LIVE: start (at/after starts_at)
    LIVE --> ENDED: close (seller/admin endpoint, or auto-close<br/>scheduler at ends_at)
    ENDED --> SETTLED: payment success<br/>settled_at set
    note right of ENDED
        Listing must already have its auction row
        before submit/approve (two-step workflow)
    end note
```

## Bidding flow

```text
buyer:  POST /auctions/{id}/bids
          lock auction FOR UPDATE, must be LIVE and inside window
          amount >= floor (current bid + minimum increment, or starting bid)
          idempotent on (auction, bidder, request_id)
          prior WINNING bid -> OUTBID; new bid WINNING
          auction.current_bid/winner pointers updated atomically
GET     /auctions/{id}/bids    public immutable history, newest first
```

The seller cannot bid on their own auction.

## Reserve-price settlement (auction close)

```mermaid
flowchart TD
    C[POST /auctions/id/close, or background<br/>auto-close scheduler (30 s cadence)<br/>only LIVE, ends_at passed] --> L{{Lock auction;<br/>exactly one result row per auction}}
    L --> TOP[Top bid = highest amount, earliest first]
    TOP --> CMP{Compare vs reserve_minor}
    CMP -- "top >= reserve or NULL reserve" --> WON[top bid -> WON<br/>result AWAITING_CHECKOUT<br/>winner, final price, checkout window]
    CMP -- "0 bids, or top < reserve" --> NB[result NO_BIDS<br/>no winner, no WON flips,<br/>no checkout state]
    WON --> ST[auction LIVE -> ENDED]
    NB --> ST2[auction LIVE -> ENDED<br/>listing stays ACTIVE]
```

Below-reserve closes notify the seller "ended below your reserve price"
and emit no `AUCTION_WON` notification.

## Auction winner checkout

```text
winner: POST /checkout/auction   (result must be AWAITING_CHECKOUT,
          caller must be result.winner_id, one order per result)
  past window (lazy): result AWAITING_CHECKOUT -> PAYMENT_EXPIRED, 409
  success: result -> ORDER_CREATED; Order(PENDING_PAYMENT,
            source=AUCTION_WIN, price from result row); listing -> RESERVED
buyer:  POST /orders/{id}/payment
  success: Order -> PAID, listing -> SOLD,
           result -> PAYMENT_COMPLETED, auction -> SETTLED
  failure: Order -> PAYMENT_FAILED, listing -> ACTIVE;
           result stays ORDER_CREATED (retry allowed)
```

## Abandoned checkout expiry (all order sources)

```mermaid
flowchart TD
    READ[Read order / attempt payment] --> CHK{{Past checkout_expires_at?}}
    CHK -- no --> N[normal flow continues]
    CHK -- "yes, unpaid<br/>PENDING_PAYMENT / PAYMENT_FAILED" --> CAN[Order -> CANCELLED<br/>cancelled_at set]
    CAN --> REL[listing RESERVED -> ACTIVE<br/>reservation released]
    CAN -- AUCTION_WIN --> EXP[result -> PAYMENT_EXPIRED]
    NEXT[next buyer's checkout on same listing] --> REL2[release abandoned<br/>reservation first, then proceed]
```

## Buyer cancellation

```text
buyer: POST /orders/{id}/cancel   (must own the order)
  allowed only while PENDING_PAYMENT or PAYMENT_FAILED
  Order -> CANCELLED, listing RESERVED -> ACTIVE
  AUCTION_WIN: result -> PAYMENT_EXPIRED
```

## Order / payment lifecycle

```mermaid
stateDiagram-v2
    [*] --> PENDING_PAYMENT: checkout<br/>checkout_expires_at stamped
    PENDING_PAYMENT --> PAID: payment success
    PENDING_PAYMENT --> PAYMENT_FAILED: payment failure
    PAYMENT_FAILED --> PENDING_PAYMENT: retry re-arms,<br/>listing re-reserved
    PENDING_PAYMENT --> CANCELLED: expiry or buyer cancel
    PAYMENT_FAILED --> CANCELLED: expiry or buyer cancel
    PAID --> SHIPPED: seller POST /orders/id/ship<br/>Shipment row created
    SHIPPED --> DELIVERED: seller POST /orders/id/deliver
```

- Payments: DUMMY provider, `idempotency_key` unique, one SUCCEEDED
  payment per order (partial unique index); every transition appends an
  immutable `order_status_history` row.
- Reads: `GET /orders/me` (buyer), `GET /seller/orders` (seller),
  `GET /orders/{id}` (buyer/seller/admin).

## Seller listing lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT: create
    DRAFT --> PENDING_REVIEW: submit
    PENDING_REVIEW --> ACTIVE: admin approve
    PENDING_REVIEW --> REJECTED: admin reject (may return to DRAFT)
    ACTIVE --> RESERVED: checkout reservation
    RESERVED --> ACTIVE: release (cancel/expiry/payment failure)
    ACTIVE --> SOLD: payment success
    RESERVED --> SOLD: payment success
    ACTIVE --> EXPIRED: seller
    ACTIVE --> ARCHIVED: seller
    ACTIVE --> REMOVED: admin moderation
    REMOVED --> ACTIVE: admin restore
```

## Moderation flow (admin)

```mermaid
flowchart TD
    subgraph Listings
        LA[approve / reject / remove / restore]
    end
    subgraph Users
        US[suspend / reactivate]
    end
    subgraph Reviews
        RV[remove review -> REMOVED, kept in history]
    end
    subgraph Reports
        RP[PATCH report status]
    end
    subgraph Support
        SP[ticket assignment / status]
    end
    LA & US & RV & RP & SP --> AUD[(moderation_actions audit rows)]
    AUD --> V[GET /admin/moderation]
```

Every admin mutation writes an audit row into `moderation_actions`, kept
separate from the domain tables.

## Reviews

```text
buyer: POST /reviews  (only after DELIVERED order, one per order,
          rating 1-5 + optional text, reviews the seller)
statuses: ACTIVE -> REMOVED (admin soft removal)
reads:   public on seller profile, GET /reviews/me (author),
         GET /reviews/user/{id} (hidden REMOVED)
```

## Notifications

In-app bell fed by domain events, pushed live over WebSocket
(`/api/v1/ws`, auth via token query param). Types (enum): OFFER_RECEIVED,
OFFER_ACCEPTED, ORDER_PLACED, PAYMENT_SUCCEEDED, ORDER_SHIPPED,
ORDER_DELIVERED, AUCTION_WON, AUCTION_ENDED, OUTBID, REVIEW_RECEIVED,
LISTING_APPROVED, LISTING_REJECTED, LISTING_REMOVED, LISTING_RESTORED.

```text
GET    /notifications, /notifications/unread-count
PATCH  /notifications/{id}/read
POST   /notifications/mark-read
```

Notifications are never deleted; read state is a flag.

## Messaging

```mermaid
flowchart LR
    B[Buyer] -->|"POST /conversations<br/>start from a listing"| C[(one conversation<br/>per buyer-listing pair)]
    S[Seller] --> C
    B & S -->|GET /conversations, /conversations/{id}| C
    B & S -->|"POST /conversations/{id}/messages"| C
    P{{Participant check}} --> C
```

Messages are append-only; only participants may view or append.

## Reports

```mermaid
stateDiagram-v2
    [*] --> OPEN: user POST /reports<br/>reason from enum,<br/>target LISTING or USER
    OPEN --> UNDER_REVIEW: admin reviews
    UNDER_REVIEW --> RESOLVED
    UNDER_REVIEW --> DISMISSED
```

Admin lists via `GET /admin/reports`, updates via
`PATCH /admin/reports/{id}/status`; each status change is audited.

## Support tickets

```mermaid
stateDiagram-v2
    [*] --> OPEN: user POST /support/tickets<br/>LOW/NORMAL/HIGH/URGENT
    OPEN --> IN_PROGRESS: admin assigns
    IN_PROGRESS --> WAITING_FOR_CUSTOMER
    WAITING_FOR_CUSTOMER --> IN_PROGRESS
    IN_PROGRESS --> RESOLVED
    WAITING_FOR_CUSTOMER --> RESOLVED
    RESOLVED --> CLOSED
```

Ticket replies are thread rows in `support_ticket_messages`, visible to
the owner and admins only.
