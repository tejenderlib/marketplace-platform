import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "../api/client.js";
import { formatPrice } from "../data/listings.js";
import {
  findAuctionForListing,
  getAuction,
  getAuctionResult,
  listBids,
  placeBid,
} from "../api/auctions.js";
import Button from "./ui/Button.jsx";
import Countdown from "./ui/Countdown.jsx";
import Pill from "./ui/Pill.jsx";
import { EmptyState, ErrorState, LoadingState } from "./ui/States.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function countdownParts(target) {
  const ms = new Date(target).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function describeBidError(error) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Session expired. Please sign in again.";
    if (error.status === 403) return typeof error.detail === "string" ? error.detail : "You cannot bid on this auction.";
    if (error.status === 404) return "Auction not found.";
    if (error.status === 409) return typeof error.detail === "string" ? error.detail : "Auction is not accepting bids.";
    if (error.status === 422) return typeof error.detail === "string" ? error.detail : "Invalid bid.";
    return `Request failed (${error.status}). Please retry.`;
  }
  return "Network error. Is the API running?";
}

/** Display-only label for backend result states (values untouched). */
function resultStatusLabel(status) {
  switch (status) {
    case "NO_BIDS":
      return "No bids";
    case "AWAITING_CHECKOUT":
      return "Awaiting checkout";
    case "ORDER_CREATED":
      return "Order created";
    case "PAYMENT_COMPLETED":
      return "Payment completed";
    case "PAYMENT_EXPIRED":
      return "Payment expired";
    default:
      return status ?? "Pending";
  }
}

