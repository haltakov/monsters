import {
  MONSTER_DETAIL_LIMITS,
  type MonsterDetailPreset,
} from "@/lib/monster-detail-settings";

export type NetworkMonsterDetail = "hidden" | "proxy" | "full";

export type MeshPromotionBudget = { nextAt: number };

/** Spread distant mesh construction across frames; interactions never queue. */
export function claimMeshPromotion(
  budget: MeshPromotionBudget,
  now: number,
  distance: number,
) {
  if (distance > 12 && now < budget.nextAt) return false;
  budget.nextAt = now + 0.04;
  return true;
}

/** Camera offset must never downgrade a creature next to the player. */
export function getMonsterDetailDistance(
  monster: { x: number; z: number },
  camera: { x: number; z: number },
  player?: { x: number; z: number } | null,
) {
  const cameraDistance = Math.hypot(monster.x - camera.x, monster.z - camera.z);
  return player
    ? Math.min(
        cameraDistance,
        Math.hypot(monster.x - player.x, monster.z - player.z),
      )
    : cameraDistance;
}

/**
 * Selects a cheap representation for remote monsters. The dead band prevents
 * an animal near a boundary from repeatedly mounting and disposing its mesh.
 */
export function getNetworkMonsterDetail(
  distance: number,
  preset: MonsterDetailPreset,
  previous: NetworkMonsterDetail,
): NetworkMonsterDetail {
  const limits = MONSTER_DETAIL_LIMITS[preset];

  if (previous === "full" && distance <= limits.full + limits.hysteresis) {
    return "full";
  }
  if (previous !== "hidden" && distance <= limits.hidden + limits.hysteresis) {
    return distance <= limits.full ? "full" : "proxy";
  }
  if (distance <= limits.full) return "full";
  if (distance <= limits.hidden) return "proxy";
  return "hidden";
}

/** Start quickly with silhouettes; expensive smooth meshes are promoted later. */
export function getInitialNetworkMonsterDetail(
  distance: number,
  preset: MonsterDetailPreset,
): NetworkMonsterDetail {
  return distance <= MONSTER_DETAIL_LIMITS[preset].hidden ? "proxy" : "hidden";
}
