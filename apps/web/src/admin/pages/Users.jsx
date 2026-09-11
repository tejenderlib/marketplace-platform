import { useState } from "react";

import { adminAction } from "../../api/admin.js";
import { ApiError } from "../../api/client.js";
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
import ModerationDialog from "../components/ModerationDialog.jsx";

const STATUSES = ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DELETED"];
const ROLES = ["BUYER", "SELLER", "ADMIN"];
const LIMIT = 20;

export function UsersPage() {
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/users", {
    limit: LIMIT,
    offset,
    status,
    role,
    q,
  });

  function reset() {
    setOffset(0);
  }

  return (
    <div>
      <h1>Users</h1>
      <FilterBar onSubmit={reset}>
        <FilterSearch label="Search" value={q} onChange={(v) => { setQ(v); }} placeholder="Email or name…" />
        <FilterSelect label="Status" value={status} onChange={(v) => { setStatus(v); reset(); }} options={STATUSES} />
        <FilterSelect label="Role" value={role} onChange={(v) => { setRole(v); reset(); }} options={ROLES} />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { setQ(""); setStatus(""); setRole(""); setOffset(0); }}
        >
          Clear
        </button>
      </FilterBar>

      {loading && <Loading label="Loading users…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState message="No users match these filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Joined</th>
                  <th>Moderation</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <UserRow key={user.id} user={user} onChanged={reload} />
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

export function UserDetailPage({ id }) {
  const { loading, error, data, reload } = useAdminData(`/admin/users/${id}`);
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState(null);

  async function runAction(kind, reason) {
    const path =
      kind === "suspend"
        ? `/admin/users/${id}/suspend`
        : `/admin/users/${id}/reactivate`;
    try {
      await adminAction(path, reason);
      setDialog(null);
      setFeedback({ kind: "ok", message: kind === "suspend" ? "User suspended." : "User reactivated." });
      reload();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
        // Session gone or state changed elsewhere: close, explain, refresh.
        setDialog(null);
        setFeedback(describeActionError(err));
        reload();
      } else {
        throw err; // dialog shows it inline and stays open
      }
    }
  }

  if (loading) return <Loading label="Loading user…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="User not found." />;
  const canSuspend = data.status === "ACTIVE" || data.status === "PENDING_VERIFICATION";
  const canReactivate = data.status === "SUSPENDED";

  return (
    <div>
      <a className="back-link" href="#/admin/users">← Back to users</a>
      <h1>{data.display_name ?? data.email}</h1>
      <ActionFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      <div className="action-row">
        {canSuspend && (
          <button type="button" className="btn btn-danger" onClick={() => setDialog("suspend")}>
            Suspend user
          </button>
        )}
        {canReactivate && (
          <button type="button" className="btn btn-primary" onClick={() => setDialog("reactivate")}>
            Reactivate user
          </button>
        )}
      </div>
      {dialog && (
        <ModerationDialog
          title={dialog === "suspend" ? "Suspend user" : "Reactivate user"}
          explanation={
            dialog === "suspend"
              ? `Suspend ${data.email}? They will be signed out immediately and blocked from authenticating. Listings, orders, and payments are preserved.`
              : `Reactivate ${data.email}? They will be able to sign in again.`
          }
          confirmLabel={dialog === "suspend" ? "Suspend" : "Reactivate"}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => runAction(dialog, reason)}
        />
      )}
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Account</h2>
          <dl className="kv">
            <dt>Email</dt><dd>{data.email}</dd>
            <dt>Status</dt><dd><span className="pill">{data.status}</span></dd>
            <dt>Roles</dt><dd>{data.roles.join(", ") || "—"}</dd>
            <dt>Joined</dt><dd>{formatDateTime(data.created_at)}</dd>
            <dt>Updated</dt><dd>{formatDateTime(data.updated_at)}</dd>
          </dl>
        </div>
        <div className="detail-card">
          <h2>Activity</h2>
          <dl className="kv">
            <dt>Listings</dt><dd>{data.listings_count}</dd>
            <dt>Orders as buyer</dt><dd>{data.buyer_orders_count}</dd>
            <dt>Orders as seller</dt><dd>{data.seller_orders_count}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, onChanged }) {
  const [dialog, setDialog] = useState(null);
  const [feedback, setFeedback] = useState(null);

  async function runAction(kind, reason) {
    try {
      await adminAction(`/admin/users/${user.id}/${kind}`, reason);
      setDialog(null);
      setFeedback({ kind: "ok", message: kind === "suspend" ? "Suspended." : "Reactivated." });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
        setDialog(null);
        setFeedback(describeActionError(err));
        onChanged();
      } else {
        throw err;
      }
    }
  }

  const canSuspend = user.status === "ACTIVE" || user.status === "PENDING_VERIFICATION";
  const canReactivate = user.status === "SUSPENDED";

  return (
    <tr>
      <td>
        <a href={`#/admin/users/${user.id}`}>
          {user.display_name ?? user.email}
        </a>
        <div className="muted small">{user.email}</div>
        {feedback && (
          <div className={feedback.kind === "ok" ? "notice-ok" : "notice-err"}>
            <span>{feedback.message}</span>
          </div>
        )}
      </td>
      <td><span className="pill">{user.status}</span></td>
      <td>{user.roles.join(", ") || "—"}</td>
      <td>{formatDateTime(user.created_at)}</td>
      <td>
        {canSuspend && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFeedback(null); setDialog("suspend"); }}>
            Suspend
          </button>
        )}
        {canReactivate && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFeedback(null); setDialog("reactivate"); }}>
            Reactivate
          </button>
        )}
        {!canSuspend && !canReactivate && <span className="muted">—</span>}
        {dialog && (
          <ModerationDialog
            title={dialog === "suspend" ? "Suspend user" : "Reactivate user"}
            explanation={
              dialog === "suspend"
                ? `Suspend ${user.email}? They will be signed out immediately. History is preserved.`
                : `Reactivate ${user.email}? They will be able to sign in again.`
            }
            confirmLabel={dialog === "suspend" ? "Suspend" : "Reactivate"}
            onCancel={() => setDialog(null)}
            onConfirm={(reason) => runAction(dialog, reason)}
          />
        )}
      </td>
    </tr>
  );
}