export default function AuctionPanel({
  listingId,
  isAuthenticated,
  currentUserId,
  authFetch,
  onRequireLogin,
}) {
  const [state, setState] = useState({ loading: true, error: null, auction: null });
  const [bids, setBids] = useState({ loading: true, error: null, items: [], total: 0 });
  const [result, setResult] = useState({ loading: false, error: null, data: null });
  const [bidInput, setBidInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const zeroCrossed = useRef(false);

  const loadAuction = useCallback(async () => {
    setState({ loading: true, error: null, auction: null });
    try {
      const found = await findAuctionForListing(listingId);
      setState({ loading: false, error: null, auction: found });
      return found;
    } catch (error) {
      setState({
        loading: false,
        error: error instanceof ApiError ? `Could not load auction (${error.status}).` : "Network error.",
        auction: null,
      });
      return null;
    }
  }, [listingId]);

  const loadBids = useCallback(async (auctionId) => {
    setBids({ loading: true, error: null, items: [], total: 0 });
    try {
      const page = await listBids(auctionId, { limit: 10, offset: 0 });
      setBids({ loading: false, error: null, items: page.items, total: page.total });
    } catch {
      setBids({ loading: false, error: "Could not load bids.", items: [], total: 0 });
    }
  }, []);

  const loadResult = useCallback(async (auctionId) => {
    setResult({ loading: true, error: null, data: null });
    try {
      const data = await getAuctionResult(auctionId);
      setResult({ loading: false, error: null, data });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setResult({ loading: false, error: null, data: null });
      } else {
        setResult({ loading: false, error: "Could not load result.", data: null });
      }
    }
  }, []);

  const refreshAll = useCallback(
    async (auctionId) => {
      try {
        const fresh = await getAuction(auctionId);
        setState({ loading: false, error: null, auction: fresh });
        await loadBids(auctionId);
        if (["ENDED", "SETTLED", "CANCELLED"].includes(fresh.status)) {
          await loadResult(auctionId);
        }
      } catch {
        setState({ loading: false, error: "Could not refresh auction.", auction: state.auction });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadBids, loadResult],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const found = await loadAuction();
      if (!alive) return;
      if (found) {
        await loadBids(found.id);
        if (["ENDED", "SETTLED", "CANCELLED"].includes(found.status)) {
          await loadResult(found.id);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadAuction, loadBids, loadResult]);

  // Display-only countdown tick; backend owns all bidding decisions.
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  void nowTick;

  const auction = state.auction;

  // Display-only countdown: on zero-crossing, refetch authoritative state once.
  useEffect(() => {
    if (!auction) return;
    const target = auction.status === "LIVE" ? auction.ends_at : auction.starts_at;
    if (!target) return;
    if (new Date(target).getTime() <= Date.now() && !zeroCrossed.current) {
      zeroCrossed.current = true;
      refreshAll(auction.id);
    }
    if (new Date(target).getTime() > Date.now()) {
      zeroCrossed.current = false;
    }
  }, [auction, refreshAll, nowTick]);

  async function submitBid(e) {
    e.preventDefault();
    if (!isAuthenticated) {
      onRequireLogin();
      return;
    }
    if (!auction || busy) return;
    const rupees = Number(String(bidInput).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setFeedback({ kind: "error", text: "Enter a bid amount greater than ₹0." });
      return;
    }
    const amountMinor = Math.round(rupees * 100);
    const floor =
      auction.current_bid_minor != null
        ? auction.current_bid_minor + auction.minimum_increment_minor
        : auction.starting_bid_minor;
    if (amountMinor < floor) {
      setFeedback({
        kind: "error",
        text: `Minimum accepted bid is ${formatPrice(floor)}. The backend decides.`,
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const requestId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await placeBid(authFetch, auction.id, { amount_minor: amountMinor, request_id: requestId });
      setBidInput("");
      setFeedback({ kind: "ok", text: `Bid of ${formatPrice(amountMinor)} placed.` });
      await refreshAll(auction.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onRequireLogin();
        return;
      }
      setFeedback({ kind: "error", text: describeBidError(error) });
      await refreshAll(auction.id);
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return <LoadingState label="Loading auction…" />;
  if (state.error) {
    return <ErrorState message={state.error} onRetry={() => loadAuction()} />;
  }
  if (!auction) {
    return (
      <EmptyState
        title="No auction yet"
        hint="No auction is configured for this listing yet. Check back later."
      />
    );
  }

  const minimum =
    auction.current_bid_minor != null
      ? auction.current_bid_minor + auction.minimum_increment_minor
      : auction.starting_bid_minor;
  const bidable = auction.status === "LIVE";
  const countdownTarget = auction.status === "LIVE" ? auction.ends_at : auction.starts_at;

  // Position feedback from real bid rows only (WINNING/OUTBID are backend states).
  const myBids = currentUserId != null
    ? bids.items.filter((bid) => bid.bidder_id === currentUserId)
    : [];
  const iAmWinning = myBids.some((bid) => bid.status === "WINNING");
  const countdown = countdownParts(countdownTarget);

  const STATUS_LABEL = {
    DRAFT: "Draft",
    SCHEDULED: "Scheduled",
    LIVE: "Live",
    ENDED: "Ended",
    SETTLED: "Settled",
    CANCELLED: "Cancelled",
  };

  return (
    <div className="ce-auction" id="bid-panel">
      <div className="ce-auction-head">
        <Pill status={auction.status}>
          {STATUS_LABEL[auction.status] ?? auction.status}
        </Pill>
        {auction.status === "LIVE" && countdownTarget && (
          <Countdown endsAt={countdownTarget} />
        )}
        {countdown && auction.status === "SCHEDULED" && (
          <span className="ce-small ce-muted">Starts in {countdown}</span>
        )}
      </div>
      <p className="ce-auction-current">
        <span className="ce-auction-label">Current bid</span>
        <strong className="ce-auction-value ce-tnum">
          {auction.current_bid_minor != null ? formatPrice(auction.current_bid_minor) : "No bids yet"}
        </strong>
      </p>
      <dl className="ce-auction-stats">
        <div>
          <dt>Starting bid</dt>
          <dd>{formatPrice(auction.starting_bid_minor)}</dd>
        </div>
        <div>
          <dt>Min. increment</dt>
          <dd>{formatPrice(auction.minimum_increment_minor)}</dd>
        </div>
        <div>
          <dt>Current bid</dt>
          <dd>{auction.current_bid_minor != null ? formatPrice(auction.current_bid_minor) : "No bids yet"}</dd>
        </div>
        <div>
          <dt>Bids</dt>
          <dd>{auction.bid_count}</dd>
        </div>
        <div>
          <dt>Starts</dt>
          <dd>{formatDateTime(auction.starts_at)}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{formatDateTime(auction.ends_at)}</dd>
        </div>
      </dl>

      {auction.status === "LIVE" && myBids.length > 0 && (
        <p
          className={iAmWinning ? "ce-notice" : "ce-notice ce-notice--warning"}
          role="status"
        >
          {iAmWinning
            ? "You're the highest bidder."
            : "You've been outbid — raise your bid to retake the lead."}
        </p>
      )}

      {auction.status === "LIVE" && (
        <form className="ce-form" onSubmit={submitBid}>
          <label className="ce-field">
            <span>Your bid (₹)</span>
            <input
              id="bid-input"
              type="number"
              min="1"
              step="1"
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              placeholder={`Min. ${formatPrice(minimum)}`}
              disabled={busy}
              aria-describedby="bid-floor-hint"
            />
            <span id="bid-floor-hint" className="ce-hint">
              Minimum accepted bid is {formatPrice(minimum)} (starting bid plus increment).
            </span>
          </label>
          <div className="ce-bid-row">
            <Button variant="primary" type="submit" disabled={busy} block>
              {busy ? "Placing…" : "Place Bid"}
            </Button>
          </div>
        </form>
      )}
      {auction.status === "SCHEDULED" && (
        <p className="ce-small ce-muted">Bidding opens {formatDateTime(auction.starts_at)}.</p>
      )}
      {auction.status === "DRAFT" && <p className="ce-small ce-muted">This auction is not open yet.</p>}
      {(auction.status === "ENDED" || auction.status === "SETTLED") && (
        <p className="ce-small ce-muted">Bidding has ended{auction.status === "SETTLED" ? " and the sale settled." : "."}</p>
      )}
      {auction.status === "CANCELLED" && <p className="ce-small ce-muted">This auction was cancelled.</p>}
      {feedback && (
        <p className={feedback.kind === "error" ? "ce-error" : "ce-ok"} role="status">
          {feedback.text}
        </p>
      )}

      <h3 className="ce-h3">Bid history ({bids.total})</h3>
      {bids.loading && <LoadingState label="Loading bids…" />}
      {bids.error && <p className="ce-error">{bids.error}</p>}
      {!bids.loading && !bids.error && bids.items.length === 0 && (
        <p className="ce-small ce-muted">No bids yet — be the first.</p>
      )}
      {!bids.loading && !bids.error && bids.items.length > 0 && (
        <ol className="ce-bid-history">
          {bids.items.map((bid) => (
            <li key={bid.id}>
              <span>{bid.bidder?.display_name ?? `Bidder ${bid.bidder_id.slice(0, 8)}`}</span>
              <span className="ce-bid-amount">{formatPrice(bid.amount_minor)}</span>
              <span className="ce-small ce-muted">
                {formatDateTime(bid.created_at)}
              </span>
              <Pill status={bid.status}>{bid.status}</Pill>
            </li>
          ))}
        </ol>
      )}

      {(auction.status === "ENDED" || auction.status === "SETTLED") && (
        <div className="ce-result">
          <h3 className="ce-h3">Auction result</h3>
          {result.loading && <LoadingState label="Loading result…" />}
          {result.error && <p className="ce-error">{result.error}</p>}
          {!result.loading && !result.error && !result.data && (
            <p className="ce-small ce-muted">No result published yet.</p>
          )}
          {!result.loading && !result.error && result.data && (
            <>
              <p className="ce-cluster">
                <Pill status={result.data.status}>
                  {resultStatusLabel(result.data.status)}
                </Pill>
                {result.data.final_price_minor != null && (
                  <strong className="ce-price ce-tnum">{formatPrice(result.data.final_price_minor)}</strong>
                )}
              </p>
              <dl className="ce-facts">
                {result.data.winner && (
                  <div>
                    <dt>Winner</dt>
                    <dd>{result.data.winner.display_name ?? "Winner"}</dd>
                  </div>
                )}
                {result.data.checkout_expires_at && (
                  <div>
                    <dt>Checkout until</dt>
                    <dd>{formatDateTime(result.data.checkout_expires_at)}</dd>
                  </div>
                )}
              </dl>
              {result.data.status === "PAYMENT_EXPIRED" && (
                <p className="ce-small ce-muted">
                  The winner&apos;s checkout window expired, so this sale did not complete.
                </p>
              )}
            </>
          )}
          {!result.loading && !result.error && result.data
            && result.data.status === "AWAITING_CHECKOUT"
            && isAuthenticated && currentUserId != null
            && result.data.winner_id === currentUserId && (
            <div>
              <Button
                variant="primary"
                block
                onClick={() => {
                  window.location.hash = `#/checkout/auction/${result.data.id}`;
                }}
              >
                Complete Purchase · {result.data.final_price_minor != null ? formatPrice(result.data.final_price_minor) : ""}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
