import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { getTicket, getTicketMessages, replyToTicket } from "../api/support.js";
import { useAuth } from "../auth/AuthContext.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const CLOSED = ["RESOLVED", "CLOSED"];

export default function SupportDetailPage({ id }) {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, ticket: null });
  const [messages, setMessages] = useState({ loading: true, error: null, items: [] });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true, error: null, ticket: null });
    setMessages({ loading: true, error: null, items: [] });
    try {
      const [ticket, msgData] = await Promise.all([
        getTicket(authFetch, id),
        getTicketMessages(authFetch, id),
      ]);
      setState({ loading: false, error: null, ticket });
      setMessages({ loading: false, error: null, items: Array.isArray(msgData) ? msgData : msgData.items });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load ticket (${err.status}).` : "Network error.",
        ticket: null,
      });
      setMessages({ loading: false, error: null, items: [] });
    }
  }, [authFetch, id]);

  useEffect(() => {
    if (!isAuthenticated) {
      redirectToLogin();
      return;
    }
    load();
  }, [isAuthenticated, load, redirectToLogin]);

  if (!isAuthenticated) {
    return (
      <div className="content">
        <p className="muted">Redirecting to login…</p>
      </div>
    );
  }
  if (state.loading) return <div className="content"><p className="muted" role="status">Loading ticket…</p></div>;
  if (state.error) {
    return (
      <div className="content">
        <a className="back-link" href="#/support">← Support</a>
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      </div>
    );
  }
  if (!state.ticket) return <div className="content"><p className="muted">Ticket not found.</p></div>;

  const ticket = state.ticket;
  const isClosed = CLOSED.includes(ticket.status);

  async function handleReply(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError(null);
    try {
      await replyToTicket(authFetch, id, body);
      setDraft("");
      const [ticketAgain, msgData] = await Promise.all([
        getTicket(authFetch, id),
        getTicketMessages(authFetch, id),
      ]);
      setState((s) => ({ ...s, ticket: ticketAgain }));
      setMessages({ loading: false, error: null, items: Array.isArray(msgData) ? msgData : msgData.items });
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Could not send your reply.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="content">
      <a className="back-link" href="#/support">← Support</a>
      <h1>{ticket.subject}</h1>
      <p className="muted small">
        Opened {formatDateTime(ticket.created_at)} · Last updated {formatDateTime(ticket.updated_at)}
      </p>
      <p>
        <span className="pill">{ticket.status}</span>{" "}
        <span className="pill">{ticket.priority} priority</span>
      </p>

      {messages.loading && <p className="muted" role="status">Loading messages…</p>}
      {!messages.loading && messages.error && (
        <p className="form-error" role="alert">{messages.error}</p>
      )}
      <div className="ticket-thread">
        <div className="bubble theirs">
          <p>{ticket.description}</p>
          <span className="muted small">{formatDateTime(ticket.created_at)}</span>
        </div>
        {messages.items.map((message) => {
          const fromMe = message.author_id != null && message.author_id === state.ticket.user_id;
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

      {isClosed ? (
        <p className="muted small">This ticket is {ticket.status.toLowerCase()}. New replies are disabled.</p>
      ) : (
        <form className="thread-compose" onSubmit={handleReply}>
          {sendError && <p className="form-error" role="alert">{sendError}</p>}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a message to your ticket…"
            rows={3}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
            {sending ? "Sending…" : "Send reply"}
          </button>
        </form>
      )}
    </div>
  );
}