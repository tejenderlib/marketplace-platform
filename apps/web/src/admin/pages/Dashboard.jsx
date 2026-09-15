import { formatPrice } from "../../data/listings.js";
import { EmptyState, ErrorState, Loading, StatCard } from "../components/ui.jsx";
import { useAdminData } from "../components/ui.jsx";

const STATS = [
  ["total_users", "Total users", (v) => v],
  ["active_users", "Active users", (v) => v],
  ["suspended_users", "Suspended users", (v) => v],
  ["total_listings", "Total listings", (v) => v],
  ["active_listings", "Active listings", (v) => v],
  ["sold_listings", "Sold listings", (v) => v],
  ["live_auctions", "Live auctions", (v) => v],
  ["ended_auctions", "Ended auctions", (v) => v],
  ["total_orders", "Total orders", (v) => v],
  ["paid_orders", "Paid orders", (v) => v],
  ["pending_payment_orders", "Pending payment", (v) => v],
  ["failed_payment_orders", "Failed payment", (v) => v],
  ["successful_payments", "Successful payments", (v) => v],
  [
    "successful_payments_total_minor",
    "Successful payments total (INR)",
    (v) => formatPrice(v),
  ],
];

export default function Dashboard() {
  const { loading, error, data, reload } = useAdminData("/admin/dashboard");
  const removedListings = useAdminData("/admin/listings", { status: "REMOVED", limit: 1, offset: 0 });
  const openReports = useAdminData("/admin/reports", { status: "OPEN", limit: 1, offset: 0 });
  const openTickets = useAdminData("/admin/support/tickets", { status: "OPEN", limit: 1, offset: 0 });

  if (loading) return <Loading label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState message="No dashboard data." />;

  const attention = [
    {
      label: "Removed listings",
      value: removedListings.loading ? "…" : (removedListings.data?.total ?? 0),
      href: "#/admin/listings",
    },
    {
      label: "Open reports",
      value: openReports.loading ? "…" : (openReports.data?.total ?? 0),
      href: "#/admin/reports",
    },
    {
      label: "Open support tickets",
      value: openTickets.loading ? "…" : (openTickets.data?.total ?? 0),
      href: "#/admin/support",
    },
  ];

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="muted">Live marketplace statistics from the admin API.</p>
      <h2 className="admin-section-title">Needs attention</h2>
      <div className="stat-grid">
        {attention.map((item) => (
          <a key={item.label} className="stat-card stat-link" href={item.href}>
            <p className="stat-value">{item.value}</p>
            <p className="stat-label">{item.label} →</p>
          </a>
        ))}
      </div>
      <h2 className="admin-section-title">Marketplace totals</h2>
      <div className="stat-grid">
        {STATS.map(([key, label, format]) => (
          <StatCard key={key} label={label} value={format(data[key] ?? 0)} />
        ))}
      </div>
    </div>
  );
}
