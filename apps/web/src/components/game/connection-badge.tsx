"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useI18n } from "@/components/i18n";
import type { ConnectionPhase } from "@/lib/net/world-connection";

/** Compact live/reconnecting indicator shown in the HUD. */
export function ConnectionBadge({ phase }: { phase: ConnectionPhase }) {
  const { t } = useI18n();
  const label =
    phase === "connected"
      ? t("net.connected")
      : phase === "connecting"
        ? t("net.connecting")
        : phase === "reconnecting"
          ? t("net.reconnecting")
          : phase === "error"
            ? t("net.failed")
            : t("net.offline");
  return (
    <div
      className="connection-chip"
      data-phase={phase}
      role="status"
      aria-live="polite"
    >
      {phase === "connected" ? <Wifi size={13} /> : <WifiOff size={13} />}
      <span>{label}</span>
    </div>
  );
}
