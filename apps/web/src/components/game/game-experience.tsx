"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { Canvas } from "@react-three/fiber";
import { Float, Sky, Sparkles } from "@react-three/drei";
import {
  Activity,
  ArrowLeft,
  Crosshair,
  Dna,
  Egg,
  Heart,
  Leaf,
  Menu,
  MousePointer2,
  Pencil,
  Plus,
  Swords,
  Waves,
  Wind,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";
import { MonsterMark } from "@/components/monster-mark";
import {
  ACCENT_COLORS,
  ADAPTATIONS,
  BODY_SHAPES,
  DEFAULT_MONSTER_DNA,
  DIETS,
  EDIBLES,
  EAR_SHAPES,
  EYE_COUNTS,
  HORN_SHAPES,
  LEG_COUNTS,
  LEG_SHAPES,
  MATING_COOLDOWN_SECONDS,
  MONSTER_BUILDS,
  MONSTER_COLORS,
  MONSTER_SIZES,
  MOUTH_SHAPES,
  PAIR_REQUEST_TIMEOUT_SECONDS,
  PATTERNS,
  PLAYABLE_RADIUS,
  PREY,
  RESPIRATIONS,
  SOCIAL_BEHAVIORS,
  TAIL_SHAPES,
  canMonsterHunt,
  canMonsterSwim,
  decodeMonsterDna,
  encodeMonsterDna,
  isDeepWaterAt,
  isWaterAt,
  normalizeAngle,
  type LocomotionMode,
  type MonsterDna,
  type SimEvent,
  type WorldPopulation,
} from "@monsters/game-core";
import { Scenery, type SceneQuality } from "@/components/game/world-scenery";
import { NetworkPopulation } from "@/components/game/network-monsters";
import { ConnectionBadge } from "@/components/game/connection-badge";
import {
  PairingRequestCard,
  type PairingPrompt,
} from "@/components/game/pairing-prompt";
import {
  PlayerMonster,
  type ControlState,
} from "@/components/game/player-monster";
import type { MonsterSummary } from "@/lib/net/api-client";
import { useGuestSession } from "@/lib/net/use-session";
import {
  WorldConnection,
  type ConnectionPhase,
} from "@/lib/net/world-connection";
import {
  LanguageSwitcher,
  useI18n,
  type TranslationKey,
} from "@/components/i18n";
import {
  EMPTY_AGENT_ARENA,
  observeArena,
  scoreAgentArena,
  startAgentArena,
  webMcpResult,
  type AgentArenaState,
} from "@/lib/agent/arena";
import { registerWebMcpTools } from "@/lib/agent/webmcp";
import { AccountHub } from "@/components/account/account-hub";

function CreatorLoading() {
  const { t } = useI18n();
  return (
    <div className="creator-overlay" role="status" aria-live="polite">
      <div className="creator-loading">{t("loading.creator")}</div>
    </div>
  );
}

const MonsterCreator = dynamic(
  () =>
    import("@/components/game/monster-creator").then(
      (module) => module.MonsterCreator,
    ),
  {
    ssr: false,
    loading: CreatorLoading,
  },
);

type CreatorDraft = {
  mode: "edit" | "new";
  dna: MonsterDna;
  name: string;
  monsterId: string | null;
};

type StatusMessage = {
  key: TranslationKey;
  values?: Record<string, string | number>;
};

const MAX_FAMILY_SIZE = 6;

function subscribeToDeviceProfile() {
  return () => undefined;
}

function getDeviceProfile(): SceneQuality {
  return window.matchMedia("(pointer: coarse)").matches ||
    window.matchMedia("(max-width: 900px)").matches
    ? "mobile"
    : "desktop";
}

function getServerDeviceProfile() {
  return null;
}

function World({
  connection,
  controls,
  dna,
  name,
  quality,
  selfEntityId,
  depletedResources,
  onPlayerFrame,
}: {
  connection: WorldConnection;
  controls: React.RefObject<ControlState>;
  dna: MonsterDna;
  name: string;
  quality: SceneQuality;
  selfEntityId: string | null;
  depletedResources: ReadonlySet<string>;
  onPlayerFrame: (frame: {
    x: number;
    y: number;
    z: number;
    moving: boolean;
    sprinting: boolean;
    mode: LocomotionMode;
  }) => void;
}) {
  return (
    <>
      <color attach="background" args={["#9CDCE5"]} />
      <fog attach="fog" args={["#9CDCE5", 95, 285]} />
      <Sky
        distance={450000}
        sunPosition={[30, 24, -18]}
        inclination={0.54}
        azimuth={0.18}
      />
      <hemisphereLight intensity={1.35} color="#FFF2CF" groundColor="#376C58" />
      <directionalLight
        position={[-16, 24, -10]}
        intensity={2.15}
        color="#FFF4D5"
        castShadow={quality === "desktop"}
        shadow-mapSize={quality === "desktop" ? [2048, 2048] : [512, 512]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.04}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
      />
      <Scenery quality={quality} depletedResources={depletedResources} />
      <Float
        speed={1.2}
        rotationIntensity={0.04}
        floatIntensity={0.45}
        position={[-20, 12, -28]}
      >
        <group scale={1.2}>
          {[-1.4, 0, 1.3].map((x, index) => (
            <mesh key={x} position={[x, index === 1 ? 0.25 : 0, 0]}>
              <sphereGeometry args={[1.45, 16, 10]} />
              <meshStandardMaterial color="#FFF8E8" roughness={1} />
            </mesh>
          ))}
        </group>
      </Float>
      <Sparkles
        count={quality === "mobile" ? 16 : 64}
        scale={[74, 9, 74]}
        position={[0, 4, 0]}
        size={1.6}
        speed={0.24}
        color="#FFF1A8"
      />
      <NetworkPopulation
        connection={connection}
        quality={quality}
        selfEntityId={selfEntityId}
      />
      {selfEntityId && (
        <PlayerMonster
          key={selfEntityId}
          connection={connection}
          controls={controls}
          dna={dna}
          name={name}
          onFrame={onPlayerFrame}
        />
      )}
    </>
  );
}

function Joystick({
  label,
  onMove,
}: {
  label: string;
  onMove: (x: number, y: number) => void;
}) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    if (!base.current) return;
    const rect = base.current.getBoundingClientRect();
    const radius = rect.width * 0.32;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy);
    const scale = distance > radius ? radius / distance : 1;
    const x = dx * scale;
    const y = dy * scale;
    setKnob({ x, y });
    onMove(x / radius, -y / radius);
  };

  return (
    <div
      ref={base}
      className="joystick"
      role="application"
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        update(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          update(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        setKnob({ x: 0, y: 0 });
        onMove(0, 0);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        setKnob({ x: 0, y: 0 });
        onMove(0, 0);
      }}
    >
      <span className="joystick-label">{label}</span>
      <div
        className="joystick-knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}

/** Session bootstrap gate: the heavy canvas only mounts once we have a guest. */
export function GameExperience() {
  const session = useGuestSession();
  const { t } = useI18n();

  if (session.status === "loading") {
    return (
      <main className="game-shell">
        <div className="scene-loading" role="status" aria-live="polite">
          <strong>{t("net.loading")}</strong>
          <span>{t("net.loadingHint")}</span>
        </div>
      </main>
    );
  }

  if (session.status === "error" || !session.token || !session.guest) {
    return (
      <main className="game-shell">
        <div className="scene-error" role="alert">
          <strong>{t("net.errorTitle")}</strong>
          <p>{session.error}</p>
          <div className="scene-error-actions">
            <button type="button" onClick={session.retry}>
              {t("net.retry")}
            </button>
            <Link href="/" className="scene-error-home">
              <ArrowLeft size={16} /> {t("game.home")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <ConnectedGame session={session} />;
}

type SessionApi = ReturnType<typeof useGuestSession>;

function ConnectedGame({ session }: { session: SessionApi }) {
  const { t, option } = useI18n();
  const token = session.token!;

  const controls = useRef<ControlState>({
    keys: new Set(),
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    cameraYaw: 0.35,
    cameraPitch: 0.38,
    action: null,
    actionStarted: 0,
    paused: false,
    energy: 100,
    health: 100,
    isDead: false,
    moving: false,
    sprinting: false,
    locomotionMode: "land",
    playerPosition: { x: -8, y: 0, z: 8 },
    agent: {
      enabled: false,
      commandId: 0,
      forward: 0,
      strafe: 0,
      turn: 0,
      sprint: false,
      heading: null,
      label: "idle",
    },
  });

  const connection = useMemo(() => new WorldConnection(), []);
  const displayedEnergy = useRef(100);
  const displayedHealth = useRef(100);
  const displayedLocomotion = useRef<LocomotionMode>("land");
  const mateCooldownUntil = useRef(0);

  const [pointerLocked, setPointerLocked] = useState(false);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [isController, setIsController] = useState(false);
  const [selfEntityId, setSelfEntityId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>({ key: "game.welcome" });
  const [energy, setEnergy] = useState(100);
  const [health, setHealth] = useState(100);
  const [matingCooldown, setMatingCooldown] = useState(0);
  const [locomotionMode, setLocomotionMode] = useState<LocomotionMode>("land");
  const [isDead, setIsDead] = useState(false);
  const [deathReason, setDeathReason] = useState<"energy" | "health">("energy");
  const [population, setPopulation] = useState<WorldPopulation>({
    living: 0,
    eggs: 0,
    births: 0,
    deaths: 0,
  });
  const [ecosystemEvent, setEcosystemEvent] = useState<StatusMessage>({
    key: "game.simWatching",
  });
  const [depletedResources, setDepletedResources] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [pairing, setPairing] = useState<PairingPrompt | null>(null);
  const [pairingSeconds, setPairingSeconds] = useState(0);
  const [creatorDraft, setCreatorDraft] = useState<CreatorDraft | null>(null);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [agentScoreNow, setAgentScoreNow] = useState(0);
  const [agentArena, setAgentArenaState] =
    useState<AgentArenaState>(EMPTY_AGENT_ARENA);
  const agentArenaRef = useRef<AgentArenaState>(EMPTY_AGENT_ARENA);

  const updateAgentArena = useCallback(
    (
      update: AgentArenaState | ((current: AgentArenaState) => AgentArenaState),
    ) => {
      const next =
        typeof update === "function" ? update(agentArenaRef.current) : update;
      agentArenaRef.current = next;
      setAgentArenaState(next);
    },
    [],
  );

  const sceneQuality = useSyncExternalStore(
    subscribeToDeviceProfile,
    getDeviceProfile,
    getServerDeviceProfile,
  );

  const livingMonsters = useMemo(
    () => session.monsters.filter((monster) => monster.alive),
    [session.monsters],
  );
  const activeMonster: MonsterSummary | null = useMemo(() => {
    const selected = session.monsters.find(
      (monster) => monster.id === session.selectedMonsterId,
    );
    return selected ?? livingMonsters[0] ?? null;
  }, [livingMonsters, session.monsters, session.selectedMonsterId]);

  const monsterDna = useMemo(() => {
    if (!activeMonster) return DEFAULT_MONSTER_DNA;
    try {
      return decodeMonsterDna(activeMonster.dna);
    } catch {
      return DEFAULT_MONSTER_DNA;
    }
  }, [activeMonster]);

  const setEnergyLevel = useCallback((value: number) => {
    const normalized = THREE.MathUtils.clamp(value, 0, 100);
    controls.current.energy = normalized;
    const next = Math.ceil(normalized);
    if (displayedEnergy.current !== next) {
      displayedEnergy.current = next;
      setEnergy(next);
    }
  }, []);

  const setHealthLevel = useCallback((value: number) => {
    const normalized = THREE.MathUtils.clamp(value, 0, 100);
    controls.current.health = normalized;
    const next = Math.ceil(normalized);
    if (displayedHealth.current !== next) {
      displayedHealth.current = next;
      setHealth(next);
    }
  }, []);

  // --- networking -----------------------------------------------------------

  useEffect(() => {
    connection.connect(token);
    return () => connection.disconnect();
  }, [connection, token]);

  useEffect(() => {
    const unsubscribe = connection.on("phase", (next) => setPhase(next));
    return unsubscribe;
  }, [connection]);

  useEffect(() => {
    if (phase !== "connected") return;
    connection.join(session.selectedMonsterId ?? null);
  }, [connection, phase, session.selectedMonsterId]);

  useEffect(() => {
    const unsubscribeSnapshot = connection.on("snapshot", (message) => {
      setSelfEntityId(message.you.entityId);
      setIsController(message.you.isController);
      setPopulation(message.population);
      setDepletedResources(new Set(message.depletedResources));
    });
    const unsubscribeStatus = connection.on("status", (message) => {
      setSelfEntityId(message.entityId);
      setIsController(message.isController);
      if (message.reason === "controlTakenOver") {
        setStatus({ key: "net.controlTaken" });
      }
      if (message.reason === "observer") setStatus({ key: "net.observer" });
    });
    const unsubscribeError = connection.on("error", (message) => {
      if (message.code === "worldUnavailable") {
        setStatus({ key: "net.worldPaused" });
        window.setTimeout(
          () => connection.join(session.selectedMonsterId ?? null),
          3000,
        );
      }
    });
    return () => {
      unsubscribeSnapshot();
      unsubscribeStatus();
      unsubscribeError();
    };
  }, [connection, session.selectedMonsterId]);

  // Vitals and resource visibility follow the authoritative stream.
  useEffect(() => {
    const unsubscribe = connection.on("delta", (message) => {
      const self = connection.self;
      if (self) {
        setEnergyLevel(self.net.energy);
        setHealthLevel(self.net.health);
        controls.current.isDead = !self.net.alive;
        if (displayedLocomotion.current !== self.net.loco) {
          displayedLocomotion.current = self.net.loco;
          controls.current.locomotionMode = self.net.loco;
          setLocomotionMode(self.net.loco);
        }
      }
      if (
        message.resources.depleted.length > 0 ||
        message.resources.restored.length > 0
      ) {
        setDepletedResources(new Set(connection.depletedResources));
      }
    });
    return unsubscribe;
  }, [connection, setEnergyLevel, setHealthLevel]);

  // Population counters only need about one update per second.
  useEffect(() => {
    const timer = window.setInterval(
      () => setPopulation({ ...connection.population }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [connection]);

  const handleEvents = useCallback(
    (events: SimEvent[]) => {
      const selfId = connection.entityId;
      for (const event of events) {
        switch (event.type) {
          case "feed": {
            if (agentArenaRef.current.lineageIds.includes(event.entityId)) {
              updateAgentArena((current) => ({
                ...current,
                foodConsumed: current.foodConsumed + 1,
                energyFromFood: current.energyFromFood + event.energy,
                lastAction: `Ate ${event.kind} (+${Math.ceil(event.energy)} energy)`,
              }));
            }
            if (event.entityId !== selfId) break;
            const key: TranslationKey =
              event.kind === "prey"
                ? monsterDna.diet === "carnivore"
                  ? "game.carnivoreFeast"
                  : "game.omnivoreSnack"
                : event.kind === "bush"
                  ? "game.crunchyBush"
                  : "game.tastyTree";
            setStatus({ key, values: { energy: Math.ceil(event.energy) } });
            break;
          }
          case "feedFailed": {
            if (event.entityId !== selfId) break;
            setStatus({
              key:
                event.reason === "diet"
                  ? "game.noPlants"
                  : event.reason === "full"
                    ? "game.energyFull"
                    : "game.getCloser",
            });
            break;
          }
          case "attack": {
            if (
              event.defeated &&
              agentArenaRef.current.lineageIds.includes(event.attackerId)
            ) {
              updateAgentArena((current) => ({
                ...current,
                fightsWon: current.fightsWon + 1,
                lastAction: `Defeated ${event.targetName}`,
              }));
            }
            if (event.attackerId === selfId) {
              setStatus({
                key: event.defeated
                  ? "game.defeatedMonster"
                  : "game.hitMonster",
                values: {
                  name: event.targetName,
                  energy: Math.ceil(event.energyReward),
                },
              });
            } else if (event.targetId === selfId) {
              setStatus({
                key: "game.attackedBy",
                values: {
                  name: event.attackerName,
                  damage: Math.ceil(event.damage),
                },
              });
            } else {
              setEcosystemEvent({
                key: "game.simFight",
                values: { first: event.attackerName, second: event.targetName },
              });
            }
            break;
          }
          case "attackMissed": {
            if (event.entityId !== selfId) break;
            if (event.reason === "playerProtected") {
              setStatus({ key: "game.playerProtected" });
            } else if (event.reason === "noTarget") {
              setStatus({
                key: canMonsterHunt(monsterDna)
                  ? "game.noPrey"
                  : "game.herbivoreAttack",
                values: { cost: 7 },
              });
            }
            break;
          }
          case "pairFailed": {
            if (event.entityId !== selfId) break;
            setStatus({
              key:
                event.reason === "cooldown"
                  ? "game.mateCooldown"
                  : event.reason === "tooFar"
                    ? "game.mateCloser"
                    : event.reason === "notReady"
                      ? "game.mateNeeds"
                      : event.reason === "populationFull"
                        ? "game.populationFull"
                        : "game.noMate",
              values: {
                name: event.partnerName ?? t("game.genericMonster"),
                seconds: event.seconds ?? 0,
              },
            });
            break;
          }
          case "pairRequested": {
            if (event.toEntityId === selfId) {
              setPairing({
                requestId: event.requestId,
                fromName: event.fromEntityName,
                expiresAtMs: Date.now() + PAIR_REQUEST_TIMEOUT_SECONDS * 1000,
              });
            } else if (event.fromEntityId === selfId) {
              setStatus({
                key: "game.pairWaiting",
                values: { name: event.toEntityName },
              });
            }
            break;
          }
          case "pairResolved": {
            if (event.fromEntityId !== selfId && event.toEntityId !== selfId) {
              break;
            }
            setPairing(null);
            if (event.outcome === "rejected") {
              setStatus({ key: "game.pairDeclined" });
            } else if (event.outcome === "expired") {
              setStatus({ key: "game.pairExpired" });
            }
            break;
          }
          case "egg": {
            if (
              event.parentIds.some((id) =>
                agentArenaRef.current.lineageIds.includes(id),
              )
            ) {
              updateAgentArena((current) => ({
                ...current,
                offspring: current.offspring + 1,
                maxGeneration: Math.max(
                  current.maxGeneration,
                  event.generation,
                ),
                lastAction: `Created egg ${event.eggId}`,
              }));
            }
            const mine = selfId !== null && event.parentIds.includes(selfId);
            if (mine) {
              mateCooldownUntil.current =
                Date.now() + MATING_COOLDOWN_SECONDS * 1000;
              setMatingCooldown(MATING_COOLDOWN_SECONDS);
              const partner =
                event.parentIds[0] === selfId
                  ? event.parentNames[1]
                  : event.parentNames[0];
              setStatus({
                key: "game.eggLaid",
                values: { name: partner, mutations: event.mutations },
              });
            }
            setEcosystemEvent({
              key: "game.simEgg",
              values: {
                first: event.parentNames[0],
                second: event.parentNames[1],
              },
            });
            break;
          }
          case "birth": {
            if (
              event.parentIds.some((id) =>
                agentArenaRef.current.lineageIds.includes(id),
              )
            ) {
              updateAgentArena((current) => ({
                ...current,
                lineageIds: current.lineageIds.includes(event.entityId)
                  ? current.lineageIds
                  : [...current.lineageIds, event.entityId],
                maxGeneration: Math.max(
                  current.maxGeneration,
                  event.generation,
                ),
                lastAction: `${event.name} hatched (generation ${event.generation})`,
              }));
            }
            setEcosystemEvent({
              key: "game.simBirth",
              values: { name: event.name, mutations: event.mutations },
            });
            break;
          }
          case "death": {
            if (agentArenaRef.current.lineageIds.includes(event.entityId)) {
              updateAgentArena((current) => ({
                ...current,
                deadLineageIds: current.deadLineageIds.includes(event.entityId)
                  ? current.deadLineageIds
                  : [...current.deadLineageIds, event.entityId],
              }));
            }
            if (event.entityId === agentArenaRef.current.rootEntityId) {
              controls.current.agent.enabled = false;
              updateAgentArena((current) => ({
                ...current,
                status: "dead",
                endedAt: Date.now() / 1000,
                lastAction: `${event.name} died from ${event.cause}`,
              }));
            }
            if (event.entityId === selfId) {
              controls.current.isDead = true;
              controls.current.keys.clear();
              controls.current.move = { x: 0, y: 0 };
              setIsDead(true);
              setDeathReason(event.cause);
              setStatus({
                key:
                  event.cause === "energy" ? "game.ranOut" : "game.lostHealth",
                values: { name: event.name },
              });
              session.markMonsterDead(event.entityId);
              if (document.pointerLockElement) document.exitPointerLock();
            } else {
              setEcosystemEvent({
                key: "game.simDeath",
                values: { name: event.name },
              });
            }
            break;
          }
          case "control": {
            if (event.entityId === selfId && event.change === "aiTakeover") {
              setStatus({
                key: "game.aiTookOver",
                values: { name: activeMonster?.name ?? "" },
              });
            }
            break;
          }
          default:
            break;
        }
      }
    },
    [activeMonster?.name, connection, monsterDna, session, t, updateAgentArena],
  );

  useEffect(
    () => connection.on("events", handleEvents),
    [connection, handleEvents],
  );

  // --- local clocks ---------------------------------------------------------

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAgentScoreNow(Date.now() / 1000);
      const remaining = Math.max(
        0,
        Math.ceil((mateCooldownUntil.current - Date.now()) / 1000),
      );
      setMatingCooldown(remaining);
      setPairing((current) => {
        if (!current) return current;
        const secondsLeft = Math.ceil(
          (current.expiresAtMs - Date.now()) / 1000,
        );
        setPairingSeconds(Math.max(0, secondsLeft));
        return secondsLeft <= 0 ? null : current;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  // --- input ----------------------------------------------------------------

  const reportPlayerFrame = useCallback(
    (frame: {
      x: number;
      y: number;
      z: number;
      moving: boolean;
      sprinting: boolean;
      mode: LocomotionMode;
    }) => {
      controls.current.playerPosition.x = frame.x;
      controls.current.playerPosition.y = frame.y;
      controls.current.playerPosition.z = frame.z;
      controls.current.moving = frame.moving;
      controls.current.sprinting = frame.sprinting;
    },
    [],
  );

  const triggerAction = useCallback(
    (action: "eat" | "attack") => {
      if (controls.current.isDead || controls.current.paused) return;
      if (!connection.isController) return;
      controls.current.action = action;
      controls.current.actionStarted = performance.now();
      connection.sendAction(action);
    },
    [connection],
  );

  const triggerMate = useCallback(() => {
    if (controls.current.isDead || controls.current.paused) return;
    if (!connection.isController) return;
    controls.current.action = "mate";
    controls.current.actionStarted = performance.now();
    connection.sendAction("pair");
  }, [connection]);

  const toggleFlight = useCallback(() => {
    if (
      monsterDna.adaptation !== "wings" ||
      controls.current.isDead ||
      controls.current.paused
    )
      return;
    if (controls.current.locomotionMode === "fly") {
      const overWater = isWaterAt(
        controls.current.playerPosition.x,
        controls.current.playerPosition.z,
      );
      if (overWater && !canMonsterSwim(monsterDna)) {
        setStatus({ key: "game.cannotLandWater" });
        return;
      }
      connection.sendLocomotion("land");
      setStatus({ key: "game.landed" });
      return;
    }
    connection.sendLocomotion("fly");
    setStatus({ key: "game.tookOff" });
  }, [connection, monsterDna]);

  const toggleDive = useCallback(() => {
    if (
      !canMonsterSwim(monsterDna) ||
      controls.current.isDead ||
      controls.current.paused
    )
      return;
    if (controls.current.locomotionMode === "dive") {
      connection.sendLocomotion("surface");
      setStatus({ key: "game.surfaced" });
      return;
    }
    if (
      !isDeepWaterAt(
        controls.current.playerPosition.x,
        controls.current.playerPosition.z,
      )
    ) {
      setStatus({ key: "game.findDeepWater" });
      return;
    }
    connection.sendLocomotion("dive");
    setStatus({ key: "game.dived" });
  }, [connection, monsterDna]);

  const switchMonster = useCallback(
    async (id: string) => {
      if (!id || id === session.selectedMonsterId) return;
      const next = session.monsters.find((monster) => monster.id === id);
      if (!next?.alive) return;
      controls.current.keys.clear();
      controls.current.move = { x: 0, y: 0 };
      controls.current.isDead = false;
      setIsDead(false);
      try {
        await session.selectMonster(id);
        connection.join(id);
        setStatus({ key: "game.nowPlaying", values: { name: next.name } });
      } catch (error) {
        setStatus({
          key: "game.saveFailed",
          values: { message: (error as Error).message },
        });
      }
    },
    [connection, session],
  );

  const copyMonster = useCallback(
    async (id: string) => {
      const copied = await session.copyMonster(id);
      controls.current.keys.clear();
      controls.current.move = { x: 0, y: 0 };
      controls.current.isDead = false;
      setIsDead(false);
      connection.join(copied.id);
      setStatus({
        key: "game.nowPlaying",
        values: { name: copied.name },
      });
    },
    [connection, session],
  );

  const openCreator = useCallback(() => {
    if (!activeMonster) return;
    setMobileMenuOpen(false);
    controls.current.paused = true;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    setCreatorError(null);
    setCreatorDraft({
      mode: "edit",
      dna: monsterDna,
      name: activeMonster.name,
      monsterId: activeMonster.id,
    });
  }, [activeMonster, monsterDna]);

  const openNewMonster = useCallback(() => {
    if (livingMonsters.length >= MAX_FAMILY_SIZE) {
      setStatus({ key: "game.familyFull", values: { count: MAX_FAMILY_SIZE } });
      return;
    }
    setMobileMenuOpen(false);
    controls.current.paused = true;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    setCreatorError(null);
    setCreatorDraft({
      mode: "new",
      dna: DEFAULT_MONSTER_DNA,
      name: `${t("game.genericMonster")} ${session.monsters.length + 1}`,
      monsterId: null,
    });
  }, [livingMonsters.length, session.monsters.length, t]);

  const closeCreator = useCallback(() => {
    controls.current.paused = false;
    controls.current.keys.clear();
    setCreatorDraft(null);
    setCreatorError(null);
  }, []);

  const applyMonsterDna = useCallback(
    (nextDna: MonsterDna, name: string) => {
      const draft = creatorDraft;
      if (!draft) return;
      const dna = encodeMonsterDna(nextDna);
      const save = async () => {
        try {
          if (draft.mode === "new") {
            const monster = await session.createMonster({ name, dna });
            connection.join(monster.id);
            controls.current.isDead = false;
            setIsDead(false);
            setStatus({ key: "game.joined", values: { name } });
          } else if (draft.monsterId) {
            await session.updateMonster(draft.monsterId, { name, dna });
            setStatus({ key: "game.dnaReady", values: { name } });
          }
          controls.current.paused = false;
          controls.current.keys.clear();
          setCreatorDraft(null);
          setCreatorError(null);
        } catch (error) {
          setCreatorError((error as Error).message);
          setStatus({
            key: "game.saveFailed",
            values: { message: (error as Error).message },
          });
        }
      };
      void save();
    },
    [connection, creatorDraft, session],
  );

  const openMobileMenu = useCallback(() => {
    controls.current.paused = true;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    if (document.pointerLockElement) document.exitPointerLock();
    setMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    controls.current.paused = false;
    controls.current.keys.clear();
    controls.current.move = { x: 0, y: 0 };
    controls.current.look = { x: 0, y: 0 };
    setMobileMenuOpen(false);
  }, []);

  const respondToPairing = useCallback(
    (accept: boolean) => {
      if (!pairing) return;
      connection.respondToPair(pairing.requestId, accept);
      setPairing(null);
    },
    [connection, pairing],
  );

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    const updateLook = (time: number) => {
      const delta = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;
      const turn =
        (controls.current.keys.has("ArrowLeft") ? 1 : 0) -
        (controls.current.keys.has("ArrowRight") ? 1 : 0);
      controls.current.cameraYaw = normalizeAngle(
        controls.current.cameraYaw +
          turn * 1.75 * delta -
          controls.current.look.x * 1.9 * delta,
      );
      controls.current.cameraPitch = THREE.MathUtils.clamp(
        controls.current.cameraPitch + controls.current.look.y * 1.25 * delta,
        0.12,
        0.72,
      );
      animationFrame = window.requestAnimationFrame(updateLook);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (controls.current.paused) return;
      controls.current.keys.add(event.code);
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.code,
        )
      )
        event.preventDefault();
      if (!event.repeat && event.code === "Space") triggerAction("attack");
      if (!event.repeat && event.code === "KeyE") triggerAction("eat");
      if (!event.repeat && event.code === "KeyM") triggerMate();
      if (!event.repeat && event.code === "KeyF") toggleFlight();
      if (!event.repeat && event.code === "KeyC") toggleDive();
    };
    const onKeyUp = (event: KeyboardEvent) =>
      controls.current.keys.delete(event.code);
    const onMouseMove = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      controls.current.cameraYaw = normalizeAngle(
        controls.current.cameraYaw - event.movementX * 0.0024,
      );
      controls.current.cameraPitch = THREE.MathUtils.clamp(
        controls.current.cameraPitch + event.movementY * 0.0018,
        0.12,
        0.72,
      );
    };
    const onPointerLock = () =>
      setPointerLocked(Boolean(document.pointerLockElement));
    const onBlur = () => controls.current.keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("blur", onBlur);
    document.addEventListener("pointerlockchange", onPointerLock);
    animationFrame = window.requestAnimationFrame(updateLook);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("pointerlockchange", onPointerLock);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [toggleDive, toggleFlight, triggerAction, triggerMate]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onMenuKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") closeMobileMenu();
    };
    window.addEventListener("keydown", onMenuKeyDown);
    return () => window.removeEventListener("keydown", onMenuKeyDown);
  }, [closeMobileMenu, mobileMenuOpen]);

  // --- visiting agents / WebMCP -------------------------------------------

  const ensureAgentArena = useCallback(() => {
    const self = connection.self?.net;
    if (!self) throw new Error("Join the world with a living monster first.");
    if (!self.alive)
      throw new Error("This monster is dead. Create another one.");
    if (!connection.isController) {
      throw new Error(
        "This browser is observing; it does not control the monster.",
      );
    }
    if (agentArenaRef.current.status === "idle") {
      updateAgentArena(
        startAgentArena(
          self.id,
          self.generation,
          Date.now() / 1000,
          agentArenaRef.current.coachNote,
        ),
      );
    }
    if (agentArenaRef.current.status === "paused") {
      throw new Error(
        "The human coach paused agent control. Observe the world and wait.",
      );
    }
    if (
      agentArenaRef.current.status === "dead" ||
      agentArenaRef.current.status === "ended"
    ) {
      throw new Error(
        "This arena run has ended. Create a new monster to start again.",
      );
    }
    return self;
  }, [connection, updateAgentArena]);

  const readAgentObservation = useCallback(() => {
    const self = connection.self;
    if (!self) throw new Error("The world has not assigned a monster yet.");
    return observeArena({
      self: self.net,
      selfDna: self.dna,
      entities: connection.entities.values(),
      depletedResources: connection.depletedResources,
      population: connection.population,
      eggs: connection.eggs.size,
      worldName: connection.worldName,
      worldTime: connection.estimateWorldTime(),
      scoreTime: Date.now() / 1000,
      arena: agentArenaRef.current,
    });
  }, [connection]);

  const waitForAgentAction = useCallback(
    (durationSeconds: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          return;
        }
        const timer = window.setTimeout(resolve, durationSeconds * 1000);
        signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    [],
  );

  const runAgentMotion = useCallback(
    async (
      motion: {
        label: string;
        forward?: number;
        strafe?: number;
        turn?: number;
        sprint?: boolean;
        heading?: number | null;
        duration?: number;
      },
      signal: AbortSignal,
    ) => {
      ensureAgentArena();
      const duration = THREE.MathUtils.clamp(motion.duration ?? 1.5, 0.25, 8);
      const commandId = controls.current.agent.commandId + 1;
      const heading =
        motion.heading === undefined
          ? controls.current.cameraYaw
          : motion.heading;
      controls.current.agent = {
        enabled: true,
        commandId,
        forward: THREE.MathUtils.clamp(motion.forward ?? 0, -1, 1),
        strafe: THREE.MathUtils.clamp(motion.strafe ?? 0, -1, 1),
        turn: THREE.MathUtils.clamp(motion.turn ?? 0, -1, 1),
        sprint: Boolean(motion.sprint),
        heading,
        label: motion.label,
      };
      if (heading !== null)
        controls.current.cameraYaw = normalizeAngle(heading);
      updateAgentArena((current) => ({
        ...current,
        status: "active",
        lastAction: motion.label,
      }));
      try {
        await waitForAgentAction(duration, signal);
      } finally {
        if (controls.current.agent.commandId === commandId) {
          controls.current.agent.enabled = false;
          controls.current.agent.forward = 0;
          controls.current.agent.strafe = 0;
          controls.current.agent.turn = 0;
          controls.current.agent.sprint = false;
          controls.current.agent.label = "idle";
        }
      }
      return readAgentObservation();
    },
    [
      ensureAgentArena,
      readAgentObservation,
      updateAgentArena,
      waitForAgentAction,
    ],
  );

  const headingToward = useCallback((x: number, z: number) => {
    const from = controls.current.playerPosition;
    return Math.atan2(-(x - from.x), -(z - from.z));
  }, []);

  const approachPoint = useCallback(
    async (
      x: number,
      z: number,
      label: string,
      signal: AbortSignal,
      sprint = false,
    ) => {
      const from = controls.current.playerPosition;
      const distance = Math.hypot(x - from.x, z - from.z);
      if (distance <= 2.3) return;
      await runAgentMotion(
        {
          label,
          forward: 1,
          sprint,
          heading: headingToward(x, z),
          duration: THREE.MathUtils.clamp(distance / (sprint ? 8 : 5), 0.35, 8),
        },
        signal,
      );
    },
    [headingToward, runAgentMotion],
  );

  const createSessionMonster = session.createMonster;

  useEffect(() => {
    if (phase !== "connected") return;
    const registration = new AbortController();
    const numberEnum = (values: readonly number[]) => ({
      type: "integer",
      enum: [...values],
    });
    const stringEnum = (values: readonly string[]) => ({
      type: "string",
      enum: [...values],
    });
    const traitSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        body: stringEnum(BODY_SHAPES),
        legs: numberEnum(LEG_COUNTS),
        legShape: stringEnum(LEG_SHAPES),
        eyes: numberEnum(EYE_COUNTS),
        mouth: stringEnum(MOUTH_SHAPES),
        size: stringEnum(MONSTER_SIZES),
        build: stringEnum(MONSTER_BUILDS),
        color: stringEnum(MONSTER_COLORS.map((color) => color.id)),
        accent: stringEnum(ACCENT_COLORS.map((color) => color.id)),
        pattern: stringEnum(PATTERNS),
        horns: stringEnum(HORN_SHAPES),
        ears: stringEnum(EAR_SHAPES),
        tail: stringEnum(TAIL_SHAPES),
        adaptation: stringEnum(ADAPTATIONS),
        diet: stringEnum(DIETS),
        breathing: stringEnum(RESPIRATIONS),
        social: stringEnum(SOCIAL_BEHAVIORS),
      },
    };
    const tools: WebMcpTool[] = [
      {
        name: "monsters.create_monster",
        title: "Create a DNA monster",
        description:
          "Design and spawn your competing monster. Supply either a complete M6 DNA string or selected traits; omitted traits use a balanced smooth-mesh creature. This starts a fresh domination run and makes the creature visible in the shared 3D world.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string", minLength: 1, maxLength: 32 },
            dna: {
              type: "string",
              description: "Complete deterministic M6 DNA code.",
            },
            traits: traitSchema,
          },
        },
        execute: async (input) => {
          const name =
            typeof input.name === "string" && input.name.trim()
              ? input.name.trim().slice(0, 32)
              : "Agent Monster";
          let dna: MonsterDna;
          if (typeof input.dna === "string") {
            dna = decodeMonsterDna(input.dna);
          } else {
            const traits =
              input.traits && typeof input.traits === "object"
                ? (input.traits as Partial<MonsterDna>)
                : {};
            dna = decodeMonsterDna(
              encodeMonsterDna({
                ...DEFAULT_MONSTER_DNA,
                ...traits,
                mesh: "smooth",
              } as MonsterDna),
            );
          }
          const monster = await createSessionMonster({
            name,
            dna: encodeMonsterDna(dna),
          });
          controls.current.isDead = false;
          controls.current.paused = false;
          connection.join(monster.id);
          updateAgentArena(
            startAgentArena(
              monster.id,
              0,
              Date.now() / 1000,
              agentArenaRef.current.coachNote,
            ),
          );
          return webMcpResult({
            created: {
              id: monster.id,
              name,
              dna: encodeMonsterDna(dna),
              traits: dna,
            },
            next: "Wait for the world to assign control, then call monsters.observe_world.",
          });
        },
      },
      {
        name: "monsters.observe_world",
        title: "Observe Monster Island",
        description:
          "Read the controlled creature, nearby monsters and food, population, human coaching note, and live domination score. Call this before and after actions to choose the next strategy.",
        inputSchema: { type: "object", additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async () => webMcpResult(readAgentObservation()),
      },
      {
        name: "monsters.move",
        title: "Move visibly",
        description:
          "Walk in a camera-relative direction for a bounded duration. The monster and camera animate in real time; the human may override with their controls.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["direction"],
          properties: {
            direction: stringEnum(["forward", "backward", "left", "right"]),
            durationSeconds: {
              type: "number",
              minimum: 0.25,
              maximum: 8,
              default: 1.5,
            },
            sprint: { type: "boolean", default: false },
          },
        },
        execute: async (input, context) => {
          const direction = String(input.direction);
          return webMcpResult(
            await runAgentMotion(
              {
                label: `${input.sprint ? "Sprinting" : "Walking"} ${direction}`,
                forward:
                  direction === "forward"
                    ? 1
                    : direction === "backward"
                      ? -1
                      : 0,
                strafe:
                  direction === "right" ? 1 : direction === "left" ? -1 : 0,
                sprint: Boolean(input.sprint),
                duration:
                  typeof input.durationSeconds === "number"
                    ? input.durationSeconds
                    : 1.5,
              },
              context.signal,
            ),
          );
        },
      },
      {
        name: "monsters.explore",
        title: "Explore the island",
        description:
          "Travel visibly toward an island coordinate or a heading. Without a target, picks a new deterministic heading to scout unfamiliar ground.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            targetX: {
              type: "number",
              minimum: -PLAYABLE_RADIUS,
              maximum: PLAYABLE_RADIUS,
            },
            targetZ: {
              type: "number",
              minimum: -PLAYABLE_RADIUS,
              maximum: PLAYABLE_RADIUS,
            },
            headingRadians: { type: "number", minimum: -6.284, maximum: 6.284 },
            durationSeconds: {
              type: "number",
              minimum: 0.25,
              maximum: 8,
              default: 3,
            },
            sprint: { type: "boolean", default: false },
          },
        },
        execute: async (input, context) => {
          ensureAgentArena();
          const hasTarget =
            typeof input.targetX === "number" &&
            typeof input.targetZ === "number";
          const x = hasTarget
            ? THREE.MathUtils.clamp(
                input.targetX as number,
                -PLAYABLE_RADIUS,
                PLAYABLE_RADIUS,
              )
            : 0;
          const z = hasTarget
            ? THREE.MathUtils.clamp(
                input.targetZ as number,
                -PLAYABLE_RADIUS,
                PLAYABLE_RADIUS,
              )
            : 0;
          const heading = hasTarget
            ? headingToward(x, z)
            : typeof input.headingRadians === "number"
              ? input.headingRadians
              : normalizeAngle(connection.estimateWorldTime() * 0.37 + 1.2);
          return webMcpResult(
            await runAgentMotion(
              {
                label: hasTarget
                  ? `Exploring toward (${x.toFixed(1)}, ${z.toFixed(1)})`
                  : "Exploring a new direction",
                forward: 1,
                heading,
                sprint: Boolean(input.sprint),
                duration:
                  typeof input.durationSeconds === "number"
                    ? input.durationSeconds
                    : 3,
              },
              context.signal,
            ),
          );
        },
      },
      {
        name: "monsters.eat",
        title: "Find and eat food",
        description:
          "Approach a requested or nearby compatible food source, then perform the visible eating animation. Plants feed herbivores and omnivores; prey feeds carnivores and omnivores.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            resourceId: {
              type: "string",
              description: "Food id from observe_world.",
            },
          },
        },
        execute: async (input, context) => {
          const self = ensureAgentArena();
          const dna = connection.self!.dna;
          const candidates = [
            ...(dna.diet !== "carnivore"
              ? EDIBLES.filter(
                  (food) => !connection.depletedResources.has(food.id),
                )
              : []),
            ...(dna.diet !== "herbivore"
              ? PREY.filter(
                  (prey) => !connection.depletedResources.has(prey.id),
                ).map((prey) => ({ ...prey, kind: "prey" as const, energy: 0 }))
              : []),
          ];
          const requested =
            typeof input.resourceId === "string"
              ? candidates.find((food) => food.id === input.resourceId)
              : undefined;
          const food =
            requested ??
            candidates.sort(
              (a, b) =>
                Math.hypot(a.x - self.x, a.z - self.z) -
                Math.hypot(b.x - self.x, b.z - self.z),
            )[0];
          if (!food)
            throw new Error("No compatible food is currently available.");
          await approachPoint(
            food.x,
            food.z,
            `Approaching ${food.id}`,
            context.signal,
          );
          updateAgentArena((current) => ({
            ...current,
            lastAction: `Eating ${food.id}`,
          }));
          triggerAction(
            "kind" in food && food.kind === "prey" ? "attack" : "eat",
          );
          await waitForAgentAction(1, context.signal);
          return webMcpResult(readAgentObservation());
        },
      },
      {
        name: "monsters.attack",
        title: "Attack a monster",
        description:
          "Approach a requested or nearest rival, then perform the visible attack animation. Combat is resolved by the authoritative shared simulation.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            targetId: {
              type: "string",
              description: "Monster id from observe_world.",
            },
          },
        },
        execute: async (input, context) => {
          const self = ensureAgentArena();
          const targets = [...connection.entities.values()]
            .map((record) => record.net)
            .filter((entity) => entity.alive && entity.id !== self.id)
            .sort(
              (a, b) =>
                Math.hypot(a.x - self.x, a.z - self.z) -
                Math.hypot(b.x - self.x, b.z - self.z),
            );
          const target =
            (typeof input.targetId === "string"
              ? targets.find((entity) => entity.id === input.targetId)
              : undefined) ?? targets[0];
          if (!target) throw new Error("No living target is visible.");
          await approachPoint(
            target.x,
            target.z,
            `Approaching ${target.name}`,
            context.signal,
            true,
          );
          updateAgentArena((current) => ({
            ...current,
            lastAction: `Attacking ${target.name}`,
          }));
          triggerAction("attack");
          await waitForAgentAction(0.8, context.signal);
          return webMcpResult(readAgentObservation());
        },
      },
      {
        name: "monsters.flee",
        title: "Flee danger",
        description:
          "Sprint visibly away from a requested threat or the nearest carnivore, keeping the camera with the escaping monster.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            threatId: {
              type: "string",
              description: "Threat id from observe_world.",
            },
            durationSeconds: {
              type: "number",
              minimum: 0.5,
              maximum: 8,
              default: 3,
            },
          },
        },
        execute: async (input, context) => {
          const self = ensureAgentArena();
          const nearby = [...connection.entities.values()]
            .filter((record) => record.net.alive && record.net.id !== self.id)
            .sort(
              (a, b) =>
                Math.hypot(a.net.x - self.x, a.net.z - self.z) -
                Math.hypot(b.net.x - self.x, b.net.z - self.z),
            );
          const threat =
            (typeof input.threatId === "string"
              ? nearby.find((record) => record.net.id === input.threatId)
              : undefined) ??
            nearby.find((record) => record.dna.diet === "carnivore") ??
            nearby[0];
          if (!threat) throw new Error("No visible threat to flee from.");
          const awayX = self.x - threat.net.x;
          const awayZ = self.z - threat.net.z;
          const heading = Math.atan2(-awayX, -awayZ);
          return webMcpResult(
            await runAgentMotion(
              {
                label: `Fleeing ${threat.net.name}`,
                forward: 1,
                heading,
                sprint: true,
                duration:
                  typeof input.durationSeconds === "number"
                    ? input.durationSeconds
                    : 3,
              },
              context.signal,
            ),
          );
        },
      },
      {
        name: "monsters.rest",
        title: "Rest and recover",
        description:
          "Stop moving and remain visibly idle for a bounded duration so health can recover while conserving energy.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            durationSeconds: {
              type: "number",
              minimum: 0.5,
              maximum: 8,
              default: 3,
            },
          },
        },
        execute: async (input, context) => {
          ensureAgentArena();
          controls.current.agent.enabled = false;
          updateAgentArena((current) => ({
            ...current,
            lastAction: "Resting",
          }));
          await waitForAgentAction(
            typeof input.durationSeconds === "number"
              ? input.durationSeconds
              : 3,
            context.signal,
          );
          return webMcpResult(readAgentObservation());
        },
      },
      {
        name: "monsters.breed",
        title: "Find a mate and breed",
        description:
          "Approach a requested or nearby compatible monster and visibly initiate pairing. On success the simulation mixes both DNA strings with mutations, creates an egg, and later hatches a tracked descendant.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: {
            partnerId: {
              type: "string",
              description: "Partner id from observe_world.",
            },
          },
        },
        execute: async (input, context) => {
          const self = ensureAgentArena();
          const partners = [...connection.entities.values()]
            .map((record) => record.net)
            .filter((entity) => entity.alive && entity.id !== self.id)
            .sort(
              (a, b) =>
                Math.hypot(a.x - self.x, a.z - self.z) -
                Math.hypot(b.x - self.x, b.z - self.z),
            );
          const partner =
            (typeof input.partnerId === "string"
              ? partners.find((entity) => entity.id === input.partnerId)
              : undefined) ?? partners[0];
          if (!partner) throw new Error("No possible mate is visible.");
          await approachPoint(
            partner.x,
            partner.z,
            `Approaching ${partner.name} to breed`,
            context.signal,
          );
          updateAgentArena((current) => ({
            ...current,
            lastAction: `Pairing with ${partner.name}`,
          }));
          triggerMate();
          await waitForAgentAction(1, context.signal);
          return webMcpResult(readAgentObservation());
        },
      },
    ];

    void registerWebMcpTools(tools, registration.signal);
    return () => registration.abort();
  }, [
    approachPoint,
    connection,
    createSessionMonster,
    ensureAgentArena,
    headingToward,
    phase,
    readAgentObservation,
    runAgentMotion,
    triggerAction,
    triggerMate,
    updateAgentArena,
    waitForAgentAction,
  ]);

  const monsterName = activeMonster?.name ?? t("game.genericMonster");
  const canPlay = Boolean(selfEntityId) && isController && !isDead;
  const needsFirstMonster = session.monsters.length === 0 && !creatorDraft;
  const dominationScore = scoreAgentArena(
    agentArena,
    agentScoreNow || agentArena.startedAt,
    population,
  );

  return (
    <main className="game-shell">
      {sceneQuality ? (
        <Canvas
          shadows={sceneQuality === "desktop"}
          dpr={sceneQuality === "mobile" ? 1 : [1, 1.6]}
          camera={{ fov: 48, near: 0.1, far: 420, position: [8, 8, 12] }}
          gl={{
            antialias: sceneQuality === "desktop",
            powerPreference: "high-performance",
          }}
          onPointerDown={(event) => {
            if (
              event.pointerType === "mouse" &&
              event.target instanceof HTMLCanvasElement &&
              !document.pointerLockElement
            ) {
              void event.target.requestPointerLock();
            }
          }}
        >
          <World
            connection={connection}
            controls={controls}
            dna={monsterDna}
            name={monsterName}
            quality={sceneQuality}
            selfEntityId={selfEntityId}
            depletedResources={depletedResources}
            onPlayerFrame={reportPlayerFrame}
          />
        </Canvas>
      ) : (
        <div className="scene-loading" role="status" aria-live="polite">
          {t("loading.island")}
        </div>
      )}

      <div
        className={`game-hud${mobileMenuOpen ? " mobile-menu-open" : ""}`}
        aria-live="polite"
      >
        <AccountHub
          guestToken={token}
          monsters={session.monsters}
          selectedDna={encodeMonsterDna(monsterDna)}
          onRefresh={session.refreshMonsters}
          onPlay={switchMonster}
          onCopy={copyMonster}
        />
        <div className="mobile-compact-hud">
          <div className="mobile-player-status">
            <MonsterMark className="mobile-player-mark" />
            <div className="mobile-player-vitals">
              <strong>{monsterName}</strong>
              <div className="mobile-vital-row">
                <Heart size={13} aria-hidden="true" />
                <div
                  className={`mobile-vital-track health${health <= 25 ? " low" : ""}`}
                  title={`${t("game.health")} ${health}`}
                >
                  <i style={{ width: `${health}%` }} />
                </div>
                <span>{health}</span>
              </div>
              <div className="mobile-vital-row">
                <Activity size={13} aria-hidden="true" />
                <div
                  className={`mobile-vital-track energy${energy <= 25 ? " low" : ""}`}
                  title={`${t("game.energy")} ${energy}`}
                >
                  <i style={{ width: `${energy}%` }} />
                </div>
                <span>{energy}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={t("game.openMenu")}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-game-menu"
            onClick={openMobileMenu}
          >
            <Menu size={23} />
          </button>
        </div>
        <div className="hud-top-left">
          <Link href="/" className="back-button" aria-label={t("game.home")}>
            <ArrowLeft size={19} />
          </Link>
          <div className="monster-card">
            <MonsterMark className="hud-monster" />
            <div>
              <span>{monsterName.toUpperCase()}</span>
              <strong>
                {option(monsterDna.diet)} · {t("game.explorer")}
              </strong>
            </div>
          </div>
          <ConnectionBadge phase={phase} />
          <LanguageSwitcher className="game-language-switcher" />
        </div>
        <div className="hud-top-right">
          <div className="dna-hud-row">
            <div className="dna-chip">
              <Dna size={16} />
              <span>
                {monsterDna.eyes}{" "}
                {monsterDna.eyes === 1 ? t("creator.eye") : t("creator.eyes")} ·{" "}
                {option(monsterDna.diet)} · {option(monsterDna.social)}
              </span>
            </div>
            <label className="family-picker">
              <span>{t("game.monster")}</span>
              <select
                value={activeMonster?.id ?? ""}
                onChange={(event) => void switchMonster(event.target.value)}
              >
                {session.monsters.length === 0 && (
                  <option value="">{t("game.createFirst")}</option>
                )}
                {session.monsters.map((monster) => (
                  <option
                    key={monster.id}
                    value={monster.id}
                    disabled={!monster.alive}
                  >
                    {monster.name}
                    {monster.alive ? "" : ` (${t("game.deadLabel")})`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="new-monster-button"
              onClick={openNewMonster}
              disabled={livingMonsters.length >= MAX_FAMILY_SIZE}
            >
              <Plus size={14} /> {t("game.new")}
            </button>
            <button
              type="button"
              className="dna-lab-button"
              onClick={openCreator}
              disabled={!activeMonster?.alive}
            >
              {t("game.edit")}
            </button>
          </div>
          <div className="survival-bars">
            <div
              className={`health-bar${health <= 25 ? " health-low" : ""}${isDead && deathReason === "health" ? " health-empty" : ""}`}
            >
              <i style={{ width: `${health}%` }} />
              <span>
                {t("game.health")} {health}
              </span>
            </div>
            <div
              className={`energy-bar${energy <= 25 ? " energy-low" : ""}${isDead && deathReason === "energy" ? " energy-empty" : ""}`}
            >
              <i style={{ width: `${energy}%` }} />
              <span>
                {t("game.energy")} {energy}
              </span>
            </div>
          </div>
          <div className="locomotion-chip" data-mode={locomotionMode}>
            <span>{t("game.movementMode")}</span>
            <strong>
              {t(`game.mode.${locomotionMode}` as TranslationKey)}
            </strong>
          </div>
        </div>
        <div className="status-bubble">{t(status.key, status.values)}</div>
        <div className="ecosystem-pulse">
          <span className="ecosystem-live">
            <Activity size={13} /> {t("game.ecosystem")}
          </span>
          <strong>{population.living}</strong>
          <span>{t("game.living")}</span>
          <i />
          <Egg size={13} />
          <strong>{population.eggs}</strong>
          <span>{t("game.eggs")}</span>
          <small>{t(ecosystemEvent.key, ecosystemEvent.values)}</small>
        </div>

        <aside
          className={`agent-arena-panel status-${agentArena.status}`}
          aria-label="Visiting agent arena"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <span>WEBMCP AGENT ARENA</span>
              <strong>
                {agentArena.status === "idle"
                  ? "Ready for an agent"
                  : agentArena.status === "dead" ||
                      agentArena.status === "ended"
                    ? "Final domination score"
                    : agentArena.status === "paused"
                      ? "Coach has control"
                      : "Agent is competing"}
              </strong>
            </div>
            <b>{dominationScore.dominationScore}</b>
          </header>
          <p>{agentArena.lastAction}</p>
          <div className="agent-score-grid">
            <span>
              <b>{dominationScore.survivalSeconds}s</b> survived
            </span>
            <span>
              <b>{dominationScore.foodConsumed}</b> food
            </span>
            <span>
              <b>{dominationScore.fightsWon}</b> wins
            </span>
            <span>
              <b>{dominationScore.offspring}</b> offspring
            </span>
            <span>
              <b>{dominationScore.generations}</b> generations
            </span>
            <span>
              <b>{Math.round(dominationScore.populationShare * 100)}%</b> share
            </span>
          </div>
          <label>
            <span>Coach the visiting agent</span>
            <input
              value={agentArena.coachNote}
              maxLength={180}
              onChange={(event) =>
                updateAgentArena((current) => ({
                  ...current,
                  coachNote: event.target.value,
                }))
              }
              placeholder="Stay near water, avoid carnivores…"
            />
          </label>
          <div className="agent-arena-actions">
            <button
              type="button"
              disabled={
                agentArena.status === "idle" ||
                agentArena.status === "dead" ||
                agentArena.status === "ended"
              }
              onClick={() => {
                const pause = agentArenaRef.current.status !== "paused";
                controls.current.agent.enabled = false;
                updateAgentArena((current) => ({
                  ...current,
                  status: pause ? "paused" : "active",
                  lastAction: pause
                    ? "Human coach took control"
                    : "Agent control resumed",
                }));
              }}
            >
              {agentArena.status === "paused" ? "Resume agent" : "Take control"}
            </button>
            <button
              type="button"
              disabled={
                agentArena.status === "idle" ||
                agentArena.status === "dead" ||
                agentArena.status === "ended"
              }
              onClick={() => {
                controls.current.agent.enabled = false;
                updateAgentArena((current) => ({
                  ...current,
                  status: "ended",
                  endedAt: Date.now() / 1000,
                  lastAction: "Run ended by the human coach",
                }));
              }}
            >
              End run
            </button>
          </div>
        </aside>

        {pairing && (
          <PairingRequestCard
            request={pairing}
            secondsLeft={pairingSeconds}
            onRespond={respondToPairing}
          />
        )}

        {mobileMenuOpen && (
          <div
            className="mobile-menu-backdrop"
            onPointerDown={(event) => {
              event.stopPropagation();
              if (event.target === event.currentTarget) closeMobileMenu();
            }}
          >
            <section
              id="mobile-game-menu"
              className="mobile-game-menu"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-game-menu-title"
            >
              <header className="mobile-game-menu-header">
                <div>
                  <span>{t("game.menuKicker")}</span>
                  <h2 id="mobile-game-menu-title">{t("game.menu")}</h2>
                </div>
                <button
                  type="button"
                  className="mobile-menu-close"
                  onClick={closeMobileMenu}
                  aria-label={t("game.closeMenu")}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </header>

              <div className="mobile-menu-creature">
                <MonsterMark className="mobile-menu-monster" />
                <div>
                  <span>{t("game.yourMonster")}</span>
                  <strong>{monsterName}</strong>
                  <small>
                    {option(monsterDna.diet)} · {option(monsterDna.social)} ·{" "}
                    {monsterDna.eyes}{" "}
                    {monsterDna.eyes === 1
                      ? t("creator.eye")
                      : t("creator.eyes")}
                  </small>
                </div>
                <div className="mobile-menu-mode" data-mode={locomotionMode}>
                  {t(`game.mode.${locomotionMode}` as TranslationKey)}
                </div>
              </div>

              <div className="mobile-menu-section">
                <span className="mobile-menu-label">
                  {t("game.monsterFamily")}
                </span>
                <label className="mobile-family-picker">
                  <span>{t("game.monster")}</span>
                  <select
                    value={activeMonster?.id ?? ""}
                    onChange={(event) => void switchMonster(event.target.value)}
                  >
                    {session.monsters.length === 0 && (
                      <option value="">{t("game.createFirst")}</option>
                    )}
                    {session.monsters.map((monster) => (
                      <option
                        key={monster.id}
                        value={monster.id}
                        disabled={!monster.alive}
                      >
                        {monster.name}
                        {monster.alive ? "" : ` (${t("game.deadLabel")})`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mobile-menu-button-row">
                  <button
                    type="button"
                    onClick={openCreator}
                    disabled={!activeMonster?.alive}
                  >
                    <Pencil size={16} /> {t("game.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={openNewMonster}
                    disabled={livingMonsters.length >= MAX_FAMILY_SIZE}
                  >
                    <Plus size={16} /> {t("game.new")}
                  </button>
                </div>
              </div>

              <div className="mobile-menu-grid">
                <div className="mobile-menu-section mobile-island-status">
                  <span className="mobile-menu-label">
                    {t("game.islandStatus")}
                  </span>
                  <div>
                    <Activity size={17} />
                    <strong>{population.living}</strong>
                    <span>{t("game.living")}</span>
                  </div>
                  <div>
                    <Egg size={17} />
                    <strong>{population.eggs}</strong>
                    <span>{t("game.eggs")}</span>
                  </div>
                </div>
                <div className="mobile-menu-section mobile-language-section">
                  <span className="mobile-menu-label">
                    {t("language.label")}
                  </span>
                  <LanguageSwitcher className="mobile-menu-language" />
                </div>
              </div>

              <div className="mobile-menu-section">
                <span className="mobile-menu-label">
                  {t("game.moreActions")}
                </span>
                <div className="mobile-menu-actions">
                  <button
                    type="button"
                    disabled={!canPlay || matingCooldown > 0}
                    onClick={() => {
                      closeMobileMenu();
                      triggerMate();
                    }}
                  >
                    {matingCooldown > 0 ? (
                      <Egg size={18} />
                    ) : (
                      <Heart size={18} />
                    )}
                    <span>
                      {matingCooldown > 0
                        ? t("game.mateReadyIn", { seconds: matingCooldown })
                        : t("game.mateButton")}
                    </span>
                  </button>
                  {monsterDna.adaptation === "wings" && (
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        closeMobileMenu();
                        toggleFlight();
                      }}
                    >
                      <Wind size={18} />
                      <span>
                        {locomotionMode === "fly"
                          ? t("game.landButton")
                          : t("game.flyButton")}
                      </span>
                    </button>
                  )}
                  {canMonsterSwim(monsterDna) && (
                    <button
                      type="button"
                      disabled={!canPlay}
                      onClick={() => {
                        closeMobileMenu();
                        toggleDive();
                      }}
                    >
                      <Waves size={18} />
                      <span>
                        {locomotionMode === "dive"
                          ? t("game.surfaceButton")
                          : t("game.diveButton")}
                      </span>
                    </button>
                  )}
                </div>
                <p className="mobile-menu-event">
                  {t(ecosystemEvent.key, ecosystemEvent.values)}
                </p>
              </div>

              <div className="mobile-menu-section mobile-agent-arena">
                <span className="mobile-menu-label">WebMCP agent arena</span>
                <div className="mobile-agent-score">
                  <strong>{dominationScore.dominationScore}</strong>
                  <span>{agentArena.lastAction}</span>
                </div>
                <div className="mobile-agent-metrics">
                  <span>{dominationScore.survivalSeconds}s survived</span>
                  <span>{dominationScore.foodConsumed} food</span>
                  <span>{dominationScore.fightsWon} wins</span>
                  <span>{dominationScore.offspring} offspring</span>
                  <span>{dominationScore.generations} generations</span>
                  <span>
                    {Math.round(dominationScore.populationShare * 100)}% share
                  </span>
                </div>
                <label className="mobile-agent-coach">
                  <span>Strategy note for the agent</span>
                  <input
                    value={agentArena.coachNote}
                    maxLength={180}
                    onChange={(event) =>
                      updateAgentArena((current) => ({
                        ...current,
                        coachNote: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="agent-arena-actions">
                  <button
                    type="button"
                    disabled={
                      agentArena.status === "idle" ||
                      agentArena.status === "dead" ||
                      agentArena.status === "ended"
                    }
                    onClick={() => {
                      const pause = agentArenaRef.current.status !== "paused";
                      controls.current.agent.enabled = false;
                      updateAgentArena((current) => ({
                        ...current,
                        status: pause ? "paused" : "active",
                        lastAction: pause
                          ? "Human coach took control"
                          : "Agent control resumed",
                      }));
                    }}
                  >
                    {agentArena.status === "paused"
                      ? "Resume agent"
                      : "Take control"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      agentArena.status === "idle" ||
                      agentArena.status === "dead" ||
                      agentArena.status === "ended"
                    }
                    onClick={() => {
                      controls.current.agent.enabled = false;
                      updateAgentArena((current) => ({
                        ...current,
                        status: "ended",
                        endedAt: Date.now() / 1000,
                        lastAction: "Run ended by the human coach",
                      }));
                    }}
                  >
                    End run
                  </button>
                </div>
              </div>

              <div className="mobile-menu-footer">
                <Link href="/" className="mobile-menu-exit">
                  <ArrowLeft size={17} /> {t("game.exitIsland")}
                </Link>
                <button
                  type="button"
                  className="mobile-menu-continue"
                  onClick={closeMobileMenu}
                >
                  {t("game.continue")}
                </button>
              </div>
            </section>
          </div>
        )}

        {needsFirstMonster && (
          <div className="death-card" role="dialog" aria-modal="false">
            <span>{t("net.observer")}</span>
            <strong>{t("game.createFirst")}</strong>
            <div className="death-actions">
              <button type="button" onClick={openNewMonster}>
                <Plus size={15} /> {t("game.new")}
              </button>
            </div>
          </div>
        )}

        {isDead && (
          <div className="death-card" role="dialog" aria-modal="true">
            <span>
              {deathReason === "energy"
                ? t("game.outOfEnergy")
                : t("game.outOfHealth")}
            </span>
            <strong>{t("game.collapsed", { name: monsterName })}</strong>
            <p>{t("game.monsterDied", { name: monsterName })}</p>
            {agentArena.rootEntityId === selfEntityId && (
              <div className="death-scorecard">
                <span>FINAL DOMINATION SCORE</span>
                <strong>{dominationScore.dominationScore}</strong>
                <small>
                  {dominationScore.survivalSeconds}s ·{" "}
                  {dominationScore.foodConsumed} food ·{" "}
                  {dominationScore.fightsWon} wins · {dominationScore.offspring}{" "}
                  offspring ·{" "}
                  {Math.round(dominationScore.populationShare * 100)}%
                  population
                </small>
              </div>
            )}
            <div className="death-actions">
              {livingMonsters.length > 0 && (
                <button
                  type="button"
                  onClick={() => void switchMonster(livingMonsters[0].id)}
                >
                  {t("game.nowPlaying", { name: livingMonsters[0].name })}
                </button>
              )}
              <button type="button" onClick={openNewMonster}>
                <Plus size={15} /> {t("game.new")}
              </button>
            </div>
          </div>
        )}

        {!pointerLocked && (
          <div className="mouse-hint">
            <MousePointer2 size={18} />
            <span>{t("game.mouseHint")}</span>
          </div>
        )}

        <div className="desktop-controls">
          <div>
            <kbd>W</kbd>
            <kbd>S</kbd>
            <span>{t("game.forwardBack")}</span>
          </div>
          <div>
            <kbd>A</kbd>
            <kbd>D</kbd>
            <span>{t("game.sideways")}</span>
          </div>
          <div>
            <MousePointer2 size={16} />
            <span>{t("game.camera")}</span>
          </div>
          <div>
            <kbd>←</kbd>
            <kbd>→</kbd>
            <span>{t("game.turnCamera")}</span>
          </div>
          <div>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>{t("game.forwardBack")}</span>
          </div>
          <div>
            <kbd>E</kbd>
            <span>{t("game.eat")}</span>
          </div>
          <div>
            <kbd>SPACE</kbd>
            <span>{t("game.attack")}</span>
          </div>
          <div>
            <kbd>M</kbd>
            <span>{t("game.mate")}</span>
          </div>
          <div>
            <kbd>SHIFT</kbd>
            <span>{t("game.sprint")}</span>
          </div>
        </div>

        <div className="mobile-controls">
          <Joystick
            label={t("game.move")}
            onMove={(x, y) => {
              controls.current.move = { x, y };
            }}
          />
          <Joystick
            label={t("game.look")}
            onMove={(x, y) => {
              controls.current.look = { x, y: -y };
            }}
          />
        </div>

        <div className="action-controls">
          <button
            type="button"
            className="action-button eat-button"
            disabled={!canPlay}
            onPointerDown={(event) => {
              event.stopPropagation();
              triggerAction("eat");
            }}
          >
            <Leaf size={25} />
            <span>{t("game.eatButton")}</span>
            <small>E</small>
          </button>
          <button
            type="button"
            className="action-button attack-button"
            disabled={!canPlay}
            onPointerDown={(event) => {
              event.stopPropagation();
              triggerAction("attack");
            }}
          >
            <Swords size={25} />
            <span>
              {canMonsterHunt(monsterDna)
                ? t("game.huntButton")
                : t("game.attackButton")}
            </span>
            <small>{t("game.space")}</small>
          </button>
          <button
            type="button"
            className="action-button mate-button"
            disabled={!canPlay || matingCooldown > 0}
            onPointerDown={(event) => {
              event.stopPropagation();
              triggerMate();
            }}
          >
            {matingCooldown > 0 ? <Egg size={24} /> : <Heart size={24} />}
            <span>
              {matingCooldown > 0
                ? t("game.mateReadyIn", { seconds: matingCooldown })
                : t("game.mateButton")}
            </span>
            <small>M</small>
          </button>
        </div>

        {(monsterDna.adaptation === "wings" || canMonsterSwim(monsterDna)) && (
          <div className="ability-controls">
            {monsterDna.adaptation === "wings" && (
              <button
                type="button"
                className={`ability-button${locomotionMode === "fly" ? " active" : ""}`}
                disabled={!canPlay}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  toggleFlight();
                }}
              >
                <Wind size={18} />
                <span>
                  {locomotionMode === "fly"
                    ? t("game.landButton")
                    : t("game.flyButton")}
                </span>
                <small>F</small>
              </button>
            )}
            {canMonsterSwim(monsterDna) && (
              <button
                type="button"
                className={`ability-button${locomotionMode === "dive" ? " active" : ""}`}
                disabled={!canPlay}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  toggleDive();
                }}
              >
                <Waves size={18} />
                <span>
                  {locomotionMode === "dive"
                    ? t("game.surfaceButton")
                    : t("game.diveButton")}
                </span>
                <small>C</small>
              </button>
            )}
          </div>
        )}

        <div className="water-rule">
          <Crosshair size={14} />
          <span>
            {canMonsterSwim(monsterDna)
              ? t("game.waterOpen")
              : t("game.waterClosed")}
          </span>
        </div>
      </div>
      {creatorDraft && (
        <MonsterCreator
          key={`${creatorDraft.mode}-${creatorDraft.monsterId ?? "new"}`}
          dna={creatorDraft.dna}
          name={creatorDraft.name}
          error={creatorError}
          onApply={applyMonsterDna}
          onClose={closeCreator}
        />
      )}
    </main>
  );
}
