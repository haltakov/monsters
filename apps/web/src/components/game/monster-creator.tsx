"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Check, Dna, Rotate3D, Shuffle, X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ACCENT_COLORS,
  BODY_SHAPES,
  decodeMonsterDna,
  encodeMonsterDna,
  EYE_COUNTS,
  HORN_SHAPES,
  LEG_COUNTS,
  LEG_SHAPES,
  MONSTER_COLORS,
  MONSTER_SIZES,
  MOUTH_SHAPES,
  PATTERNS,
  type MonsterDna,
} from "@/components/game/monster-dna";
import { MonsterVisual } from "@/components/game/monster-model";

type MonsterCreatorProps = {
  dna: MonsterDna;
  onApply: (dna: MonsterDna) => void;
  onClose: () => void;
};

const LABELS: Record<string, string> = {
  round: "Round",
  bean: "Bean",
  long: "Long",
  stubby: "Stubby",
  hoof: "Hooves",
  springy: "Springy",
  smile: "Smile",
  fangs: "Fangs",
  beak: "Beak",
  small: "Small",
  medium: "Medium",
  large: "Large",
  plain: "Plain",
  spots: "Spots",
  stripes: "Stripes",
  none: "None",
  buds: "Buds",
  spikes: "Spikes",
};

function GeneChoices<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="gene-field">
      <legend>{label}</legend>
      <div className="gene-options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? "selected" : ""}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {LABELS[String(option)] ?? option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ColorChoices({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ id: string; label: string; hex: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="gene-field color-gene-field">
      <legend>{label}</legend>
      <div className="color-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "selected" : ""}
            aria-label={`${label}: ${option.label}`}
            aria-pressed={value === option.id}
            title={option.label}
            style={{ "--swatch": option.hex } as CSSProperties}
            onClick={() => onChange(option.id)}
          >
            <span />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function randomOption<T>(options: readonly T[]) {
  return options[Math.floor(Math.random() * options.length)];
}

