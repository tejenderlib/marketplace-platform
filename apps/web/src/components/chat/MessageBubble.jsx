import { formatTime } from "./format.js";

/** Single chat bubble with readable timestamp (never time-only context). */
export default function MessageBubble({ message, mine }) {
  return (
    <div className={mine ? "ce-bubble mine" : "ce-bubble"}>
      <p>{message.body}</p>
      <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
    </div>
  );
}
