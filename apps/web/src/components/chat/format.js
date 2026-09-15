/** Shared relative/daily time helpers for chat + notifications. */

export function formatWhen(value) {
  const then = new Date(value);
  const now = new Date();
  const diffSeconds = Math.round((now - then) / 1000);
  if (Number.isNaN(diffSeconds)) return "";
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return then.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function dayGroup(value) {
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "Earlier";
  const now = new Date();
  const startOf = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(then)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Earlier";
}
