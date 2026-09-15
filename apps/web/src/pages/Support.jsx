import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { createTicket, listMyTickets } from "../api/support.js";
import { useAuth } from "../auth/AuthContext.jsx";

const LIMIT = 20;

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function SupportPage() {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "" });
  const [formError, setFormError] = useState(null);
  const [createdNote, setCreatedNote] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setState({ loading: true, error: null, items: [], total: 0 });
    try {
      const data = await listMyTickets(authFetch, { limit: LIMIT, offset });
      setState({ loading: false, error: null, items: data.items, total: data.total });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load support tickets (${err.status}).` : "Network error.",
        items: [],
        total: 0,
      });
    }
  }, [isAuthenticated, authFetch, offset]);

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

  async function handleCreate(event) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormError(null);
    setCreatedNote(null);
    try {
      const ticket = await createTicket(authFetch, {
        subject: form.subject.trim(),
        description: form.description.trim(),
      });
      setForm({ subject: "", description: "" });
      setCreatedNote(`Ticket #${ticket.id.slice(0, 8)} created.`);
      setOffset(0);
      load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create the ticket.");
    } finally {
      setCreating(false);
    }
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="content">
      <h1>Support</h1>
      <p className="muted">Something not right with an order, listing, payment or account? Open a ticket and we&apos;ll help.</p>

      {createdNote && (
        <p className="form-ok" role="status">{createdNote}</p>
      )}

      <div className="detail-card">
        <h2>Open a new ticket</h2>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <form onSubmit={handleCreate} className="stack-form">
          <label className="field">
            <span>Subject</span>
            <input
              type="text"
              value={form.subject}
              onChange={(event) => setForm((f) => ({ ...f, subject: event.target.value }))}
              placeholder="Brief summary of the issue"
              maxLength={120}
              required
            />
          </label>
          <label className="field">
            <span>Describe the issue</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              placeholder="What happened, and what were you expecting?"
              rows={4}
              required
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? "Submitting…" : "Submit ticket"}
          </button>
        </form>
      </div>

      <h2>Your tickets</h2>
      {state.loading && <p className="muted" role="status">Loading…</p>}
      {!state.loading && state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <p className="muted">You haven&apos;t opened any tickets yet.</p>
      )}
      {state.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((ticket) => (
                  <tr key={ticket.id}>
                    <td><a href={`#/support/${ticket.id}`}>{ticket.subject}</a></td>
                    <td>{formatDateTime(ticket.created_at)}</td>
                    <td><span className="pill">{ticket.status}</span></td>
                    <td><span className="pill">{ticket.priority}</span></td>
                    <td>{formatDateTime(ticket.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination storefront-pagination">
            <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)}>
              ← Prev
            </button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}