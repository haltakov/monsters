"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import {
  BREATH_ELEMENTS,
  BREATH_COOLDOWN_SECONDS,
  type BreathElement,
} from "@monsters/game-core";
import { useI18n } from "@/components/i18n";
import type { WorldConnection } from "@/lib/net/world-connection";

export function BreathControl({
  connection,
  entityId,
  element,
  onElement,
  onCast,
  disabled,
}: {
  connection: WorldConnection;
  entityId: string | null;
  element: BreathElement;
  onElement: (element: BreathElement) => void;
  onCast: () => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    let readyAt = 0;
    const off = connection.on("events", (events) => {
      for (const event of events) {
        if (
          (event.type !== "breath" && event.type !== "breathFailed") ||
          event.entityId !== entityId
        )
          continue;
        const seconds =
          event.type === "breath"
            ? BREATH_COOLDOWN_SECONDS
            : event.reason === "cooldown"
              ? (event.seconds ?? 0)
              : 0;
        if (seconds > 0) {
          readyAt = performance.now() + seconds * 1000;
          setRemaining(seconds);
        }
      }
    });
    const timer = window.setInterval(
      () =>
        setRemaining(
          Math.max(0, Math.ceil((readyAt - performance.now()) / 1000)),
        ),
      150,
    );
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [connection, entityId]);

  return (
    <div className="breath-control" data-element={element}>
      <select
        aria-label={t("game.breathElement")}
        value={element}
        disabled={disabled}
        onChange={(event) => onElement(event.target.value as BreathElement)}
      >
        {BREATH_ELEMENTS.map((value) => (
          <option key={value} value={value}>
            {t(`game.breath.${value}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="action-button breath-button"
        disabled={disabled || remaining > 0}
        title={t("game.breathHelp")}
        aria-label={`${t("game.breathButton")}: ${t(`game.breath.${element}`)}${remaining ? ` (${remaining}s)` : ""}`}
        onClick={onCast}
      >
        <Zap size={25} />
        <span>{remaining > 0 ? `${remaining}s` : t("game.breathButton")}</span>
        <small>B</small>
      </button>
    </div>
  );
}
