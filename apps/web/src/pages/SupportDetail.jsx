import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { getTicket, getTicketMessages, replyToTicket } from "../api/support.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { humanize, ticketPriorityPill, ticketStatusBlurb, ticketStatusPill } from "../components/statusPills.js";
import TicketContextCard from "../components/support/TicketContextCard.jsx";
import TicketConversation from "../components/support/TicketConversation.jsx";

const CLOSED = ["RESOLVED", "CLOSED"];

export default function SupportDetailPage({ id, backHref = "#/support", backLabel = "Support" }) {
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
        <a className="back-link" href={backHref}>← {backLabel}</a>
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
  const blurb = ticketStatusBlurb(ticket.status);

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
      <a className="back-link" href={backHref}>← {backLabel}</a>
      <p className="muted small">Ticket #{ticket.id.slice(0, 8)}</p>
      <h1>{ticket.subject}</h1>
      <p>
        <span className={ticketStatusPill(ticket.status)}>{humanize(ticket.status)}</span>{" "}
        <span className={ticketPriorityPill(ticket.priority)}>{humanize(ticket.priority)} priority</span>
      </p>
      {blurb && <p className="muted small">{blurb}</p>}
      <TicketContextCard ticket={ticket} />
      <p className="muted small">
        Opened {formatDateTime(ticket.created_at)} · Last updated {formatDateTime(ticket.updated_at)}
      </p>

      {messages.loading && <p className="muted" role="status">Loading messages…</p>}
      {!messages.loading && messages.error && (
        <p className="form-error" role="alert">{messages.error}</p>
      )}
      <TicketConversation ticket={ticket} messages={messages.items} />

      {isClosed ? (
        <p className="muted small">This ticket is {ticket.status.toLowerCase()}. New replies are disabled.</p>
      ) : (
        <form className="thread-compose" onSubmit={handleReply}>
          {sendError && <p className="form-error" role="alert">{sendError}</p>}
          <label className="field" htmlFor="support-reply">
            <span className="visually-hidden">Reply to this ticket</span>
            <textarea
              id="support-reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add a message to your ticket…"
              rows={3}
              required
            />
            <span className="muted small" aria-live="polite">{draft.length} characters</span>
          </label>
          <button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>
            {sending ? "Sending…" : "Send reply"}
          </button>
        </form>
      )}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
