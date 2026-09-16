/**
 * Saved-address radio list + new-address form, shared verbatim behavior
 * across fixed-price, offer, and auction checkouts. `lockSelection`
 * disables only the saved-address radios (offer flow); the form keeps its
 * own required semantics per page.
 */

import Button from "../ui/Button.jsx";

export default function AddressPicker({
  addresses,
  addressId,
  onSelect,
  showNew,
  onToggleNew,
  newAddress,
  onNewChange,
  busy,
  lockSelection,
  onSave,
}) {
  return (
    <section className="ce-card" aria-labelledby="co-address-heading">
      <h2 id="co-address-heading">Delivery address</h2>
      {addresses.loading && <p className="ce-small ce-muted" role="status">Loading addresses…</p>}
      {addresses.error && <p className="ce-error" role="alert">{addresses.error}</p>}
      {!addresses.loading && addresses.items.length === 0 && !showNew && (
        <p className="ce-small ce-muted">No saved addresses yet — add one below.</p>
      )}
      {addresses.items.map((addr) => (
        <label key={addr.id} className="ce-address-option">
          <input
            type="radio"
            name="address"
            checked={addressId === addr.id}
            onChange={() => onSelect(addr.id)}
            disabled={lockSelection}
          />
          <span>
            <strong>{addr.recipient_name}</strong> — {addr.line1}, {addr.city}
            {addr.is_default ? " · default" : ""}
          </span>
        </label>
      ))}
      <div>
        <Button variant="ghost" size="sm" onClick={onToggleNew}>
          {showNew ? "Hide new address" : "Add new address"}
        </Button>
      </div>

      {showNew && (
        <div className="ce-form">
          <h3 className="ce-h3">New address (India only)</h3>
          <div className="ce-form-row">
            <label className="ce-field">
              <span>
                Recipient <span aria-hidden="true">*</span>
              </span>
              <input
                value={newAddress.recipient_name}
                onChange={(event) => onNewChange("recipient_name", event.target.value)}
                required={showNew}
                autoComplete="name"
              />
            </label>
            <label className="ce-field">
              <span>
                Address line 1 <span aria-hidden="true">*</span>
              </span>
              <input
                value={newAddress.line1}
                onChange={(event) => onNewChange("line1", event.target.value)}
                required={showNew}
                autoComplete="street-address"
              />
            </label>
          </div>
          <div className="ce-form-row">
            <label className="ce-field">
              <span>
                City <span aria-hidden="true">*</span>
              </span>
              <input
                value={newAddress.city}
                onChange={(event) => onNewChange("city", event.target.value)}
                required={showNew}
                autoComplete="address-level2"
              />
            </label>
            <label className="ce-field">
              <span>State</span>
              <input
                value={newAddress.region}
                onChange={(event) => onNewChange("region", event.target.value)}
                autoComplete="address-level1"
              />
            </label>
          </div>
          <div className="ce-form-row">
            <label className="ce-field">
              <span>PIN code</span>
              <input
                value={newAddress.postal_code}
                onChange={(event) => onNewChange("postal_code", event.target.value)}
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </label>
            <label className="ce-field">
              <span>Phone</span>
              <input
                value={newAddress.phone}
                onChange={(event) => onNewChange("phone", event.target.value)}
                type="tel"
                autoComplete="tel"
              />
            </label>
          </div>
          <label className="ce-field">
            <span>Country</span>
            <select
              value={newAddress.country}
              onChange={(event) => onNewChange("country", event.target.value)}
              autoComplete="country-name"
            >
              <option value="IN">India (IN)</option>
            </select>
          </label>
          <div>
            <Button variant="ghost" size="sm" disabled={busy} onClick={onSave}>
              Save address
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
