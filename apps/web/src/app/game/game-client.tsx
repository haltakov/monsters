"use client";

import dynamic from "next/dynamic";
import { useI18n, useLocalizedTitle } from "@/components/i18n";

function GameLoading() {
  const { t } = useI18n();
  return (
    <div className="game-loading">
      <div className="loading-monster">●ᴥ●</div>
      <p>{t("loading.island")}</p>
    </div>
  );
}

const GameExperience = dynamic(
  () =>
    import("@/components/game/game-experience").then(
      (module) => module.GameExperience,
    ),
  {
    ssr: false,
    loading: GameLoading,
  },
);

export function GameClient() {
  useLocalizedTitle("meta.gameTitle");
  return <GameExperience />;
}
