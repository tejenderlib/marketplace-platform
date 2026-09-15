/**
 * Generic selectable list of the user's real records (orders, payments,
 * listings, offers). Items: { id, title, ref, meta, sub, pill? } where
 * pill is { text, className }. Single-select radio behaviour.
 */
export default function ContextObjectPicker({
  items,
  selectedId,
  onSelect,
  legend,
  describedBy,
}) {
  return (
    <fieldset className="support-picker">
      <legend>{legend}</legend>
      <ul aria-describedby={describedBy}>
        {items.map((item) => {
          const active = selectedId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={active ? "support-pick is-active" : "support-pick"}
                aria-pressed={active}
                onClick={() => onSelect(item.id)}
              >
                <span className="support-pick-main">
                  <strong>{item.title}</strong>
                  <span className="muted small">{item.ref}</span>
                  {item.meta && <span className="muted small">{item.meta}</span>}
                  {item.sub && <span className="muted small">{item.sub}</span>}
                </span>
                {item.pill && <span className={item.pill.className}>{item.pill.text}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
