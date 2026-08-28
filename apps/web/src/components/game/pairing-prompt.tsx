"use client";

import { Heart } from "lucide-react";
import { useI18n } from "@/components/i18n";

export type PairingPrompt = {
  requestId: string;
  fromName: string;
  expiresAtMs: number;
};

/**
 * Incoming player-to-player pairing request. Pairing between two controlled
 * monsters only happens if this is explicitly accepted before it expires.
 */
export function PairingRequestCard({
  request,
  secondsLeft,
  onRespond,
}: {
  request: PairingPrompt;
  secondsLeft: number;
  onRespond: (accept: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="pairing-request" role="dialog" aria-modal="false">
      <Heart size={18} />
      <div>
        <strong>{t("game.pairRequest", { name: request.fromName })}</strong>
        <small>{t("game.pairExpiresIn", { seconds: secondsLeft })}</small>
      </div>
      <div className="pairing-actions">
        <button
          type="button"
          className="pairing-accept"
          onClick={() => onRespond(true)}
        >
          {t("game.pairAccept")}
        </button>
        <button
          type="button"
          className="pairing-decline"
          onClick={() => onRespond(false)}
        >
          {t("game.pairDecline")}
        </button>
      </div>
    </div>
  );
}
