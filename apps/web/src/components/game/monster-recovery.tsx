"use client";

import { Boxes, RotateCcw } from "lucide-react";
import { useI18n } from "@/components/i18n";

export function MonsterRecovery({
  monster,
  busy,
  error,
  onRespawn,
  onInventory,
}: {
  monster?: { id: string; name: string; alive: boolean } | null;
  busy: boolean;
  error: string | null;
  onRespawn: (id: string) => Promise<void>;
  onInventory: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="monster-recovery">
      {monster && !monster.alive && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRespawn(monster.id).catch(() => undefined)}
        >
          <RotateCcw size={16} />{" "}
          {t(busy ? "game.respawning" : "game.respawnNamed", {
            name: monster.name,
          })}
        </button>
      )}
      <button type="button" onClick={onInventory}>
        <Boxes size={16} /> {t("account.inventory")}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