export function MonsterCreator({ dna, onApply, onClose }: MonsterCreatorProps) {
  const [draft, setDraft] = useState<MonsterDna>(dna);
  const [dnaText, setDnaText] = useState(() => encodeMonsterDna(dna));
  const [dnaError, setDnaError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.code === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const updateDraft = (next: MonsterDna) => {
    setDraft(next);
    setDnaText(encodeMonsterDna(next));
    setDnaError(null);
  };

  const changeGene = <Key extends keyof MonsterDna>(
    key: Key,
    value: MonsterDna[Key],
  ) => updateDraft({ ...draft, [key]: value });

  const editDna = (source: string) => {
    setDnaText(source);
    try {
      const parsed = decodeMonsterDna(source);
      setDraft(parsed);
      setDnaError(null);
    } catch (error) {
      setDnaError(error instanceof Error ? error.message : "Invalid DNA");
    }
  };

  const surpriseMe = () => {
    updateDraft({
      body: randomOption(BODY_SHAPES),
      legs: randomOption(LEG_COUNTS),
      legShape: randomOption(LEG_SHAPES),
      eyes: randomOption(EYE_COUNTS),
      mouth: randomOption(MOUTH_SHAPES),
      size: randomOption(MONSTER_SIZES),
      color: randomOption(MONSTER_COLORS).id,
      accent: randomOption(ACCENT_COLORS).id,
      pattern: randomOption(PATTERNS),
      horns: randomOption(HORN_SHAPES),
    });
  };

  return (
    <div
      className="creator-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="creator-title"
    >
      <section className="creator-lab">
        <header className="creator-header">
          <div>
            <span className="creator-kicker">
              <Dna size={15} /> DNA LAB · SPECIMEN 001
            </span>
            <h2 id="creator-title">Build your monster</h2>
          </div>
          <button
            type="button"
            className="creator-close"
            onClick={onClose}
            aria-label="Close creator"
          >
            <X size={20} />
          </button>
        </header>

        <div className="creator-layout">
          <div className="creator-stage">
            <div className="creator-canvas">
              <Canvas shadows camera={{ fov: 42, position: [4.2, 2.8, -5.2] }}>
                <color attach="background" args={["#B9DFD8"]} />
                <hemisphereLight
                  intensity={1.75}
                  color="#FFF4D5"
                  groundColor="#4B7B68"
                />
                <directionalLight
                  castShadow
                  intensity={2.4}
                  position={[-4, 7, -4]}
                  shadow-mapSize={[1024, 1024]}
                />
                <group position={[0, -0.28, 0]} rotation={[0, 0.28, 0]}>
                  <MonsterVisual dna={draft} />
                </group>
                <mesh position={[0, -0.43, 0]} receiveShadow>
                  <cylinderGeometry args={[2.05, 2.25, 0.25, 64]} />
                  <meshStandardMaterial color="#E4C16E" roughness={0.9} />
                </mesh>
                <ContactShadows
                  position={[0, -0.29, 0]}
                  opacity={0.38}
                  scale={7}
                  blur={2.4}
                  far={5}
                />
                <OrbitControls
                  makeDefault
                  enablePan={false}
                  minDistance={3.7}
                  maxDistance={7}
                  minPolarAngle={Math.PI * 0.24}
                  maxPolarAngle={Math.PI * 0.56}
                  target={[0, 1, 0]}
                />
              </Canvas>
            </div>
            <div className="rotate-hint">
              <Rotate3D size={16} /> Drag to rotate · scroll to zoom
            </div>
            <div className="specimen-stats">
              <span>
                {draft.eyes} {draft.eyes === 1 ? "eye" : "eyes"}
              </span>
              <span>{draft.legs} legs</span>
              <span>{draft.pattern}</span>
              <span>{draft.size}</span>
            </div>
          </div>

          <div className="creator-controls">
            <div className="builder-heading">
              <div>
                <span>CHARACTER BUILDER</span>
                <strong>Every choice writes one gene.</strong>
              </div>
              <button
                type="button"
                className="surprise-button"
                onClick={surpriseMe}
              >
                <Shuffle size={14} /> Surprise me
              </button>
            </div>

            <div className="gene-grid">
              <GeneChoices
                label="Body shape"
                value={draft.body}
                options={BODY_SHAPES}
                onChange={(value) => changeGene("body", value)}
              />
              <GeneChoices
                label="Size"
                value={draft.size}
                options={MONSTER_SIZES}
                onChange={(value) => changeGene("size", value)}
              />
              <GeneChoices
                label="Number of legs"
                value={draft.legs}
                options={LEG_COUNTS}
                onChange={(value) => changeGene("legs", value)}
              />
              <GeneChoices
                label="Leg shape"
                value={draft.legShape}
                options={LEG_SHAPES}
                onChange={(value) => changeGene("legShape", value)}
              />
              <GeneChoices
                label="Number of eyes"
                value={draft.eyes}
                options={EYE_COUNTS}
                onChange={(value) => changeGene("eyes", value)}
              />
              <GeneChoices
                label="Mouth"
                value={draft.mouth}
                options={MOUTH_SHAPES}
                onChange={(value) => changeGene("mouth", value)}
              />
              <GeneChoices
                label="Pattern"
                value={draft.pattern}
                options={PATTERNS}
                onChange={(value) => changeGene("pattern", value)}
              />
              <GeneChoices
                label="Horns"
                value={draft.horns}
                options={HORN_SHAPES}
                onChange={(value) => changeGene("horns", value)}
              />
              <ColorChoices
                label="Body color"
                value={draft.color}
                options={MONSTER_COLORS}
                onChange={(value) =>
                  changeGene("color", value as MonsterDna["color"])
                }
              />
              <ColorChoices
                label="Accent color"
                value={draft.accent}
                options={ACCENT_COLORS}
                onChange={(value) =>
                  changeGene("accent", value as MonsterDna["accent"])
                }
              />
            </div>

            <label className={`dna-tape${dnaError ? " invalid" : ""}`}>
              <span>
                <Dna size={14} /> DIRECT DNA EDITOR
              </span>
              <textarea
                value={dnaText}
                rows={4}
                spellCheck={false}
                aria-invalid={Boolean(dnaError)}
                onChange={(event) => editDna(event.target.value)}
              />
              <small>
                {dnaError ??
                  "M1 is the DNA version. Gene order is fixed so every code is unique."}
              </small>
            </label>
          </div>
        </div>

        <footer className="creator-footer">
          <span>
            10 genes · deterministic geometry · no random visual state
          </span>
          <div>
            <button type="button" className="creator-cancel" onClick={onClose}>
              Keep current monster
            </button>
            <button
              type="button"
              className="creator-apply"
              disabled={Boolean(dnaError)}
              onClick={() => onApply(draft)}
            >
              <Check size={17} /> Play as this monster
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
