"use client";

import { Canvas } from "@react-three/fiber";
import { OrthographicCamera } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { AUDIT_SPECIMENS } from "@/components/game/monster-audit-data";
import { MonsterVisual } from "@/components/game/monster-model";
import type { MonsterMotionState } from "@/components/game/monster-model";

const PAGE_SIZE = 10;
const PAGE_COUNT = Math.ceil(AUDIT_SPECIMENS.length / PAGE_SIZE);
type AuditView = "front" | "side" | "rear";
const AUDIT_VIEW_ROTATION: Record<AuditView, number> = {
  front: 0.48,
  side: Math.PI / 2,
  rear: Math.PI + 0.48,
};

export function MonsterAudit() {
  const [page, setPage] = useState(0);
  const [view, setView] = useState<AuditView>("front");
  const idleMotion = useRef<MonsterMotionState>({
    stride: 0,
    intensity: 0,
    gait: "idle",
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const requested = Number(
        new URLSearchParams(window.location.search).get("page"),
      );
      if (Number.isFinite(requested)) {
        setPage(Math.max(0, Math.min(PAGE_COUNT - 1, Math.floor(requested))));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const specimens = useMemo(
    () => AUDIT_SPECIMENS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [page],
  );

  const changePage = (next: number) => {
    const safePage = Math.max(0, Math.min(PAGE_COUNT - 1, next));
    setPage(safePage);
    window.history.replaceState(null, "", `?page=${safePage}`);
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
          <h1>100-monster morphology audit</h1>
        </div>
        <div className="monster-audit-actions">
          <button type="button" onClick={cycleView}>
            {view === "front"
              ? "Side view"
              : view === "side"
                ? "Rear view"
                : "Front view"}
          </button>
          <button
            type="button"
            disabled={page === 0}
            onClick={() => changePage(page - 1)}
          >
            Previous
          </button>
          <strong>
            {page + 1} / {PAGE_COUNT}
          </strong>
          <button
            type="button"
            disabled={page === PAGE_COUNT - 1}
            onClick={() => changePage(page + 1)}
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
          <OrthographicCamera
            makeDefault
            position={[0, 1.1, -30]}
            rotation={[0, Math.PI, 0]}
            zoom={42}
          />
          {specimens.map((specimen, index) => {
            const column = index % 5;
            const row = Math.floor(index / 5);
            return (
              <group
                key={specimen.id}
                position={[(column - 2) * 4.75, (0.5 - row) * 5.05 - 0.4, 0]}
                rotation={[0, AUDIT_VIEW_ROTATION[view], 0]}
              >
                <MonsterVisual
                  dna={specimen.dna}
                  motionRef={idleMotion}
                  castShadow={false}
                />
                <mesh position={[0, -0.16, 0]} scale={[1.5, 0.08, 1.1]}>
                  <sphereGeometry args={[1, 24, 12]} />
                  <meshStandardMaterial color="#DAB964" roughness={0.92} />
                </mesh>
              </group>
            );
          })}
        </Canvas>
        <div className="monster-audit-labels" aria-hidden="true">
          {specimens.map((specimen) => (
            <div key={specimen.id}>
              <strong>#{String(specimen.id).padStart(3, "0")}</strong>
              <span>
                {specimen.dna.body} · {specimen.dna.legs}{" "}
                {specimen.dna.legShape} · {specimen.dna.build}
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
