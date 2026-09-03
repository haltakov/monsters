"use client";

import { Play, Skull } from "lucide-react";
import { useI18n } from "@/components/i18n";

export function AdminMonsterActions({
  monster,
  busy,
  onSpawn,
  onKill,
}: {
  monster: { id: string; name: string; alive: boolean };
  busy: boolean;
  onSpawn: () => void;
  onKill: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="admin-monster-actions">
      <button type="button" disabled={busy} onClick={onSpawn}>
        <Play size={14} /> {t("account.spawn")}
      </button>
      <button
        type="button"
        className="admin-kill-monster"
        disabled={busy || !monster.alive}
        aria-label={t("account.killNamed", { name: monster.name })}
        onClick={() => {
          if (window.confirm(t("account.killConfirm", { name: monster.name })))
            onKill();
        }}
      >
        <Skull size={14} /> {t("account.kill")}
      </button>
    </div>
  );
}
