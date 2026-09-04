import { getApiBaseUrl } from "./config";

export type GuestProfile = {
  id: string;
  displayName: string;
  createdAt: string;
  lastSeenAt: string;
};

export type MonsterSummary = {
  id: string;
  name: string;
  species: string;
  dna: string;
  ageSeconds?: number;
  generation: number;
  parentIds: [string, string] | null;
  mutations: number;
  alive: boolean;
  diedAt: string | null;
  createdAt: string;
  inWorld: boolean;
  selected: boolean;
  accountOwned: boolean;
  originType: string;
  clonedFromId: string | null;
};

export type MonsterRelation = Pick<
  MonsterSummary,
  "id" | "name" | "species" | "generation" | "alive" | "originType"
>;

export type MonsterLineage = {
  monster: MonsterSummary;
  parents: MonsterRelation[];
  clonedFrom: MonsterRelation | null;
  children: MonsterRelation[];
};

export type PublicWorld = {
  id: string;
  slug: string;
  name: string;
  status: string;
  tick: number;
  population: { living: number; eggs: number };
  runner: { active: boolean; tickRate: number };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: string;
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function readErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message) && typeof message[0] === "string") {
      return message.join(", ");
    }
  }
  return fallback;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    token,
    body,
    signal,
    baseUrl = getApiBaseUrl(),
    fetchImpl = fetch,
  } = options;

  const response = await fetchImpl(`${baseUrl}${path}`, {
    method,
    signal,
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Proxies commonly return an HTML error page during deployment/outages.
      throw new ApiError(
        response.status,
        response.ok
          ? "The server returned an invalid response"
          : `Request failed with ${response.status}`,
      );
    }
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      readErrorMessage(payload, `Request failed with ${response.status}`),
      payload,
    );
  }
  return payload as T;
}

export const api = {
  bootstrapGuest: (options: RequestOptions = {}) =>
    apiRequest<{ token: string; guest: GuestProfile }>("/api/guest/bootstrap", {
      ...options,
      method: "POST",
    }),
  getGuest: (token: string, options: RequestOptions = {}) =>
    apiRequest<{ guest: GuestProfile }>("/api/guest/me", { ...options, token }),
  updateGuest: (
    token: string,
    displayName: string,
    options: RequestOptions = {},
  ) =>
    apiRequest<{ guest: GuestProfile }>("/api/guest/me", {
      ...options,
      method: "PATCH",
      token,
      body: { displayName },
    }),
  getPublicWorld: (options: RequestOptions = {}) =>
    apiRequest<PublicWorld>("/api/worlds/public", options),
  listMonsters: (token: string, options: RequestOptions = {}) =>
    apiRequest<{
      monsters: MonsterSummary[];
      selectedMonsterId: string | null;
    }>("/api/monsters", { ...options, token }),
  createMonster: (
    token: string,
    input: { name: string; dna: string },
    options: RequestOptions = {},
  ) =>
    apiRequest<{ monster: MonsterSummary }>("/api/monsters", {
      ...options,
      method: "POST",
      token,
      body: input,
    }),
  updateMonster: (
    token: string,
    id: string,
    input: { name?: string; dna?: string },
    options: RequestOptions = {},
  ) =>
    apiRequest<{ monster: MonsterSummary }>(`/api/monsters/${id}`, {
      ...options,
      method: "PATCH",
      token,
      body: input,
    }),
  selectMonster: (token: string, id: string, options: RequestOptions = {}) =>
    apiRequest<{ monster: MonsterSummary }>(`/api/monsters/${id}/select`, {
      ...options,
      method: "POST",
      token,
    }),
  copyMonster: (token: string, id: string, options: RequestOptions = {}) =>
    apiRequest<{ monster: MonsterSummary }>(`/api/monsters/${id}/copy`, {
      ...options,
      method: "POST",
      token,
    }),
  claimAccount: (token: string, options: RequestOptions = {}) =>
    apiRequest<{ claimedMonsters: number }>("/api/account/claim", {
      ...options,
      method: "POST",
      token,
    }),
  releaseAccount: (token: string, options: RequestOptions = {}) =>
    apiRequest<{ released: boolean }>("/api/account/release", {
      ...options,
      method: "POST",
      token,
    }),
  authConfiguration: (options: RequestOptions = {}) =>
    apiRequest<{ google: boolean; magicLink: boolean }>(
      "/api/account/auth-configuration",
      options,
    ),
  getMonsterLineage: (id: string, options: RequestOptions = {}) =>
    apiRequest<MonsterLineage>(`/api/monsters/public/${id}`, options),
  listPublicMonsters: (
    origin = "all",
    search = "",
    options: RequestOptions = {},
  ) =>
    apiRequest<{ monsters: MonsterSummary[]; total: number }>(
      `/api/monsters/public?origin=${encodeURIComponent(origin)}&search=${encodeURIComponent(search)}`,
      options,
    ),
  adminListMonsters: (
    origin = "all",
    search = "",
    options: RequestOptions = {},
  ) =>
    apiRequest<{
      monsters: Array<
        MonsterSummary & {
          owner: { id: string; name: string; email: string } | null;
          localPlayerCreated: boolean;
        }
      >;
    }>(
      `/api/admin/monsters?origin=${encodeURIComponent(origin)}&search=${encodeURIComponent(search)}`,
      options,
    ),
  adminCreateMonster: (
    input: { name: string; dna: string; spawn: boolean },
    options: RequestOptions = {},
  ) =>
    apiRequest<{ monster: MonsterSummary }>("/api/admin/monsters", {
      ...options,
      method: "POST",
      body: input,
    }),
  adminUpdateMonster: (
    id: string,
    input: { name?: string; dna?: string },
    options: RequestOptions = {},
  ) =>
    apiRequest<{ monster: MonsterSummary }>(`/api/admin/monsters/${id}`, {
      ...options,
      method: "PATCH",
      body: input,
    }),
  adminSpawnMonster: (id: string, options: RequestOptions = {}) =>
    apiRequest<{ monster: MonsterSummary }>(`/api/admin/monsters/${id}/spawn`, {
      ...options,
      method: "POST",
    }),
  adminResetWorld: (population: number, options: RequestOptions = {}) =>
    apiRequest<{
      seed: number;
      population: number;
      terrestrialOnly: boolean;
    }>("/api/admin/world/reset", {
      ...options,
      method: "POST",
      body: {
        population,
        confirmation: "RESET MONSTER ISLAND",
      },
    }),
  adminKillMonster: (id: string, options: RequestOptions = {}) =>
    apiRequest<{ monster: MonsterSummary }>(
      `/api/admin/monsters/${encodeURIComponent(id)}/kill`,
      {
        ...options,
        method: "POST",
      },
    ),
};
