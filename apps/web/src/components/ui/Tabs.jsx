/**
 * CE Tabs: accessible tablist with roving tabindex + arrow keys.
 * Headless contract: tabs = [{ id, label }], value, onChange.
 */

import { useRef } from "react";

export default function Tabs({ tabs, value, onChange, label }) {
  const refs = useRef([]);

  function onKey(event, index) {
    let next = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== null) {
      event.preventDefault();
      onChange(tabs[next].id);
      refs.current[next]?.focus();
    }
  }

  return (
    <div className="ce-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          tabIndex={value === tab.id ? 0 : -1}
          className="ce-tab"
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => onKey(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
