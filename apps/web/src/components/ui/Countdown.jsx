/**
 * CE Countdown: auction time-left display. Formatting + urgency thresholds
 * extracted from AuctionPanel/ListingCard (24h amber, 2h "ending soon").
 * Ticking logic retained (1s interval); screen-reader updates are polite
 * and layout-shift free (tabular numerals); frozen at zero.
 */

import { useEffect, useState } from "react";

const DAY_MS = 24 * 60 * 60 * 1000;
const URGENT_MS = 2 * 60 * 60 * 1000;

function parts(ms) {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export default function Countdown({ endsAt, endedLabel = "Auction ended" }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!endsAt) return undefined;
    const remaining = new Date(endsAt).getTime() - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    return (
      <span className="ce-countdown ce-countdown--ended" aria-live="off">
        {endedLabel}
      </span>
    );
  }
  const urgent = ms <= URGENT_MS;
  const soon = ms <= DAY_MS;
  return (
    <span
      className={
        urgent || soon ? "ce-countdown ce-countdown--urgent" : "ce-countdown"
      }
      aria-live="polite"
    >
      {urgent ? "Ending soon · " : ""}Ends in {parts(ms)}
    </span>
  );
}
