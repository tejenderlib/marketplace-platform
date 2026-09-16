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
    <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
      <legend className="ce-h3">{legend}</legend>
      <ul className="ce-pick-list" aria-describedby={describedBy}>
        {items.map((item) => {
          const active = selectedId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={active ? "ce-pick is-active" : "ce-pick"}
                aria-pressed={active}
                onClick={() => onSelect(item.id)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <span className="ce-small ce-muted">{item.ref}</span>
                  {item.meta && <span className="ce-small ce-muted">{item.meta}</span>}
                  {item.sub && <span className="ce-small ce-muted">{item.sub}</span>}
                </span>
                {item.pill && <span className="ce-pill">{item.pill.text}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
