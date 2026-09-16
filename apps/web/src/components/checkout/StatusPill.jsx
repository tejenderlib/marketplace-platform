import { statusLabel } from "./orderDisplay.js";
import Pill from "../ui/Pill.jsx";

/** Status pill with readable text (never color-only: label is always shown). */
export default function StatusPill({ status }) {
  return <Pill status={status}>{statusLabel(status)}</Pill>;
}
