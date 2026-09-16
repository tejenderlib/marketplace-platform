import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client.js";
import { myReports } from "../api/reports.js";
import { useAuth } from "../auth/AuthContext.jsx";
import Button from "../components/ui/Button.jsx";
import Pill, { pillLabel } from "../components/ui/Pill.jsx";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/States.jsx";

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
    return <p className="ce-small ce-muted">Redirecting to login…</p>;
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = Math.max(1, Math.ceil(state.total / LIMIT));

  return (
    <div className="ce-scope">
      <div className="ce-container ce-stack">
      <div>
        <p className="ce-micro ce-muted">Moderation tracking</p>
        <h1 className="ce-h1">My Reports</h1>
        <p className="ce-small ce-muted">
          Track reports you&apos;ve submitted. Moderation updates their status as things move forward.
        </p>
      </div>
      {state.loading && <LoadingState label="Loading reports…" />}
      {!state.loading && state.error && (
        <ErrorState message={state.error} onRetry={load} />
      )}
      {!state.loading && !state.error && state.items.length === 0 && (
        <EmptyState
          title="No reports yet"
          hint="You haven't submitted any reports yet."
          action={<Button variant="secondary" size="sm" href="#/">Browse listings</Button>}
        />
      )}
      {state.items.length > 0 && (
        <>
          <ul className="ce-order-list">
            {state.items.map((report) => (
              <li key={report.id} className="ce-order-card">
                <div>
                  <p className="ce-item-title">
                    {report.target_type}
                    {report.target_listing_id ? " listing" : " user"}
                  </p>
                  <p className="ce-small ce-muted">
                    {report.details ?? "No details provided."}
                  </p>
                  <p className="ce-cluster">
                    <Pill status="REPORT">{pillLabel(report.reason)}</Pill>
                    <Pill status={report.status}>{pillLabel(report.status)}</Pill>
                  </p>
                  <p className="ce-small ce-muted">Submitted {formatDateTime(report.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="ce-pagination">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setOffset(offset - LIMIT)} aria-label="Previous page">
              ← Prev
            </Button>
            <span className="ce-small ce-muted ce-tnum" aria-live="polite">Page {page} of {pages}</span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setOffset(offset + LIMIT)} aria-label="Next page">
              Next →
            </Button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
