"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  type GuestProfile,
  type MonsterSummary,
  type PublicWorld,
} from "./api-client";
import {
  createLocalTokenStore,
  resolveSession,
  type TokenStore,
} from "./session";

export type SessionStatus = "loading" | "ready" | "error";

export type SessionState = {
  status: SessionStatus;
  error: string | null;
  token: string | null;
  guest: GuestProfile | null;
  world: PublicWorld | null;
  monsters: MonsterSummary[];
  selectedMonsterId: string | null;
};

const INITIAL_STATE: SessionState = {
  status: "loading",
  error: null,
  token: null,
  guest: null,
  world: null,
  monsters: [],
  selectedMonsterId: null,
};

function describeError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

/**
 * Bootstraps (or resumes) the anonymous guest and loads everything the 3D
 * scene needs before it mounts, so the heavy canvas never renders behind a
 * half-known session.
 */
export function useGuestSession(options: { tokenStore?: TokenStore } = {}) {
  const [state, setState] = useState<SessionState>(INITIAL_STATE);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  const tokenStore = useMemo(
    () =>
      options.tokenStore ??
      createLocalTokenStore(
        typeof window === "undefined" ? null : window.localStorage,
      ),
    [options.tokenStore],
  );

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();

    const load = async () => {
      setState((current) => ({ ...current, status: "loading", error: null }));
      try {
        const session = await resolveSession(tokenStore, {
          signal: controller.signal,
        });
        const [world, monsters] = await Promise.all([
          api.getPublicWorld({ signal: controller.signal }),
          api.listMonsters(session.token, { signal: controller.signal }),
        ]);
        if (!mounted.current || controller.signal.aborted) return;
        setState({
          status: "ready",
          error: null,
          token: session.token,
          guest: session.guest,
          world,
          monsters: monsters.monsters,
          selectedMonsterId: monsters.selectedMonsterId,
        });
      } catch (error) {
        if (controller.signal.aborted || !mounted.current) return;
        setState({
          ...INITIAL_STATE,
          status: "error",
          error: describeError(error),
        });
      }
    };

    void load();
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [attempt, tokenStore]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  const refreshMonsters = useCallback(async () => {
    if (!state.token) return;
    const result = await api.listMonsters(state.token);
    if (!mounted.current) return;
    setState((current) => ({
      ...current,
      monsters: result.monsters,
      selectedMonsterId: result.selectedMonsterId,
    }));
  }, [state.token]);

  const createMonster = useCallback(
    async (
      input: { name: string; dna: string },
      options?: { signal?: AbortSignal },
    ) => {
      if (!state.token) throw new Error("No session");
      const { monster } = await api.createMonster(state.token, input, options);
      options?.signal?.throwIfAborted();
      if (!mounted.current) throw new Error("The game session was closed.");
      setState((current) => ({
        ...current,
        monsters: [...current.monsters, monster],
        selectedMonsterId: monster.id,
      }));
      return monster;
    },
    [state.token],
  );

  const updateMonster = useCallback(
    async (id: string, input: { name?: string; dna?: string }) => {
      if (!state.token) throw new Error("No session");
      const { monster } = await api.updateMonster(state.token, id, input);
      setState((current) => ({
        ...current,
        monsters: current.monsters.map((entry) =>
          entry.id === monster.id ? monster : entry,
        ),
      }));
      return monster;
    },
    [state.token],
  );

  const selectMonster = useCallback(
    async (id: string) => {
      if (!state.token) throw new Error("No session");
      const { monster } = await api.selectMonster(state.token, id);
      setState((current) => ({ ...current, selectedMonsterId: monster.id }));
      return monster;
    },
    [state.token],
  );

  const copyMonster = useCallback(
    async (id: string) => {
      if (!state.token) throw new Error("No session");
      const { monster } = await api.copyMonster(state.token, id);
      setState((current) => ({
        ...current,
        monsters: [monster, ...current.monsters],
        selectedMonsterId: monster.id,
      }));
      return monster;
    },
    [state.token],
  );

  const markMonsterDead = useCallback((id: string) => {
    setState((current) => ({
      ...current,
      monsters: current.monsters.map((entry) =>
        entry.id === id ? { ...entry, alive: false } : entry,
      ),
    }));
  }, []);

  return {
    ...state,
    retry,
    refreshMonsters,
    createMonster,
    updateMonster,
    selectMonster,
    copyMonster,
    markMonsterDead,
  };
}
