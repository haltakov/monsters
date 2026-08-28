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
  if (!storage) {
    let memory: string | null = null;
    return {
      read: () => memory,
      write: (token) => {
        memory = token;
      },
      clear: () => {
        memory = null;
      },
    };
  }
  return {
    read: () => {
      try {
        return storage.getItem(GUEST_TOKEN_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    write: (token) => {
      try {
        storage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
      } catch {
        // Private browsing: the guest simply will not resume next time.
      }
    },
    clear: () => {
      try {
        storage.removeItem(GUEST_TOKEN_STORAGE_KEY);
      } catch {
        // Nothing else to do.
      }
    },
  };
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
