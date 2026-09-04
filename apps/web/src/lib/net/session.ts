import { api, ApiError, type GuestProfile } from "./api-client";
import { GUEST_TOKEN_STORAGE_KEY } from "./config";

export type TokenStore = {
  read: () => string | null;
  write: (token: string) => void;
  clear: () => void;
};

/** Local storage is the device binding for an anonymous guest. */
export function createLocalTokenStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
): TokenStore {
  let memory: string | null = null;
  let persistent = storage;
  return {
    read: () => {
      try {
        if (persistent) memory = persistent.getItem(GUEST_TOKEN_STORAGE_KEY);
      } catch {
        persistent = null;
      }
      return memory;
    },
    write: (token) => {
      memory = token;
      try {
        persistent?.setItem(GUEST_TOKEN_STORAGE_KEY, token);
      } catch {
        // Keep the same guest in this tab when persistence is unavailable.
        persistent = null;
      }
    },
    clear: () => {
      memory = null;
      try {
        persistent?.removeItem(GUEST_TOKEN_STORAGE_KEY);
      } catch {
        persistent = null;
      }
    },
  };
}

export function createBrowserTokenStore(): TokenStore {
  try {
    return createLocalTokenStore(
      typeof window === "undefined" ? null : window.localStorage,
    );
  } catch {
    // Accessing the storage property itself can throw in restricted browsers.
    return createLocalTokenStore(null);
  }
}

export type Session = { token: string; guest: GuestProfile; resumed: boolean };

/**
 * Resumes the stored guest, or creates a new one. A stored token that the
 * server no longer recognises is discarded and replaced rather than failing.
 */
export async function resolveSession(
  store: TokenStore,
  options: { signal?: AbortSignal } = {},
): Promise<Session> {
  const stored = store.read();
  if (stored) {
    try {
      const { guest } = await api.getGuest(stored, { signal: options.signal });
      return { token: stored, guest, resumed: true };
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      store.clear();
    }
  }
  const { token, guest } = await api.bootstrapGuest({ signal: options.signal });
  store.write(token);
  return { token, guest, resumed: false };
}
