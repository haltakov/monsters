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
  generation: number;
  parentIds: [string, string] | null;
  mutations: number;
  alive: boolean;
  diedAt: string | null;
  createdAt: string;
  inWorld: boolean;
  selected: boolean;
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
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload: unknown = text ? JSON.parse(text) : null;
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
  updateGuest: (token: string, displayName: string, options: RequestOptions = {}) =>
    apiRequest<{ guest: GuestProfile }>("/api/guest/me", {
      ...options,
      method: "PATCH",
      token,
      body: { displayName },
    }),
  getPublicWorld: (options: RequestOptions = {}) =>
    apiRequest<PublicWorld>("/api/worlds/public", options),
  listMonsters: (token: string, options: RequestOptions = {}) =>
    apiRequest<{ monsters: MonsterSummary[]; selectedMonsterId: string | null }>(
      "/api/monsters",
      { ...options, token },
    ),
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
};
