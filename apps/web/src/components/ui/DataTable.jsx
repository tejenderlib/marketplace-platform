/**
 * CE DataTable: shared table shell promoted from .admin-table.
 * Headless contract: columns = [{ key, label, numeric? }], rows = arrays.
 * Empty/error slots use CE states with baked-in roles.
 */

import EmptyState, { ErrorState, LoadingState } from "./States.jsx";

export default function DataTable({
  columns,
  rows,
  loading,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyHint,
  emptyAction,
  caption,
}) {
  if (loading) return <LoadingState label="Loading…" />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows || rows.length === 0) {
    return (
      <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />
    );
  }
  return (
    <div className="ce-table-scroll">
      <table className="ce-table">
        {caption ? <caption className="ce-visually-hidden">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.numeric ? "ce-num" : ""} scope="col">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key ?? i}>
              {columns.map((col) => (
                <td key={col.key} className={col.numeric ? "ce-num" : ""}>
                  {row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
