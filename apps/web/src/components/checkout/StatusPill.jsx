import { statusLabel, statusPillClass } from "./orderDisplay.js";

/** Status pill with readable text (never color-only: label is always shown). */
export default function StatusPill({ status }) {
  return (
    <span className={statusPillClass(status)} title={`Status: ${statusLabel(status)}`}>
      {statusLabel(status)}
    </span>
  );
}
