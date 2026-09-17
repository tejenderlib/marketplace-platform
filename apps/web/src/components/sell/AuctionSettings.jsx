import { toLocalInput } from "./shared.js";

export const AUCTION_DURATIONS = [
  { days: 1, label: "1 Day" },
  { days: 3, label: "3 Days" },
  { days: 5, label: "5 Days" },
  { days: 7, label: "7 Days" },
  { days: 14, label: "14 Days" },
];

function Field({ label, required, error, hint, children, htmlFor }) {
  return (
    <label className="ce-field" htmlFor={htmlFor}>
      <span>
        {label} {required && <span aria-hidden="true">*</span>}
        {!required && <span className="ce-hint"> (optional)</span>}
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
 * AuctionSettings: starting bid, minimum increment, duration preset and an
 * optional reserve. Durations map to the backend's starts_at/ends_at
 * datetimes (auction starts now); the API contract is unchanged.
 */
export default function AuctionSettings({ form, errors, onChange }) {
  function applyDuration(days) {
    const value = Number(days);
    if (!Number.isFinite(value) || value <= 0) return;
    const now = new Date();
    const end = new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
    onChange("duration_days", String(value));
    onChange("starts_at", toLocalInput(now.toISOString()));
    onChange("ends_at", toLocalInput(end.toISOString()));
  }

  return (
    <div className="sell-auction">
      <div className="ce-form-row">
        <Field label="Starting Bid Price (₹)" required error={errors.starting_rupees} htmlFor="sell-auction-start">
          <input
            id="sell-auction-start"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={form.starting_rupees}
            onChange={(event) => onChange("starting_rupees", event.target.value)}
            placeholder="e.g. 5000"
            aria-invalid={errors.starting_rupees ? true : undefined}
          />
        </Field>
        <Field label="Minimum Bid Increment (₹)" required error={errors.increment_rupees} htmlFor="sell-auction-incr">
          <input
            id="sell-auction-incr"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={form.increment_rupees}
            onChange={(event) => onChange("increment_rupees", event.target.value)}
            placeholder="e.g. 250"
            aria-invalid={errors.increment_rupees ? true : undefined}
          />
        </Field>
      </div>
      <div className="ce-form-row">
        <Field label="Auction Duration" required error={errors.ends_at} htmlFor="sell-auction-duration">
          <select
            id="sell-auction-duration"
            value={form.duration_days ?? ""}
            onChange={(event) => applyDuration(event.target.value)}
            aria-invalid={errors.ends_at ? true : undefined}
          >
            <option value="">Select duration…</option>
            {AUCTION_DURATIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Reserve price (₹)"
          error={errors.reserve_rupees}
          hint="Optional. Bids below the reserve cannot win."
          htmlFor="sell-auction-reserve"
        >
          <input
            id="sell-auction-reserve"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={form.reserve_rupees}
            onChange={(event) => onChange("reserve_rupees", event.target.value)}
            placeholder="Leave blank for none"
          />
        </Field>
      </div>
      {form.starts_at && form.ends_at && (
        <p className="ce-hint">
          Runs {new Date(form.starts_at).toLocaleString()} → {new Date(form.ends_at).toLocaleString()}.
        </p>
      )}
    </div>
  );
}
