import { useState } from "react";

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

const REPORT_STATUS = ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"];
const TARGET_TYPES = ["LISTING", "USER"];
const LIMIT = 20;

function statusOptions() {
  return REPORT_STATUS.map((value) => ({ value, label: value.replaceAll("_", " ") }));
}

export function ReportsPage() {
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [targetType, setTargetType] = useState("");
  const [reporterId, setReporterId] = useState("");
  const { loading, error, data, reload } = useAdminData("/admin/reports", {
    limit: LIMIT,
    offset,
    status: statusFilter,
    target_type: targetType,
    reporter_id: reporterId,
  });

  return (
    <div>
      <h1>Reports</h1>
      <p className="muted">User-submitted reports, newest first. Handled under Moderation.</p>
      <FilterBar onSubmit={() => setOffset(0)}>
        <FilterSelect label="Status" value={statusFilter} onChange={(v) => { setStatusFilter(v); setOffset(0); }} options={statusOptions()} />
        <FilterSelect label="Target" value={targetType} onChange={(v) => { setTargetType(v); setOffset(0); }} options={TARGET_TYPES} />
        <FilterSearch label="Reporter" value={reporterId} onChange={(v) => { setReporterId(v); setOffset(0); }} placeholder="UUID…" />
        <button type="submit" className="btn btn-primary">Apply</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setStatusFilter(""); setTargetType(""); setReporterId(""); setOffset(0); }}>Clear</button>
      </FilterBar>

      {loading && <Loading label="Loading reports…" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.items.length === 0 && <EmptyState message="No reports match these filters." />}
      {data && data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Reason</th>
                  <th>Reporter</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <a href={`#/admin/reports/${report.id}`}>
                        {report.target_type.toLowerCase()}
                      </a>{" "}
                      <span className="mono small">
                        {(report.target_listing_id ?? report.target_user_id ?? "").slice(0, 8)}…
                      </span>
                    </td>
                    <td><span className="pill">{report.reason}</span></td>
                    <td className="mono small">{report.reporter_id.slice(0, 8)}…</td>
                    <td><span className="pill">{report.status}</span></td>
                    <td>{formatDateTime(report.created_at)}</td>
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

export function ReportDetailPage({ id }) {
  const { loading, error, data, reload } = useAdminData(`/admin/reports/${id}`);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function updateStatus(e) {
    e.preventDefault();
    if (busy || !status || status === data?.status) return;
    setBusy(true);
    setFeedback(null);
    try {
      await apiFetch(`/admin/reports/${id}/status`, { method: "PATCH", body: { status }, token: getToken() });
      setFeedback({ kind: "ok", message: `Report moved to ${status}.` });
      setStatus("");
      reload();
    } catch (err) {
      setFeedback({ ...describeActionError(err) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading report…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="Report not found." />;

  return (
    <div>
      <a className="back-link" href="#/admin/reports">← Back to reports</a>
      <h1>Report</h1>
      <ActionFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      <div className="detail-grid">
        <div className="detail-card">
          <h2>Report</h2>
          <dl className="kv">
            <dt>Reporter</dt><dd className="mono small">{data.reporter_id}</dd>
            <dt>Target</dt><dd>{data.target_type} <span className="mono small">{(data.target_listing_id ?? data.target_user_id) ?? "—"}</span></dd>
            <dt>Reason</dt><dd><span className="pill">{data.reason}</span></dd>
            <dt>Status</dt><dd><span className="pill">{data.status}</span></dd>
            <dt>Submitted</dt><dd>{formatDateTime(data.created_at)}</dd>
          </dl>
        </div>
        <div className="detail-card">
          <h2>Details</h2>
          <p>{data.details || "No additional details provided."}</p>
          <h2>Update status</h2>
          <form onSubmit={updateStatus} className="stack-form">
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={statusOptions().filter((opt) => opt.value !== data.status)}
              allLabel="Choose a status…"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !status}>
              {busy ? "Updating…" : "Update status"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}