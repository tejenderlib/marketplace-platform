import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "../../api/client.js";
import { getToken } from "../../auth/auth.js";
import {
  ActionFeedback,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Loading,
  Pagination,
  describeActionError,
  formatDateTime,
  useAdminData,
} from "../components/ui.jsx";

const TICKET_STATUS = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"];
const TICKET_PRIORITY = ["LOW", "NORMAL", "HIGH", "URGENT"];
const LIMIT = 20;

function labelList(values) {
  return values.map((value) => ({ value, label: value.replaceAll("_", " ") }));
}

export function SupportPage() {
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [userId, setUserId] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/support/tickets", {
    limit: LIMIT,
    offset,
    status: statusFilter,
    priority: priorityFilter,
    user_id: userId,
  });

  return (
    <div>
      <h1>Support tickets</h1>
      <p className="muted">Customer support requests. Newest first.</p>
      <FilterBar onSubmit={() => setOffset(0)}>
        <FilterSelect label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v); setOffset(0); }} options={labelList(TICKET_STATUS)} />
        <FilterSelect label="Priority" value={priorityFilter} onChange={(v) => { setPriorityFilter(v); setOffset(0); }} options={labelList(TICKET_PRIORITY)} />
        <FilterSearch label="User" value={userId} onChange={(v) => { setUserId(v); setOffset(0); }} placeholder="UUID…" />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setStatusFilter(""); setPriorityFilter(""); setUserId(""); setOffset(0); }}>Clear</button>
      </FilterBar>

      {loading && <Loading label="Loading tickets…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState message="No tickets match these filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>User</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((ticket) => (
                  <tr key={ticket.id}>
                    <td><a href={`#/admin/support/${ticket.id}`}>{ticket.subject}</a></td>
                    <td className="mono small">{ticket.user_id.slice(0, 8)}…</td>
                    <td><span className="pill">{ticket.status}</span></td>
                    <td><span className="pill">{ticket.priority}</span></td>
                    <td>{formatDateTime(ticket.created_at)}</td>
                    <td>{formatDateTime(ticket.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
    </div>
  );
}

export function SupportDetailPage({ id }) {
  const { loading, error, data, reload } = useAdminData(`/admin/support/tickets/${id}`);
  const [messages, setMessages] = useState({ loading: true, error: null, items: [] });
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const loadMessages = useCallback(async () => {
    try {
      const rows = await apiFetch(`/admin/support/tickets/${id}/messages`, { token: getToken() });
      setMessages({ loading: false, error: null, items: rows });
    } catch (err) {
      setMessages({
        loading: false,
        error: err instanceof ApiError ? `Could not load messages (${err.status}).` : "Network error.",
        items: [],
      });
    }
  }, [id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  async function updateTicket(e) {
    e.preventDefault();
    const body = {};
    if (status) body.status = status;
    if (priority) body.priority = priority;
    if (busy || !(status || priority)) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`/admin/support/tickets/${id}`, { method: "PATCH", body, token: getToken() });
      setFeedback({ kind: "ok", message: "Ticket updated." });
      setStatus("");
      setPriority("");
      reload();
    } catch (err) {
      setFeedback({ ...describeActionError(err) });
    } finally {
      setBusy(false);
    }
  }

  async function reply(e) {
    e.preventDefault();
    const body = draft.trim();
    if (busy || !body) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`/admin/support/tickets/${id}/messages`, { method: "POST", body: { body }, token: getToken() });
      setDraft("");
      setFeedback({ kind: "ok", message: "Reply sent; ticket set to WAITING_FOR_CUSTOMER." });
      const rows = await apiFetch(`/admin/support/tickets/${id}/messages`, { token: getToken() });
      setMessages({ loading: false, error: null, items: rows });
      reload();
    } catch (err) {
      setFeedback({ ...describeActionError(err) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading ticket…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="Ticket not found." />;

  const isTerminal = data.status === "RESOLVED" || data.status === "CLOSED";

  return (
    <div>
      <a className="back-link" href="#/admin/support">← Back to support</a>
      <h1>{data.subject}</h1>
      <ActionFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Ticket</h2>
          <dl className="kv">
            <dt>User</dt><dd className="mono small">{data.user_id}</dd>
            <dt>Status</dt><dd><span className="pill">{data.status}</span></dd>
            <dt>Priority</dt><dd><span className="pill">{data.priority}</span></dd>
            <dt>Opened</dt><dd>{formatDateTime(data.created_at)}</dd>
            <dt>Updated</dt><dd>{formatDateTime(data.updated_at)}</dd>
          </dl>
          <h2>Description</h2>
          <p>{data.description}</p>
        </div>
        <div className="detail-card">
          <h2>Update ticket</h2>
          <form onSubmit={updateTicket} className="stack-form">
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={labelList(TICKET_STATUS).filter((opt) => opt.value !== data.status)}
              allLabel="Keep current…"
            />
            <FilterSelect
              label="Priority"
              value={priority}
              onChange={setPriority}
              options={labelList(TICKET_PRIORITY).filter((opt) => opt.value !== data.priority)}
              allLabel="Keep current…"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || (!status && !priority)}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </form>
        </div>
      </div>

      <h2>Thread</h2>
      {messages.loading && <Loading label="Loading messages…" />}
      {messages.error && <ErrorState message={messages.error} onRetry={loadMessages} />}
      <div className="ticket-thread">
        {messages.items.map((message) => {
          const fromAdmin = message.author_id != null && message.author_id !== data.user_id;
          return (
            <div key={message.id} className={fromAdmin ? "bubble mine" : "bubble theirs"}>
              <p>{message.body}</p>
              <span className="muted small">
                {message.author_id == null ? "Customer · " : fromAdmin ? "You · " : "Customer · "}
                {formatDateTime(message.created_at)}
              </span>
            </div>
          );
        })}
      </div>

      <h2>Reply to customer</h2>
      {isTerminal ? (
        <p className="muted small">This ticket is {data.status.toLowerCase()}; replies are disabled. Reopen by setting a non-terminal status above.</p>
      ) : (
        <form className="thread-compose" onSubmit={reply}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a reply to the customer…"
            rows={3}
            required
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
            {busy ? "Sending…" : "Send reply"}
          </button>
        </form>
      )}
    </div>
  );
}