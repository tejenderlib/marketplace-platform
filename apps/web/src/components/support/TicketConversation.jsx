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
    <div className="ce-bubbles" role="log" aria-label="Ticket conversation">
      <div className="ce-bubble">
        <p>{ticket.description}</p>
        <time>{formatDateTime(ticket.created_at)}</time>
      </div>
      {messages.map((message) => {
        const fromMe = message.author_id != null && message.author_id === ticket.user_id;
        return (
          <div key={message.id} className={fromMe ? "ce-bubble mine" : "ce-bubble"}>
            <p>{message.body}</p>
            <time>
              {message.author_id == null ? "Support · " : ""}{formatDateTime(message.created_at)}
            </time>
          </div>
        );
      })}
    </div>
  );
}
