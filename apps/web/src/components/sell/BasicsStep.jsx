import { CONDITIONS } from "./shared.js";

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

/** Step 1: title, category, condition, location, description. */
export default function BasicsStep({ form, errors, categories, onChange }) {
  return (
    <div className="ce-form" aria-describedby={undefined}>
      <Field label="Title" required error={errors.title} htmlFor="sell-title">
        <input
          id="sell-title"
          type="text"
          value={form.title}
          maxLength={180}
          onChange={(event) => onChange("title", event.target.value)}
          placeholder="e.g. Used 20T excavator, low hours"
          aria-describedby="sell-title-count"
          aria-invalid={errors.title ? true : undefined}
        />
        <span className="ce-hint" id="sell-title-count">{form.title.trim().length}/180 · min 3 characters</span>
      </Field>

      <div className="ce-form-row">
        <Field label="Category" required error={errors.category_id} htmlFor="sell-category">
          <select
            id="sell-category"
            value={form.category_id}
            onChange={(event) => onChange("category_id", event.target.value)}
          >
            <option value="">Select a category…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition" required error={errors.condition} htmlFor="sell-condition">
          <select
            id="sell-condition"
            value={form.condition}
            onChange={(event) => onChange("condition", event.target.value)}
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
        <Field label="City" required error={errors.city} htmlFor="sell-city">
          <input
            id="sell-city"
            type="text"
            value={form.city}
            maxLength={120}
            onChange={(event) => onChange("city", event.target.value)}
            placeholder="e.g. Pune"
          />
        </Field>
        <Field label="Region / State" error={errors.region} htmlFor="sell-region">
          <input
            id="sell-region"
            type="text"
            value={form.region}
            maxLength={120}
            onChange={(event) => onChange("region", event.target.value)}
            placeholder="e.g. Maharashtra"
          />
        </Field>
      </div>

      <div className="ce-form-row">
        <Field label="Country code" required error={errors.country_code} htmlFor="sell-country">
          <input
            id="sell-country"
            type="text"
            value={form.country_code}
            maxLength={2}
            onChange={(event) => onChange("country_code", event.target.value.toUpperCase())}
            placeholder="IN"
          />
        </Field>
        <Field label="Postal code" error={errors.postal_code} htmlFor="sell-postal">
          <input
            id="sell-postal"
            type="text"
            value={form.postal_code}
            maxLength={24}
            onChange={(event) => onChange("postal_code", event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Description"
        error={errors.description}
        hint={`${(form.description ?? "").length}/10000`}
        htmlFor="sell-description"
      >
        <textarea
          id="sell-description"
          rows={5}
          value={form.description}
          onChange={(event) => onChange("description", event.target.value)}
          placeholder="Hours used, service history, what's included…"
        />
      </Field>
    </div>
  );
}
