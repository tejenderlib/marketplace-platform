import { formatWhen } from "./format.js";

/**
 * One conversation row: counterpart avatar, name, listing context, and
 * recency. No presence/typing/receipt signals exist in the API, so none
 * are rendered.
 */
export default function ConversationRow({ conv, active, onOpen }) {
  const initial = (conv.recipientName ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <button
      type="button"
      className={active ? "ce-conv is-active" : "ce-conv"}
      onClick={() => onOpen(conv)}
      aria-current={active ? "true" : undefined}
      aria-label={`Conversation with ${conv.recipientName} about ${conv.listingTitle}`}
    >
      <span className="ce-avatar" aria-hidden="true">
        {initial}
      </span>
      <span>
        <span className="ce-cluster">
          <strong>{conv.recipientName}</strong>
          <span className="ce-small ce-muted">{formatWhen(conv.updated_at)}</span>
        </span>
        <span className="ce-small ce-muted">{conv.listingTitle}</span>
      </span>
    </button>
  );
}
