import { useState } from "react";

import {
  EmptyState,
  ErrorState,
  FilterBar,
  FilterSearch,
  FilterSelect,
  Loading,
  Pagination,
  formatDateTime,
  useAdminData,
} from "../components/ui.jsx";

const ACTION_TYPES = [
  "USER_SUSPENDED",
  "USER_REACTIVATED",
  "LISTING_REMOVED",
  "LISTING_RESTORED",
  "LISTING_REJECTED",
  "LISTING_APPROVED",
];
const LIMIT = 20;

export function ModerationPage() {
  const [offset, setOffset] = useState(0);
  const [actionType, setActionType] = useState("");
  const [adminId, setAdminId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetListingId, setTargetListingId] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/moderation", {
    limit: LIMIT,
    offset,
    action_type: actionType,
    admin_id: adminId,
    target_user_id: targetUserId,
    target_listing_id: targetListingId,
  });

  function clear() {
    setActionType("");
    setAdminId("");
    setTargetUserId("");
    setTargetListingId("");
    setOffset(0);
  }

  return (
    <div>
      <h1>Moderation audit</h1>
      <p className="muted">Immutable record of every moderation action. Entries cannot be edited.</p>
      <FilterBar onSubmit={() => setOffset(0)}>
        <FilterSelect label="Action" value={actionType} onChange={(v) => { setActionType(v); setOffset(0); }} options={ACTION_TYPES} />
        <FilterSearch label="Admin ID" value={adminId} onChange={(v) => { setAdminId(v); setOffset(0); }} placeholder="UUID…" />
        <FilterSearch label="Target user" value={targetUserId} onChange={(v) => { setTargetUserId(v); setOffset(0); }} placeholder="UUID…" />
        <FilterSearch label="Target listing" value={targetListingId} onChange={(v) => { setTargetListingId(v); setOffset(0); }} placeholder="UUID…" />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button type="button" className="btn btn-ghost" onClick={clear}>Clear</button>
      </FilterBar>

      {loading && <Loading label="Loading audit trail…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState message="No moderation actions match these filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Reason</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <a href={`#/admin/moderation/${item.id}`}>{item.action_type}</a>
                    </td>
                    <td className="mono small">
                      {item.target_user_id ? `user ${item.target_user_id.slice(0, 8)}…` : ""}
                      {item.target_listing_id ? `listing ${item.target_listing_id.slice(0, 8)}…` : ""}
                    </td>
                    <td>{item.reason.length > 60 ? `${item.reason.slice(0, 60)}…` : item.reason}</td>
                    <td>{formatDateTime(item.created_at)}</td>
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

export function ModerationDetailPage({ id }) {
  const { loading, error, data, reload } = useAdminData(`/admin/moderation/${id}`);

  if (loading) return <Loading label="Loading audit record…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="Audit record not found." />;

  return (
    <div>
      <a className="back-link" href="#/admin/moderation">← Back to audit trail</a>
      <h1>{data.action_type}</h1>
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Record</h2>
          <dl className="kv">
            <dt>Action</dt><dd><span className="pill">{data.action_type}</span></dd>
            <dt>Admin</dt><dd className="mono small">{data.admin_id}</dd>
            <dt>Target user</dt><dd className="mono small">{data.target_user_id ?? "—"}</dd>
            <dt>Target listing</dt><dd className="mono small">{data.target_listing_id ?? "—"}</dd>
            <dt>When</dt><dd>{formatDateTime(data.created_at)}</dd>
          </dl>
        </div>
        <div className="detail-card">
          <h2>Reason</h2>
          <p>{data.reason}</p>
          {data.metadata && Object.keys(data.metadata).length > 0 && (
            <>
              <h2>Metadata</h2>
              <pre className="mono small">{JSON.stringify(data.metadata, null, 2)}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
