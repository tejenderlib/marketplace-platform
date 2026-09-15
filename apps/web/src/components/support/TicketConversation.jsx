function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Ticket conversation thread. The opening description renders as the
 * first bubble, followed by API messages in existing order. Sender
 * styling follows the existing rule: the ticket owner's messages align
 * as "mine", everything else (support) as "theirs".
 */
export default function TicketConversation({ ticket, messages }) {
  return (
    <div className="ticket-thread" aria-label="Ticket conversation">
      <div className="bubble theirs">
        <p>{ticket.description}</p>
        <span className="muted small">{formatDateTime(ticket.created_at)}</span>
      </div>
      {messages.map((message) => {
        const fromMe = message.author_id != null && message.author_id === ticket.user_id;
        return (
          <div key={message.id} className={fromMe ? "bubble mine" : "bubble theirs"}>
            <p>{message.body}</p>
            <span className="muted small">
              {message.author_id == null ? "Support · " : ""}{formatDateTime(message.created_at)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
