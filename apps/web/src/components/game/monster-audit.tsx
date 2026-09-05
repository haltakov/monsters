"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { AUDIT_COMPARISONS } from "@/components/game/monster-audit-data";
import { MonsterVisual } from "@/components/game/monster-model";
import type { MonsterMotionState } from "@/components/game/monster-model";

const PAGE_SIZE = 10;
type AuditMode = keyof typeof AUDIT_COMPARISONS;
type AuditView = "front" | "side" | "rear";
const AUDIT_VIEW_ROTATION: Record<AuditView, number> = {
  front: 0.48,
  side: Math.PI / 2,
  rear: Math.PI + 0.48,
};

function AuditCamera({ focused }: { focused: boolean }) {
  const size = useThree((state) => state.size);
  return (
    <OrthographicCamera
      key={String(focused)}
      makeDefault
      position={[0, 1.1, -30]}
      rotation={[0, Math.PI, 0]}
      zoom={
        focused
          ? Math.min(size.width / 7, size.height / 7)
          : Math.min(size.width / 25, size.height / 15)
      }
    />
  );
}

function AuditMotion({
  active,
  motionRef,
}: {
  active: boolean;
  motionRef: React.RefObject<MonsterMotionState>;
}) {
  useFrame(({ clock }) => {
    motionRef.current = {
      stride: active ? Math.sin(clock.elapsedTime * 5) * 0.65 : 0,
      intensity: active ? 0.8 : 0,
      gait: active ? "walk" : "idle",
    };
  });
  return null;
}

export function MonsterAudit() {
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<AuditMode>("morphology");
  const [view, setView] = useState<AuditView>("front");
  const [walking, setWalking] = useState(false);
  const [quality, setQuality] = useState<"hero" | "remote">("hero");
  const [focus, setFocus] = useState<number | null>(null);
  const idleMotion = useRef<MonsterMotionState>({
    stride: 0,
    intensity: 0,
    gait: "idle",
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const parameters = new URLSearchParams(window.location.search);
      const requestedMode = parameters.get("mode");
      const requested = Number(parameters.get("page"));
      if (requestedMode && Object.hasOwn(AUDIT_COMPARISONS, requestedMode))
        setMode(requestedMode as AuditMode);
      if (Number.isFinite(requested)) {
        setPage(Math.max(0, Math.floor(requested)));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const allSpecimens = AUDIT_COMPARISONS[mode];
  const pageCount = Math.ceil(allSpecimens.length / PAGE_SIZE);
  const safePage = Math.min(page, pageCount - 1);
  const specimens = useMemo(
    () =>
      focus === null
        ? allSpecimens.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
        : allSpecimens.filter((specimen) => specimen.id === focus),
    [allSpecimens, safePage, focus],
  );

  const changePage = (next: number) => {
    const nextPage = Math.max(0, Math.min(pageCount - 1, next));
    setPage(nextPage);
    setFocus(null);
    window.history.replaceState(null, "", `?mode=${mode}&page=${nextPage}`);
  };

  const changeMode = (nextMode: AuditMode) => {
    setMode(nextMode);
    setPage(0);
    setFocus(null);
    window.history.replaceState(null, "", `?mode=${nextMode}&page=0`);
  };

  const cycleView = () => {
    setView((current) =>
      current === "front" ? "side" : current === "side" ? "rear" : "front",
    );
  };

  return (
    <main className="monster-audit">
      <header className="monster-audit-header">
        <div>
          <span>SMOOTH MESH · DETERMINISTIC QA</span>
          <h1>
            {mode === "morphology"
              ? "100-monster morphology audit"
              : `Compare ${mode}`}
          </h1>
        </div>
        <div className="monster-audit-actions">
          {focus !== null && (
            <button type="button" onClick={() => setFocus(null)}>
              Back to grid
            </button>
          )}
          <button type="button" onClick={cycleView}>
            {view === "front"
              ? "Side view"
              : view === "side"
                ? "Rear view"
                : "Front view"}
          </button>
          <select
            aria-label="Compare trait"
            value={mode}
            onChange={(event) => changeMode(event.target.value as AuditMode)}
          >
            {Object.keys(AUDIT_COMPARISONS).map((key) => (
              <option key={key} value={key}>
                {key === "morphology" ? "100 monsters" : key}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setWalking(!walking)}>
            {walking ? "Stop walking" : "Walk"}
          </button>
          <button
            type="button"
            onClick={() => setQuality(quality === "hero" ? "remote" : "hero")}
          >
            {quality === "hero" ? "Use remote LOD" : "Use hero LOD"}
          </button>
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => changePage(safePage - 1)}
          >
            Previous
          </button>
          <strong>
            {safePage + 1} / {pageCount}
          </strong>
          <button
            type="button"
            disabled={safePage === pageCount - 1}
            onClick={() => changePage(safePage + 1)}
          >
            Next
          </button>
          <a href="/game/">Return to game</a>
        </div>
      </header>

      <section className="monster-audit-stage">
        <Canvas dpr={[1, 1.35]} frameloop="always">
          <color attach="background" args={["#C7E6DF"]} />
          <hemisphereLight
            intensity={2.1}
            color="#FFF4D6"
            groundColor="#41695B"
          />
          <directionalLight intensity={2.4} position={[-8, 12, -10]} />
          <AuditCamera focused={focus !== null} />
          {focus !== null && (
            <OrbitControls target={[0, 1.1, 0]} enablePan={false} />
          )}
          <AuditMotion active={walking} motionRef={idleMotion} />
          {specimens.map((specimen, index) => {
            const column = index % 5;
            const row = Math.floor(index / 5);
            return (
              <group
                key={`${mode}:${specimen.id}`}
                position={
                  focus !== null
                    ? [0, 0, 0]
                    : [(2 - column) * 5, (0.5 - row) * 7 - 1.4, 0]
                }
                rotation={[0, AUDIT_VIEW_ROTATION[view], 0]}
              >
                <MonsterVisual
                  dna={specimen.dna}
                  motionRef={idleMotion}
                  castShadow={false}
                  geometryQuality={quality}
                />
                <mesh position={[0, -0.16, 0]} scale={[1.5, 0.08, 1.1]}>
                  <sphereGeometry args={[1, 24, 12]} />
                  <meshStandardMaterial color="#DAB964" roughness={0.92} />
                </mesh>
              </group>
            );
          })}
        </Canvas>
        <div className="monster-audit-labels">
          {specimens.map((specimen) => (
            <div key={specimen.id}>
              <button
                type="button"
                onClick={() => setFocus(specimen.id)}
                aria-label={`Inspect specimen ${specimen.id}`}
              >
                #{String(specimen.id).padStart(3, "0")} · Inspect
              </button>
              <span>
                {specimen.dna.body} · {specimen.dna.legs}{" "}
                {specimen.dna.legShape} · {specimen.dna.build}
              </span>
              <span>
                {specimen.dna.eyes} eyes · {specimen.dna.mouth} ·{" "}
                {specimen.dna.pattern} · {specimen.dna.size}
              </span>
              <span>
                {specimen.dna.horns}/{specimen.dna.ears} · {specimen.dna.tail}/
                {specimen.dna.adaptation}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
