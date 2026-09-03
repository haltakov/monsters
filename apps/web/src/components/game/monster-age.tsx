"use client";

import {
  getCreatureLifespanHours,
  OLD_AGE_START,
  type MonsterDna,
} from "@monsters/game-core";
import { useI18n } from "@/components/i18n";

export function MonsterAge({
  dna,
  seconds = 0,
}: {
  dna: MonsterDna;
  seconds?: number;
}) {
  const { t } = useI18n();
  const max = getCreatureLifespanHours(dna);
  const hours = Math.max(0, seconds) / 3600;
  const old = hours >= max * OLD_AGE_START;
  return (
    <small
      className={`monster-age${old ? " monster-age-old" : ""}`}
      title={t("game.ageHelp")}
    >
      {t("game.age")}{" "}
      <b>
        {hours.toFixed(2)} / {max.toFixed(2)} h
      </b>
      {old && <span> · {t("game.elder")}</span>}
    </small>
  );
}
