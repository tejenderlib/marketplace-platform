function Field({ label, required, error, hint, children, htmlFor }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span>
        {label} {required && <span className="req" aria-hidden="true">*</span>}
        {!required && <span className="opt"> (optional)</span>}
      </span>
      {children}
      {hint && <span className="form-help">{hint}</span>}
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

/** Step 2: sale-type choice + price or auction configuration. */
export default function SaleStep({ form, errors, lockedSaleType, onChange }) {
  return (
    <div className="sell-stepbody">
      <fieldset className="sell-saletype">
        <legend>
          Sale type <span className="req" aria-hidden="true">*</span>
        </legend>
        <div className="sell-saletype-options" role="radiogroup" aria-label="Sale type">
          {[
            ["FIXED_PRICE", "Fixed price", "Sell at a set price. Buyers can also send offers."],
            ["AUCTION", "Auction", "Buyers bid against a starting price until the end time."],
          ].map(([value, label, blurb]) => (
            <label
              key={value}
              className={form.sale_type === value ? "saletype-card is-active" : "saletype-card"}
            >
              <input
                type="radio"
                name="sale-type"
                value={value}
                checked={form.sale_type === value}
                disabled={lockedSaleType}
                onChange={() => onChange("sale_type", value)}
              />
              <span>
                <strong>{label}</strong>
                <span className="form-help">{blurb}</span>
              </span>
            </label>
          ))}
        </div>
        {lockedSaleType && (
          <p className="form-help">Sale type is fixed after the draft is created.</p>
        )}
      </fieldset>

      {form.sale_type === "FIXED_PRICE" ? (
        <>
          <Field label="Price (₹)" required error={errors.price_rupees} htmlFor="sell-price">
            <input
              id="sell-price"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={form.price_rupees}
              onChange={(event) => onChange("price_rupees", event.target.value)}
              placeholder="e.g. 450000"
            />
          </Field>
          <label className="sell-check">
            <input
              type="checkbox"
              checked={form.offers_enabled}
              onChange={(event) => onChange("offers_enabled", event.target.checked)}
            />
            <span>Allow buyers to send offers on this listing</span>
          </label>
          <p className="form-help">Prices are in INR. The backend rejects anything else.</p>
        </>
      ) : (
        <>
          <div className="sell-row">
            <Field label="Starting bid (₹)" required error={errors.starting_rupees} htmlFor="sell-start">
              <input
                id="sell-start"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.starting_rupees}
                onChange={(event) => onChange("starting_rupees", event.target.value)}
                placeholder="e.g. 100000"
              />
            </Field>
            <Field label="Min. increment (₹)" required error={errors.increment_rupees} htmlFor="sell-incr">
              <input
                id="sell-incr"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={form.increment_rupees}
                onChange={(event) => onChange("increment_rupees", event.target.value)}
                placeholder="e.g. 5000"
              />
            </Field>
          </div>
          <Field
            label="Reserve price (₹)"
            error={errors.reserve_rupees}
            hint="Optional. Bidding below the reserve cannot win."
            htmlFor="sell-reserve"
          >
            <input
              id="sell-reserve"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={form.reserve_rupees}
              onChange={(event) => onChange("reserve_rupees", event.target.value)}
              placeholder="Leave blank for no reserve"
            />
          </Field>
          <div className="sell-row">
            <Field label="Starts at" required error={errors.starts_at} htmlFor="sell-starts">
              <input
                id="sell-starts"
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) => onChange("starts_at", event.target.value)}
              />
            </Field>
            <Field label="Ends at" required error={errors.ends_at} htmlFor="sell-ends">
              <input
                id="sell-ends"
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => onChange("ends_at", event.target.value)}
              />
            </Field>
          </div>
          <p className="form-help">
            The auction is created as a draft row alongside your listing; it goes
            live immediately when you publish.
          </p>
        </>
      )}
    </div>
  );
}
