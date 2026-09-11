import { useState } from "react";

import { formatPrice } from "../../data/listings.js";
import {
  EmptyState,
  ErrorState,
  FilterSelect,
  Loading,
  Pagination,
  formatDateTime,
  useAdminData,
} from "../components/ui.jsx";

const STATUSES = ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "SETTLED", "CANCELLED"];
const LIMIT = 20;

export function AuctionsPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/auctions", {
    limit: LIMIT,
    offset,
    status,
  });

  return (
    <div>
      <h1>Auctions</h1>
      <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); setOffset(0); }} options={STATUSES} />
      {loading && <Loading label="Loading auctions…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.length === 0 && <EmptyState message="No auctions match this filter." />}
      {data && data.length > 0 && (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Status</th>
                <th>Current bid</th>
                <th>Bids</th>
                <th>Ends</th>
              </tr>
            </thead>
            <tbody>
              {data.map((auction) => (
                <tr key={auction.id}>
                  <td><a href={`#/admin/auctions/${auction.id}`}>{auction.listing_title}</a></td>
                  <td><span className="pill">{auction.status}</span></td>
                  <td>{auction.current_bid_minor != null ? formatPrice(auction.current_bid_minor) : "—"}</td>
                  <td>{auction.bid_count}</td>
                  <td>{formatDateTime(auction.ends_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.length >= LIMIT && (
        <Pagination total={offset + data.length + (data.length >= LIMIT ? 1 : 0)} limit={LIMIT} offset={offset} onChange={setOffset} />
      )}
    </div>
  );
}

export function AuctionDetailPage({ id }) {
  const { loading, error, data, reload } = useAdminData(`/admin/auctions/${id}`);

  if (loading) return <Loading label="Loading auction…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="Auction not found." />;

  return (
    <div>
      <a className="back-link" href="#/admin/auctions">← Back to auctions</a>
      <h1>{data.listing_title}</h1>
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Auction</h2>
          <dl className="kv">
            <dt>Status</dt><dd><span className="pill">{data.status}</span></dd>
            <dt>Starting bid</dt><dd>{formatPrice(data.starting_bid_minor)}</dd>
            <dt>Min. increment</dt><dd>{formatPrice(data.minimum_increment_minor)}</dd>
            <dt>Current bid</dt>
            <dd>{data.current_bid_minor != null ? formatPrice(data.current_bid_minor) : "—"}</dd>
            <dt>Bid count</dt><dd>{data.bid_count}</dd>
            <dt>Starts</dt><dd>{formatDateTime(data.starts_at)}</dd>
            <dt>Ends</dt><dd>{formatDateTime(data.ends_at)}</dd>
            <dt>Settled</dt><dd>{formatDateTime(data.settled_at)}</dd>
          </dl>
        </div>
        <div className="detail-card">
          <h2>Result &amp; settlement</h2>
          <dl className="kv">
            <dt>Result</dt><dd>{data.result_status ?? "No result yet"}</dd>
            <dt>Winner</dt><dd className="mono small">{data.result_winner_id ?? "—"}</dd>
            <dt>Final price</dt>
            <dd>{data.result_final_price_minor != null ? formatPrice(data.result_final_price_minor) : "—"}</dd>
            <dt>Decided</dt><dd>{formatDateTime(data.result_decided_at)}</dd>
            <dt>Seller</dt><dd>{data.seller_display_name ?? data.seller_id}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
