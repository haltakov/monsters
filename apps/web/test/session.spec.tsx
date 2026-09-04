import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_MONSTER_DNA, encodeMonsterDna } from "@monsters/game-core";
import { useGuestSession } from "@/lib/net/use-session";
import {
  createBrowserTokenStore,
  createLocalTokenStore,
  resolveSession,
} from "@/lib/net/session";
import { ApiError, api } from "@/lib/net/api-client";
import { GUEST_TOKEN_STORAGE_KEY } from "@/lib/net/config";

const DNA = encodeMonsterDna(DEFAULT_MONSTER_DNA);

const GUEST = {
  id: "guest-1",
  displayName: "Ziggy Wobble",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

const WORLD = {
  id: "world-1",
  slug: "public",
  name: "Monster Island",
  status: "active",
  tick: 12,
  population: { living: 10, eggs: 0 },
  runner: { active: true, tickRate: 10 },
};

const MONSTER = {
  id: "monster-1",
  name: "Pebble",
  species: "round",
  dna: DNA,
  generation: 0,
  parentIds: null,
  mutations: 0,
  alive: true,
  diedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  inWorld: false,
  selected: true,
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function routeFetch(
  routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>,
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.endsWith(pattern)) return Promise.resolve(handler(init));
    }
    return Promise.resolve(jsonResponse({ message: "not mocked" }, 404));
  });
}

function SessionProbe() {
  const session = useGuestSession();
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="error">{session.error ?? ""}</span>
      <span data-testid="guest">{session.guest?.displayName ?? ""}</span>
      <span data-testid="monsters">{session.monsters.length}</span>
      <button type="button" onClick={session.retry}>
        retry
      </button>
    </div>
  );
}

describe("guest session bootstrap", () => {
  it("retains a guest for retries when storage writes fail", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: vi.fn(),
    };
    const bootstrap = vi.fn(() =>
      jsonResponse({ token: "tab-token", guest: GUEST }),
    );
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/guest/bootstrap": bootstrap,
        "/api/guest/me": () => jsonResponse({ guest: GUEST }),
      }),
    );
    const store = createLocalTokenStore(storage);
    await resolveSession(store);
    expect(await resolveSession(store)).toMatchObject({
      token: "tab-token",
      resumed: true,
    });
    expect(bootstrap).toHaveBeenCalledTimes(1);
    store.clear();
    expect(store.read()).toBeNull();
  });

  it("supports browsers whose localStorage property throws", () => {
    const getter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Access denied", "SecurityError");
      });
    try {
      const store = createBrowserTokenStore();
      store.write("memory-token");
      expect(store.read()).toBe("memory-token");
      store.clear();
      expect(store.read()).toBeNull();
    } finally {
      getter.mockRestore();
    }
  });

  it("creates a guest, stores the token and loads the world", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/guest/bootstrap": () =>
          jsonResponse({ token: "fresh-token", guest: GUEST }),
        "/api/worlds/public": () => jsonResponse(WORLD),
        "/api/monsters": () =>
          jsonResponse({ monsters: [MONSTER], selectedMonsterId: MONSTER.id }),
      }),
    );

    render(<SessionProbe />);
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("ready"),
    );
    expect(screen.getByTestId("guest")).toHaveTextContent("Ziggy Wobble");
    expect(screen.getByTestId("monsters")).toHaveTextContent("1");
    expect(window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe(
      "fresh-token",
    );
  });

  it("resumes a stored token without creating a second guest", async () => {
    window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "stored-token");
    const bootstrap = vi.fn(() => jsonResponse({ token: "new", guest: GUEST }));
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/guest/bootstrap": bootstrap,
        "/api/guest/me": () => jsonResponse({ guest: GUEST }),
        "/api/worlds/public": () => jsonResponse(WORLD),
        "/api/monsters": () =>
          jsonResponse({ monsters: [], selectedMonsterId: null }),
      }),
    );

    render(<SessionProbe />);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("ready"),
    );
    expect(bootstrap).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY)).toBe(
      "stored-token",
    );
  });

  it("replaces a token the server no longer knows", async () => {
    window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, "revoked");
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/guest/me": () => jsonResponse({ message: "nope" }, 401),
        "/api/guest/bootstrap": () =>
          jsonResponse({ token: "replacement", guest: GUEST }),
        "/api/worlds/public": () => jsonResponse(WORLD),
        "/api/monsters": () =>
          jsonResponse({ monsters: [], selectedMonsterId: null }),
      }),
    );

    const store = createLocalTokenStore(window.localStorage);
    const session = await resolveSession(store);
    expect(session.token).toBe("replacement");
    expect(session.resumed).toBe(false);
    expect(store.read()).toBe("replacement");
  });

  it("surfaces an error state and recovers on retry", async () => {
    let failing = true;
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/guest/bootstrap": () =>
          failing
            ? jsonResponse({ message: "API is down" }, 503)
            : jsonResponse({ token: "later-token", guest: GUEST }),
        "/api/worlds/public": () => jsonResponse(WORLD),
        "/api/monsters": () =>
          jsonResponse({ monsters: [], selectedMonsterId: null }),
      }),
    );

    render(<SessionProbe />);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("error"),
    );
    expect(screen.getByTestId("error")).toHaveTextContent("API is down");

    failing = false;
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "retry" }));
    });
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("ready"),
    );
  });
});

describe("monster ownership calls", () => {
  it("preserves HTTP errors when a proxy sends HTML instead of JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        text: async () => "<html>Bad gateway</html>",
      })),
    );
    await expect(api.listMonsters("token")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "Request failed with 502",
    });
  });

  it("creates and edits monsters through the server with the bearer token", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return Promise.resolve(jsonResponse({ monster: MONSTER }));
    });
    vi.stubGlobal("fetch", fetchImpl);

    await api.createMonster("tok", { name: "Pebble", dna: DNA });
    await api.updateMonster("tok", "monster-1", { name: "Pebble II" });
    await api.selectMonster("tok", "monster-1");

    expect(calls[0].url).toMatch(/\/api\/monsters$/);
    expect(calls[0].init?.method).toBe("POST");
    expect(
      (calls[0].init?.headers as Record<string, string>).Authorization,
    ).toBe("Bearer tok");
    expect(calls[1].init?.method).toBe("PATCH");
    expect(calls[1].url).toMatch(/\/api\/monsters\/monster-1$/);
    expect(calls[2].url).toMatch(/\/api\/monsters\/monster-1\/select$/);
  });

  it("reports server-side validation failures", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/monsters": () =>
          jsonResponse({ message: ["name must be longer"] }, 400),
      }),
    );

    await expect(
      api.createMonster("tok", { name: "x", dna: DNA }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      api.createMonster("tok", { name: "x", dna: DNA }),
    ).rejects.toThrow(/name must be longer/);
  });

  it("refuses to edit a monster owned by somebody else", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch({
        "/api/monsters/other": () =>
          jsonResponse(
            { message: "That monster belongs to another guest" },
            403,
          ),
      }),
    );
    await expect(
      api.updateMonster("tok", "other", { name: "Stolen" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
