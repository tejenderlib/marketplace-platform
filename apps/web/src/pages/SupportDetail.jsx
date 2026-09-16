import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { getTicket, getTicketMessages, replyToTicket } from "../api/support.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { ticketStatusBlurb } from "../components/ui/Pill.jsx";
import TicketContextCard from "../components/support/TicketContextCard.jsx";
import TicketConversation from "../components/support/TicketConversation.jsx";
import Button from "../components/ui/Button.jsx";
import Pill, { pillLabel } from "../components/ui/Pill.jsx";
import { ErrorState, LoadingState } from "../components/ui/States.jsx";

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
    return <p className="ce-small ce-muted">Redirecting to login…</p>;
  }
  if (state.loading) return <LoadingState label="Loading ticket…" />;
  if (state.error) {
    return (
      <div className="ce-stack">
        <div>
          <Button variant="ghost" size="sm" href={backHref}>← {backLabel}</Button>
        </div>
        <ErrorState message={state.error} onRetry={load} />
      </div>
    );
  }
  if (!state.ticket) return <p className="ce-small ce-muted">Ticket not found.</p>;

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
    <div className="ce-scope">
      <div className="ce-container ce-stack">
      <div>
        <Button variant="ghost" size="sm" href={backHref}>← {backLabel}</Button>
        <p className="ce-micro ce-muted">Ticket #{ticket.id.slice(0, 8)}</p>
        <h1 className="ce-h1">{ticket.subject}</h1>
        <p className="ce-cluster">
          <Pill status={ticket.status}>{pillLabel(ticket.status)}</Pill>
          <Pill status={ticket.priority}>{pillLabel(ticket.priority)} priority</Pill>
        </p>
        {blurb && <p className="ce-small ce-muted">{blurb}</p>}
      </div>
      <TicketContextCard ticket={ticket} />
      <p className="ce-small ce-muted">
        Opened {formatDateTime(ticket.created_at)} · Last updated {formatDateTime(ticket.updated_at)}
      </p>

      {messages.loading && <LoadingState label="Loading messages…" />}
      {!messages.loading && messages.error && (
        <p className="ce-error" role="alert">{messages.error}</p>
      )}
      <TicketConversation ticket={ticket} messages={messages.items} />

      {isClosed ? (
        <p className="ce-small ce-muted">This ticket is {ticket.status.toLowerCase()}. New replies are disabled.</p>
      ) : (
        <form className="ce-compose" onSubmit={handleReply}>
          {sendError && <p className="ce-error" role="alert">{sendError}</p>}
          <label className="ce-field" htmlFor="support-reply">
            <span className="ce-visually-hidden">Reply to this ticket</span>
            <textarea
              id="support-reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add a message to your ticket…"
              rows={3}
              required
              aria-describedby="support-reply-count"
            />
            <span id="support-reply-count" className="ce-hint" aria-live="polite">{draft.length} characters</span>
          </label>
          <Button variant="primary" type="submit" disabled={sending || !draft.trim()}>
            {sending ? "Sending…" : "Send reply"}
          </Button>
        </form>
      )}
      </div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}
