import { formatPrice } from "../../data/listings.js";
import ListingCard from "../marketplace/ListingCard.jsx";
import Button from "../ui/Button.jsx";
import { conditionLabel, toMinor } from "./shared.js";

function money(rupees) {
  const minor = toMinor(rupees);
  return minor == null ? "—" : formatPrice(minor);
}

/** Step 4: live preview (reuses ListingCard) + Save Draft / Publish. */
export default function PreviewStep({
  form,
  categoryName,
  images,
  listingId,
  busy,
  submitState,
  onSave,
  onSubmit,
}) {
  const ordered = [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const primary = ordered.find((img) => img.is_primary) ?? ordered[0] ?? null;
  const previewListing = {
    id: listingId ?? "preview",
    title: form.title.trim() || "Your listing title",
    priceLabel:
      form.sale_type === "FIXED_PRICE"
        ? money(form.price_rupees)
        : "Bids open",
    priceNote: form.sale_type === "AUCTION" ? "Auction" : null,
    location: [form.city.trim(), form.region.trim()].filter(Boolean).join(", ") || "—",
    saleType: form.sale_type,
    isAuction: form.sale_type === "AUCTION",
    condition: conditionLabel(form.condition),
    categoryId: form.category_id,
    categoryName,
    sellerId: null,
    sellerName: "You",
    imageCount: images.length,
    primaryImage: primary,
    images: ordered,
    auction: null,
    status: "DRAFT",
  };

  return (
    <div className="ce-form">
      <div className="ce-preview-grid">
        <div>
          <ListingCard listing={previewListing} isFavorite={false} onToggleFavorite={() => {}} preview authed />
          <p className="ce-hint">Card preview — how buyers will see it in results.</p>
        </div>
        <dl className="ce-facts">
          <div>
            <dt>Title</dt>
            <dd>{form.title.trim() || "—"}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{categoryName}</dd>
          </div>
          <div>
            <dt>Condition</dt>
            <dd>{conditionLabel(form.condition)}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{previewListing.location}</dd>
          </div>
          {form.sale_type === "FIXED_PRICE" ? (
            <>
              <div>
                <dt>Price</dt>
                <dd>{money(form.price_rupees)}</dd>
              </div>
              <div>
                <dt>Offers</dt>
                <dd>{form.offers_enabled ? "Allowed" : "Not allowed"}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Starting bid</dt>
                <dd>{money(form.starting_rupees)}</dd>
              </div>
              <div>
                <dt>Min. increment</dt>
                <dd>{money(form.increment_rupees)}</dd>
              </div>
              <div>
                <dt>Reserve</dt>
                <dd>{String(form.reserve_rupees ?? "").trim() === "" ? "None" : money(form.reserve_rupees)}</dd>
              </div>
              <div>
                <dt>Starts</dt>
                <dd>{form.starts_at ? new Date(form.starts_at).toLocaleString() : "—"}</dd>
              </div>
              <div>
                <dt>Ends</dt>
                <dd>{form.ends_at ? new Date(form.ends_at).toLocaleString() : "—"}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Images</dt>
            <dd>{images.length} photo{images.length === 1 ? "" : "s"}</dd>
          </div>
        </dl>
      </div>

      {submitState?.error && (
        <p className="ce-error" role="alert">
          {submitState.error}
        </p>
      )}
      {submitState?.ok && (
        <p className="ce-ok" role="status">
          {submitState.ok}
        </p>
      )}

      <div className="ce-sell-actions">
        <Button variant="ghost" disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : "Save Draft"}
        </Button>
        <Button variant="primary" disabled={busy} onClick={onSubmit}>
          {busy ? "Publishing…" : "Publish Listing"}
        </Button>
      </div>
      <p className="ce-hint">
        Publishing makes the listing live immediately — buyers can see and purchase it right away.
      </p>
    </div>
  );
}
