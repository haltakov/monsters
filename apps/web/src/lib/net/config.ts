/**
 * The static export is built once per environment, so the API origin is a
 * build-time public variable. `NEXT_PUBLIC_API_URL` is provided as a Docker
 * build argument in production and falls back to the local dev API.
 */
export const DEFAULT_API_URL = "http://localhost:3101";

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = configured && configured.length > 0 ? configured : DEFAULT_API_URL;
  return base.replace(/\/+$/, "");
}

/**
 * Socket.IO connects to the API origin itself; the `https:` → `wss:` upgrade is
 * handled by Socket.IO once the origin scheme is correct.
 */
export function getSocketUrl(apiBaseUrl = getApiBaseUrl()) {
  try {
    const url = new URL(apiBaseUrl);
    return url.origin;
  } catch {
    return apiBaseUrl;
  }
}

export const GUEST_TOKEN_STORAGE_KEY = "monsters.guestToken";
