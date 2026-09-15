/**
 * Saved-address radio list + new-address form, shared verbatim behavior
 * across fixed-price, offer, and auction checkouts. `lockSelection`
 * disables only the saved-address radios (offer flow); the form keeps its
 * own required semantics per page.
 */
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
    <section className="co-card" aria-labelledby="co-address-heading">
      <h2 id="co-address-heading">Delivery address</h2>
      {addresses.loading && <p className="muted">Loading addresses…</p>}
      {addresses.error && <p className="form-error">{addresses.error}</p>}
      {!addresses.loading && addresses.items.length === 0 && !showNew && (
        <p className="muted">No saved addresses yet — add one below.</p>
      )}
      {addresses.items.map((addr) => (
        <label key={addr.id} className="address-option">
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
      <button type="button" className="btn btn-ghost" onClick={onToggleNew}>
        {showNew ? "Hide new address" : "Add new address"}
      </button>

      {showNew && (
        <div className="co-new-address">
          <h3>New address (India only)</h3>
          <div className="form-grid">
            <label>
              <span>
                Recipient <span className="req" aria-hidden="true">*</span>
              </span>
              <input
                value={newAddress.recipient_name}
                onChange={(event) => onNewChange("recipient_name", event.target.value)}
                required={showNew}
                autoComplete="name"
              />
            </label>
            <label>
              <span>
                Address line 1 <span className="req" aria-hidden="true">*</span>
              </span>
              <input
                value={newAddress.line1}
                onChange={(event) => onNewChange("line1", event.target.value)}
                required={showNew}
                autoComplete="street-address"
              />
            </label>
            <label>
              <span>
                City <span className="req" aria-hidden="true">*</span>
              </span>
              <input
                value={newAddress.city}
                onChange={(event) => onNewChange("city", event.target.value)}
                required={showNew}
                autoComplete="address-level2"
              />
            </label>
            <label>
              <span>State</span>
              <input
                value={newAddress.region}
                onChange={(event) => onNewChange("region", event.target.value)}
                autoComplete="address-level1"
              />
            </label>
            <label>
              <span>PIN code</span>
              <input
                value={newAddress.postal_code}
                onChange={(event) => onNewChange("postal_code", event.target.value)}
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </label>
            <label>
              <span>Phone</span>
              <input
                value={newAddress.phone}
                onChange={(event) => onNewChange("phone", event.target.value)}
                type="tel"
                autoComplete="tel"
              />
            </label>
            <label>
              <span>Country</span>
              <select
                value={newAddress.country}
                onChange={(event) => onNewChange("country", event.target.value)}
                autoComplete="country-name"
              >
                <option value="IN">India (IN)</option>
              </select>
            </label>
          </div>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onSave}>
            Save address
          </button>
        </div>
      )}
    </section>
  );
}
