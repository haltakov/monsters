import type { SceneQuality } from "@/components/game/world-scenery";

export type NetworkMonsterDetail = "hidden" | "proxy" | "full";

const DETAIL_DISTANCE = {
  mobile: { full: 20, hidden: 64, hysteresis: 5 },
  desktop: { full: 34, hidden: 132, hysteresis: 8 },
} as const;

/**
 * Selects a cheap representation for remote monsters. The dead band prevents
 * an animal near a boundary from repeatedly mounting and disposing its mesh.
 */
export function getNetworkMonsterDetail(
  distance: number,
  quality: SceneQuality,
  previous: NetworkMonsterDetail,
): NetworkMonsterDetail {
  const limits = DETAIL_DISTANCE[quality];

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
  quality: SceneQuality,
): NetworkMonsterDetail {
  return distance <= DETAIL_DISTANCE[quality].hidden ? "proxy" : "hidden";
}
