import AuctionSettings from "./AuctionSettings.jsx";
import { CONDITIONS } from "./shared.js";

const TITLE_MAX = 180;
const DESCRIPTION_MAX = 10000;

function Field({ label, required, error, hint, count, children, htmlFor }) {
  return (
    <label className="ce-field" htmlFor={htmlFor}>
      <span>
        {label} {required && <span aria-hidden="true">*</span>}
        {!required && <span className="ce-hint"> (optional)</span>}
        {count && <span className="ce-hint"> · {count}</span>}
      </span>
      {children}
      {hint && <span className="ce-hint">{hint}</span>}
      {error && (
        <span className="ce-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * ItemDetailsForm: title, category, condition, description, price and the
 * auction toggle. Field names, validation keys and API meaning match the
 * existing sell flow (see sell/shared.js) — only the layout is new.
 * Categories are backend-driven; conditions are the backend enum labels.
 */
export default function ItemDetailsForm({ form, errors, categories, lockedSaleType, onChange }) {
  const titleLen = (form.title ?? "").trim().length;
  const descriptionLen = (form.description ?? "").length;
  const auctionEnabled = form.sale_type === "AUCTION";

  return (
    <div className="ce-form">
      <Field
        label="Title"
        required
        error={errors.title}
        count={`${titleLen}/${TITLE_MAX}`}
        htmlFor="sell-item-title"
      >
        <input
          id="sell-item-title"
          type="text"
          value={form.title}
          maxLength={TITLE_MAX}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="e.g. Solid wood dining table, seats six"
          aria-invalid={errors.title ? true : undefined}
        />
      </Field>

      <div className="ce-form-row">
        <Field label="Category" required error={errors.category_id} htmlFor="sell-item-category">
          <select
            id="sell-item-category"
            value={form.category_id}
            onChange={(event) => onChange("category_id", event.target.value)}
            aria-invalid={errors.category_id ? true : undefined}
          >
            <option value="">Select a category…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition" required error={errors.condition} htmlFor="sell-item-condition">
          <select
            id="sell-item-condition"
            value={form.condition}
            onChange={(event) => onChange("condition", event.target.value)}
            aria-invalid={errors.condition ? true : undefined}
          >
            <option value="">Select condition…</option>
            {CONDITIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="ce-form-row">
        <Field label="City" required error={errors.city} htmlFor="sell-item-city">
          <input
            id="sell-item-city"
            type="text"
            value={form.city}
            maxLength={120}
            onChange={(event) => onChange("city", event.target.value)}
            placeholder="e.g. Pune"
            aria-invalid={errors.city ? true : undefined}
          />
        </Field>
        <Field label="Region / State" error={errors.region} htmlFor="sell-item-region">
          <input
            id="sell-item-region"
            type="text"
            value={form.region}
            maxLength={120}
            onChange={(event) => onChange("region", event.target.value)}
            placeholder="e.g. Maharashtra"
          />
        </Field>
      </div>

      <div className="ce-form-row">
        <Field label="Country code" required error={errors.country_code} htmlFor="sell-item-country">
          <input
            id="sell-item-country"
            type="text"
            value={form.country_code}
            maxLength={2}
            onChange={(event) => onChange("country_code", event.target.value.toUpperCase())}
            placeholder="IN"
            aria-invalid={errors.country_code ? true : undefined}
          />
        </Field>
        <Field label="Postal code" error={errors.postal_code} htmlFor="sell-item-postal">
          <input
            id="sell-item-postal"
            type="text"
            value={form.postal_code}
            maxLength={24}
            onChange={(event) => onChange("postal_code", event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Description"
        required
        error={errors.description}
        count={`${descriptionLen}/${DESCRIPTION_MAX}`}
        htmlFor="sell-item-description"
      >
        <textarea
          id="sell-item-description"
          rows={5}
          value={form.description}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="Condition, age, dimensions, what's included…"
          aria-invalid={errors.description ? true : undefined}
        />
      </Field>

      <div className="ce-form-row">
        <Field label="Price (₹)" required error={errors.price_rupees} htmlFor="sell-item-price">
          <input
            id="sell-item-price"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={form.price_rupees}
            disabled={auctionEnabled}
            onChange={(event) => onChange("price_rupees", event.target.value)}
            placeholder="e.g. 12000"
            aria-invalid={errors.price_rupees ? true : undefined}
          />
        </Field>
        <Field label="Currency" htmlFor="sell-item-currency">
          <select id="sell-item-currency" value="INR" disabled aria-describedby="sell-item-currency-hint">
            <option value="INR">INR (₹)</option>
          </select>
          <span className="ce-hint" id="sell-item-currency-hint">Prices are in INR.</span>
        </Field>
      </div>

      {!auctionEnabled && (
        <label className="ce-check">
          <input
            type="checkbox"
            checked={form.offers_enabled}
            onChange={(event) => onChange("offers_enabled", event.target.checked)}
          />
          <span>Allow buyers to send offers on this listing</span>
        </label>
      )}

      <label className="ce-check">
        <input
          type="checkbox"
          checked={auctionEnabled}
          disabled={lockedSaleType}
          onChange={(event) => onChange("sale_type", event.target.checked ? "AUCTION" : "FIXED_PRICE")}
        />
        <span>Enable Auction</span>
      </label>
      {lockedSaleType && (
        <p className="ce-hint">Sale type is fixed after the draft is created.</p>
      )}

      {auctionEnabled && (
        <AuctionSettings form={form} errors={errors} onChange={onChange} />
      )}
    </div>
  );
}
