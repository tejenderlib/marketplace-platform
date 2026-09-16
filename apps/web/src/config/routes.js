/**
 * Phase 1 navigation-ready destinations.
 * Home landing is the only Phase 1 surface. All other destinations are
 * declared here so CTAs never hard-code fake behavior and Phase 2+ can
 * bind real pages without touching landing components.
 *
 * Cloud-portability note: no provider-specific assumptions. Runtime
 * configuration flows through environment (see .env.example / VITE_*).
 */

export const ROUTES = {
  home: "#/",
  buy: "#/buy",
  sell: "#/sell",
  howItWorks: "#landing-features",
  login: "#/login",
  register: "#/register",
};
