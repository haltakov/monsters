"use client";

import { useEffect, useState, type RefObject } from "react";
import { ISLANDS, SEA_LEVEL } from "@monsters/game-core";
import { useI18n } from "@/components/i18n";
import type { ControlState } from "./player-monster";

export function ArchipelagoMap({
  controls,
}: {
  controls: RefObject<ControlState>;
}) {
  const { t } = useI18n();
  const [position, setPosition] = useState({ x: -8, y: 0, z: 8 });
  useEffect(() => {
    const timer = window.setInterval(
      () => setPosition({ ...controls.current.playerPosition }),
      250,
    );
    return () => window.clearInterval(timer);
  }, [controls]);
  return (
    <details className="archipelago-map" open>
      <summary>
        {t("game.heightReading", {
          height: Math.round(position.y - SEA_LEVEL),
        })}
      </summary>
      <svg
        viewBox="-480 -240 890 680"
        role="img"
        aria-label={t("game.seaTravel")}
      >
        <rect
          x="-480"
          y="-240"
          width="890"
          height="680"
          rx="42"
          fill="#247f97"
        />
        {ISLANDS.map((island) => (
          <g key={island.id}>
            <circle
              cx={island.x}
              cy={island.z}
              r={island.radius}
              fill={island.color}
              stroke="#e7d0a0"
              strokeWidth="7"
            />
            {island.id === "peaks" && (
              <path
                d="M210 270 l35 -70 l45 70 M260 290 l25 -45 l30 45"
                fill="none"
                stroke="#e9e7d3"
                strokeWidth="8"
              />
            )}
            {island.id === "lakes" && (
              <ellipse
                cx={island.x - 20}
                cy={island.z}
                rx="22"
                ry="36"
                fill="#247f97"
              />
            )}
            <text
              x={island.x}
              y={island.z + island.radius + 40}
              textAnchor="middle"
              fill="#fff9e8"
              fontSize="48"
              fontWeight="700"
            >
              {t(`game.island.${island.id}`)}
            </text>
          </g>
        ))}
        <circle
          cx={position.x}
          cy={position.z}
          r="13"
          fill="#fff5bb"
          stroke="#173f35"
          strokeWidth="5"
        />
      </svg>
      <small>{t("game.seaTravel")}</small>
    </details>
  );
}
