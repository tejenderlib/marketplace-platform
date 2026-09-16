/**
 * FulfillmentList: listing facts from real fields only (location,
 * condition, category, posted date, sale type). Replaces detail-facts.
 */

import { formatDateTime } from "./format.js";

export default function FulfillmentList({ listing }) {
  return (
    <dl className="ce-facts">
      <div>
        <dt>Location</dt>
        <dd>{listing.location || "—"}</dd>
      </div>
      <div>
        <dt>Condition</dt>
        <dd>{listing.condition || "—"}</dd>
      </div>
      <div>
        <dt>Category</dt>
        <dd>{listing.categoryName || "—"}</dd>
      </div>
      <div>
        <dt>Posted</dt>
        <dd>{formatDateTime(listing.createdAt)}</dd>
      </div>
      <div>
        <dt>Sale type</dt>
        <dd>{listing.isAuction ? "Auction" : "Fixed price"}</dd>
      </div>
    </dl>
  );
}
