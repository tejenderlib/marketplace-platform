import { TIMELINE_STAGES, TERMINAL_STAGES, formatDateTime, statusLabel } from "./orderDisplay.js";

/**
 * Visual order timeline derived ONLY from real data: the history audit
 * trail (to_status + created_at), created_at, and paid_at. Stages without
 * evidence stay "pending" with no timestamp — nothing is invented.
 * Cancelled/refunded orders branch off cleanly.
 */
export default function OrderTimeline({ order }) {
  const reached = new Set(
    (order.history ?? []).map((h) => h.to_status).filter(Boolean),
  );
  reached.add("PENDING_PAYMENT");
  if (order.paid_at) reached.add("PAID");

  const dateFor = (stage) => {
    if (stage === "PENDING_PAYMENT") return formatDateTime(order.created_at);
    if (stage === "PAID" && order.paid_at) return formatDateTime(order.paid_at);
    const hit = (order.history ?? []).find((h) => h.to_status === stage);
    return hit ? formatDateTime(hit.created_at) : null;
  };

  const terminal = TERMINAL_STAGES.includes(order.status) ? order.status : null;
  const currentIndex = TIMELINE_STAGES.indexOf(order.status);

  return (
    <section className="ce-card" aria-labelledby="co-timeline-heading">
      <h2 id="co-timeline-heading">Status timeline</h2>
      <ol className="ce-timeline">
        {TIMELINE_STAGES.map((stage, index) => {
          const done = reached.has(stage) || (currentIndex >= 0 && index < currentIndex);
          const current = stage === order.status;
          const date = dateFor(stage);
          return (
            <li
              key={stage}
              data-state={current ? "current" : done ? "done" : "todo"}
              aria-current={current ? "step" : undefined}
            >
              <span className="ce-timeline-dot" aria-hidden="true" />
              <div>
                <p>
                  {statusLabel(stage)}
                  {current ? " — current" : ""}
                </p>
                <p className="ce-small ce-muted">{date ?? "Pending"}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {terminal && (
        <p className="ce-small" role="status">
          This order was <strong>{statusLabel(terminal).toLowerCase()}</strong>
          {(() => {
            const hit = (order.history ?? []).find((h) => h.to_status === terminal);
            return hit ? ` on ${formatDateTime(hit.created_at)}` : "";
          })()}
          .
        </p>
      )}
    </section>
  );
}
