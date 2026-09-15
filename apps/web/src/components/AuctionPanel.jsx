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

/** Display-only mappings for backend result states (values untouched). */
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

function resultPillClass(status) {
  switch (status) {
    case "AWAITING_CHECKOUT":
      return "pill pill-ending";
    case "ORDER_CREATED":
      return "pill pill-sold";
    case "PAYMENT_COMPLETED":
      return "pill pill-paid";
    case "PAYMENT_EXPIRED":
      return "pill pill-cancelled";
    default:
      return "pill";
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

  if (state.loading) return <p className="muted" role="status">Loading auction…</p>;
  if (state.error) {
    return (
      <div className="empty-state" role="alert">
        <p>{state.error}</p>
        <button type="button" className="btn btn-primary" onClick={() => loadAuction()}>
          Retry
        </button>
      </div>
    );
  }
  if (!auction) {
    return (
      <div className="empty-state">
        <p>No auction is configured for this listing yet. Check back later.</p>
      </div>
    );
  }

  const minimum =
    auction.current_bid_minor != null
      ? auction.current_bid_minor + auction.minimum_increment_minor
      : auction.starting_bid_minor;
  const bidable = auction.status === "LIVE";
  const countdownTarget = auction.status === "LIVE" ? auction.ends_at : auction.starts_at;
  const countdown = countdownParts(countdownTarget);
  const countdownMs = countdownTarget ? new Date(countdownTarget).getTime() - Date.now() : NaN;
  const urgent = auction.status === "LIVE" && Number.isFinite(countdownMs) && countdownMs <= 2 * 60 * 60 * 1000;

  const STATUS_LABEL = {
    DRAFT: "Draft",
    SCHEDULED: "Scheduled",
    LIVE: "Live",
    ENDED: "Ended",
    SETTLED: "Settled",
    CANCELLED: "Cancelled",
  };
  const STATUS_PILL = {
    LIVE: "pill pill-live",
    SCHEDULED: "pill",
    DRAFT: "pill",
    ENDED: "pill",
    SETTLED: "pill pill-sold",
    CANCELLED: "pill pill-cancelled",
  };

  return (
    <div className="auction-panel">
      <div className="auction-head">
        <span className={STATUS_PILL[auction.status] ?? "pill"}>
          {STATUS_LABEL[auction.status] ?? auction.status}
        </span>
        {countdown && auction.status === "LIVE" && (
          <span className={urgent ? "auction-countdown is-urgent" : "auction-countdown"}>
            Ends in {countdown}
          </span>
        )}
        {countdown && auction.status === "SCHEDULED" && (
          <span className="auction-countdown">Starts in {countdown}</span>
        )}
      </div>
      <p className="auction-current">
        <span className="auction-current-label">Current bid</span>
        <strong className="auction-current-value">
          {auction.current_bid_minor != null ? formatPrice(auction.current_bid_minor) : "No bids yet"}
        </strong>
      </p>
      <dl className="auction-stats">
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

      {auction.status === "LIVE" && (
        <form className="bid-form" onSubmit={submitBid}>
          <label htmlFor="bid-input">Your bid (₹, min. {formatPrice(minimum)})</label>
          <div className="bid-row">
            <input
              id="bid-input"
              type="number"
              min="1"
              step="1"
              value={bidInput}
              onChange={(e) => setBidInput(e.target.value)}
              placeholder={`Min. ${formatPrice(minimum)}`}
              disabled={busy}
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Placing…" : "Place Bid"}
            </button>
          </div>
        </form>
      )}
      {auction.status === "SCHEDULED" && (
        <p className="muted">Bidding opens {formatDateTime(auction.starts_at)}.</p>
      )}
      {auction.status === "DRAFT" && <p className="muted">This auction is not open yet.</p>}
      {(auction.status === "ENDED" || auction.status === "SETTLED") && (
        <p className="muted">Bidding has ended{auction.status === "SETTLED" ? " and the sale settled." : "."}</p>
      )}
      {auction.status === "CANCELLED" && <p className="muted">This auction was cancelled.</p>}
      {feedback && (
        <p className={feedback.kind === "error" ? "form-error" : "form-ok"} role="status">
          {feedback.text}
        </p>
      )}

      <h3>Bid history ({bids.total})</h3>
      {bids.loading && <p className="muted">Loading bids…</p>}
      {bids.error && <p className="form-error">{bids.error}</p>}
      {!bids.loading && !bids.error && bids.items.length === 0 && (
        <p className="muted">No bids yet — be the first.</p>
      )}
      {!bids.loading && !bids.error && bids.items.length > 0 && (
        <ol className="bid-history">
          {bids.items.map((bid) => (
            <li key={bid.id}>
              <span className="bidder">{bid.bidder?.display_name ?? `Bidder ${bid.bidder_id.slice(0, 8)}`}</span>
              <span className="bid-amount">{formatPrice(bid.amount_minor)}</span>
              <span className="bid-time">
                {formatDateTime(bid.created_at)} · {bid.status}
              </span>
            </li>
          ))}
        </ol>
      )}

      {(auction.status === "ENDED" || auction.status === "SETTLED") && (
        <div className={`result-box is-${(result.data?.status ?? "pending").toLowerCase().replace(/[^a-z]/g, "")}`}>
          <h3>Auction result</h3>
          {result.loading && <p className="muted">Loading result…</p>}
          {result.error && <p className="form-error">{result.error}</p>}
          {!result.loading && !result.error && !result.data && (
            <p className="muted">No result published yet.</p>
          )}
          {!result.loading && !result.error && result.data && (
            <>
              <p className="result-status">
                <span className={resultPillClass(result.data.status)}>{resultStatusLabel(result.data.status)}</span>
                {result.data.final_price_minor != null && (
                  <strong className="result-price">{formatPrice(result.data.final_price_minor)}</strong>
                )}
              </p>
              <dl className="kv">
                {result.data.winner && (
                  <>
                    <dt>Winner</dt>
                    <dd>{result.data.winner.display_name ?? "Winner"}</dd>
                  </>
                )}
                {result.data.checkout_expires_at && (
                  <>
                    <dt>Checkout until</dt>
                    <dd>{formatDateTime(result.data.checkout_expires_at)}</dd>
                  </>
                )}
              </dl>
              {result.data.status === "PAYMENT_EXPIRED" && (
                <p className="muted small">
                  The winner&apos;s checkout window expired, so this sale did not complete.
                </p>
              )}
            </>
          )}
          {!result.loading && !result.error && result.data
            && result.data.status === "AWAITING_CHECKOUT"
            && isAuthenticated && currentUserId != null
            && result.data.winner_id === currentUserId && (
            <button
              type="button"
              className="btn btn-bid"
              onClick={() => {
                window.location.hash = `#/checkout/auction/${result.data.id}`;
              }}
            >
              Complete Purchase · {result.data.final_price_minor != null ? formatPrice(result.data.final_price_minor) : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
