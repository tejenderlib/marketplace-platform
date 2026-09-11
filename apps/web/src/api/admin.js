import { apiFetch } from "./client.js";
import { getToken } from "../auth/auth.js";

/** POST an admin mutation with a required reason (backend validates). */
export async function adminAction(path, reason, metadata) {
  return apiFetch(path, {
    method: "POST",
    token: getToken(),
    body: { reason, ...(metadata === undefined ? {} : { metadata }) },
  });
}

export async function fetchModeration(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) {
      query.set(key, value);
    }
  }
  const suffix = query.toString() ? `?${query}` : "";
  return apiFetch(`/admin/moderation${suffix}`, { token: getToken() });
}

export async function fetchModerationDetail(id) {
  return apiFetch(`/admin/moderation/${id}`, { token: getToken() });
}
