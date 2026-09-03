"use client";

import { useId } from "react";
import { useI18n } from "@/components/i18n";
import {
  MONSTER_DETAIL_LIMITS,
  parseMonsterDetail,
  type MonsterDetailSetting,
  type MonsterDetailPreset,
} from "@/lib/monster-detail-settings";

export function MonsterDetailSelect({
  value,
  automatic,
  onChange,
}: {
  value: MonsterDetailSetting;
  automatic: MonsterDetailPreset;
  onChange: (value: MonsterDetailSetting) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const distance =
    MONSTER_DETAIL_LIMITS[value === "auto" ? automatic : value].full;
  return (
    <div className="monster-detail-setting">
      <label className="language-select" htmlFor={id}>
        <span>{t("game.monsterDetail")}</span>
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(parseMonsterDetail(event.target.value))}
          aria-describedby={`${id}-help`}
        >
          <option value="auto">{t("game.detailAuto")}</option>
          <option value="performance">{t("game.detailPerformance")}</option>
          <option value="balanced">{t("game.detailBalanced")}</option>
          <option value="high">{t("game.detailHigh")}</option>
        </select>
      </label>
      <p id={`${id}-help`}>
        <strong>{t("game.detailRange", { distance })}</strong>{" "}
        {t("game.detailHelp")}
      </p>
    </div>
  );
}
