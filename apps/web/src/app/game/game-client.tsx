"use client";

import dynamic from "next/dynamic";

const GameExperience = dynamic(
  () =>
    import("@/components/game/game-experience").then(
      (module) => module.GameExperience,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="game-loading">
        <div className="loading-monster">●ᴥ●</div>
        <p>Growing the island…</p>
      </div>
    ),
  },
);

export function GameClient() {
  return <GameExperience />;
}
