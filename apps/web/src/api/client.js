const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

/** Reusable authenticated fetch helper (Bearer token attached when given).
 *
 * JSON by default. For raw byte uploads (listing images) pass
 * `rawContentType` with a Blob/File body: the payload is sent as-is
 * with that Content-Type instead of being JSON-encoded.
 */
export async function apiFetch(path, { method = "GET", body, token, rawContentType } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (rawContentType) {
    headers["Content-Type"] = rawContentType;
    payload = body;
  } else {
    headers["Content-Type"] = "application/json";
    payload = body === undefined ? undefined : JSON.stringify(body);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: payload,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.detail ?? data;
    throw new ApiError(response.status, detail);
  }
  return data;
}

export { API_BASE };
