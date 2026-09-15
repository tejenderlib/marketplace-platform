import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { myReports } from "../api/reports.js";
import { useAuth } from "../auth/AuthContext.jsx";

const LIMIT = 20;

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function ReportsPage() {
  const { isAuthenticated, authFetch, redirectToLogin } = useAuth();
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setState({ loading: true, error: null, items: [], total: 0 });
    try {
      const data = await myReports(authFetch, { limit: LIMIT, offset });
      setState({ loading: false, error: null, items: data.items, total: data.total });
    } catch (err) {
      setState({
        loading: false,
        error: err instanceof ApiError ? `Could not load reports (${err.status}).` : "Network error.",
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

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="content">
      <h1>My Reports</h1>
      <p className="muted">
        Track reports you&apos;ve submitted. Moderation updates their status as things move forward.
      </p>
      {state.loading && <p className="muted" role="status">Loading…</p>}
      {!state.loading && state.error && (
        <div className="empty-state" role="alert">
          <p>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>Retry</button>
        </div>
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <div className="empty-state">
          <p>You haven&apos;t submitted any reports yet.</p>
          <a className="btn btn-primary" href="#/">Browse listings</a>
        </div>
      )}
      {state.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Reported</th>
                  <th>Reason</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((report) => (
                  <tr key={report.id}>
                    <td>
                      {report.target_type}
                      {report.target_listing_id ? " listing" : " user"}
                    </td>
                    <td><span className="pill">{report.reason}</span></td>
                    <td className="muted small">{report.details ?? "—"}</td>
                    <td><span className="pill">{report.status}</span></td>
                    <td>{formatDateTime(report.created_at)}</td>
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