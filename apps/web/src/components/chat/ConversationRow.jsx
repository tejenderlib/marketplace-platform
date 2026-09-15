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
      className={active ? "conversation-item is-active" : "conversation-item"}
      onClick={() => onOpen(conv)}
      aria-current={active ? "true" : undefined}
      aria-label={`Conversation with ${conv.recipientName} about ${conv.listingTitle}`}
    >
      <span className="conversation-avatar" aria-hidden="true">
        {initial}
      </span>
      <span className="conversation-text">
        <span className="conversation-top">
          <span className="conversation-name">{conv.recipientName}</span>
          <span className="muted small">{formatWhen(conv.updated_at)}</span>
        </span>
        <span className="conversation-subject">{conv.listingTitle}</span>
      </span>
    </button>
  );
}
