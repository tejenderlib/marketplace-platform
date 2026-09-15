import { formatTime } from "./format.js";

/** Single chat bubble with sender hierarchy + readable timestamp. */
export default function MessageBubble({ message, mine }) {
  return (
    <div className={mine ? "bubble mine" : "bubble theirs"}>
      <p>{message.body}</p>
      <span className="muted small">{formatTime(message.created_at)}</span>
    </div>
  );
}
