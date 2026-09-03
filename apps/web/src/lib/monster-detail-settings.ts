export const MONSTER_DETAIL_OPTIONS = [
  "auto",
  "performance",
  "balanced",
  "high",
] as const;
export type MonsterDetailSetting = (typeof MONSTER_DETAIL_OPTIONS)[number];
export type MonsterDetailPreset = Exclude<MonsterDetailSetting, "auto">;

// Even the lightest setting shows real creatures at twice the old mobile range.
export const MONSTER_DETAIL_LIMITS = {
  performance: { full: 40, hidden: 112, hysteresis: 8 },
  balanced: { full: 64, hidden: 160, hysteresis: 10 },
  high: { full: 96, hidden: 220, hysteresis: 14 },
} as const;

export function chooseAutomaticMonsterDetail(device: {
  mobile: boolean;
  cores?: number;
  memoryGb?: number;
}): MonsterDetailPreset {
  // These are starting hints, not a GPU benchmark. Missing Safari hints should
  // not condemn a capable phone to the lowest setting.
  if (
    (device.memoryGb && device.memoryGb <= 2) ||
    (device.cores && device.cores <= 2)
  ) {
    return "performance";
  }
  if (
    !device.mobile &&
    (device.cores ?? 0) >= 8 &&
    (device.memoryGb ?? 0) >= 8
  ) {
    return "high";
  }
  return "balanced";
}

export function getAutomaticMonsterDetail(): MonsterDetailPreset {
  if (typeof window === "undefined") return "balanced";
  return chooseAutomaticMonsterDetail({
    mobile: window.matchMedia("(pointer: coarse)").matches,
    cores: navigator.hardwareConcurrency,
    memoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  });
}

export const MONSTER_DETAIL_STORAGE_KEY = "monstersdna:monster-detail";
const CHANGE_EVENT = "monstersdna:monster-detail-change";
let sessionOverride: MonsterDetailSetting | null = null;

export function parseMonsterDetail(value: unknown): MonsterDetailSetting {
  return MONSTER_DETAIL_OPTIONS.includes(value as MonsterDetailSetting)
    ? (value as MonsterDetailSetting)
    : "auto";
}

export function readMonsterDetailSetting(): MonsterDetailSetting {
  if (sessionOverride !== null) return sessionOverride;
  try {
    return parseMonsterDetail(
      window.localStorage.getItem(MONSTER_DETAIL_STORAGE_KEY),
    );
  } catch {
    return "auto";
  }
}

export function saveMonsterDetailSetting(value: MonsterDetailSetting) {
  const selection = parseMonsterDetail(value);
  sessionOverride = selection;
  try {
    window.localStorage.setItem(MONSTER_DETAIL_STORAGE_KEY, selection);
    sessionOverride = null;
  } catch {
    // Private/restricted storage still permits changing this session's setting.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeMonsterDetailSetting(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === MONSTER_DETAIL_STORAGE_KEY) {
      sessionOverride = null;
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export const getServerMonsterDetailSetting = (): MonsterDetailSetting => "auto";
