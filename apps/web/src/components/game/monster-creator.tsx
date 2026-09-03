"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Check, Dna, Rotate3D, Shuffle, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  ACCENT_COLORS,
  ADAPTATIONS,
  BODY_SHAPES,
  decodeMonsterDna,
  DIETS,
  EAR_SHAPES,
  encodeMonsterDna,
  EYE_COUNTS,
  getMonsterFollowerCount,
  LEG_COUNTS,
  LEG_SHAPES,
  MONSTER_COLORS,
  MONSTER_BUILDS,
  MONSTER_SIZES,
  MOUTH_SHAPES,
  RESPIRATIONS,
  SOCIAL_BEHAVIORS,
  SMOOTH_HORN_SHAPES,
  SMOOTH_PATTERNS,
  TAIL_SHAPES,
  type MonsterDna,
} from "@/components/game/monster-dna";
import { MONSTER_ARCHETYPES } from "@/components/game/monster-archetypes";
import { MonsterVisual } from "@/components/game/monster-model";
import { getCreatureLifespanHours } from "@monsters/game-core";
import { useI18n, type TranslationKey } from "@/components/i18n";

type MonsterCreatorProps = {
  dna: MonsterDna;
  name: string;
  onApply: (dna: MonsterDna, name: string) => void;
  onClose: () => void;
  /** Server-side validation or save failure, shown next to the apply button. */
  error?: string | null;
  saving?: boolean;
};

function GeneChoices<T extends string | number>({
  label,
  value,
  options,
  onChange,
  featured = false,
  disabled = false,
  hint,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  featured?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const { option: optionLabel } = useI18n();
  const numeric = options.every((option) => typeof option === "number");
  return (
    <fieldset
      className={`gene-field${featured ? " silhouette-gene" : ""}${numeric ? " numeric-gene" : ""}`}
      disabled={disabled}
    >
      <legend>{label}</legend>
      <div className="gene-options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? "selected" : ""}
            data-gene-option={String(option)}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {featured && <i className="gene-silhouette" aria-hidden="true" />}
            <span>{optionLabel(option)}</span>
          </button>
        ))}
      </div>
      {hint && <small className="gene-hint">{hint}</small>}
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
  const { option: optionLabel } = useI18n();
  return (
    <fieldset className="gene-field color-gene-field">
      <legend>{label}</legend>
      <div className="color-options">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? "selected" : ""}
            aria-label={`${label}: ${optionLabel(option.id)}`}
            aria-pressed={value === option.id}
            title={optionLabel(option.id)}
            style={{ "--swatch": option.hex } as CSSProperties}
            onClick={() => onChange(option.id)}
          >
            <span />
          </button>
        ))}
      </div>
      <small className="selected-color-name">{optionLabel(value)}</small>
    </fieldset>
  );
}

function TraitSection({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="gene-section">
      <h3>
        <span>{index}</span>
        {title}
      </h3>
      <div className="gene-section-grid">{children}</div>
    </section>
  );
}

function randomOption<T>(options: readonly T[]) {
  return options[Math.floor(Math.random() * options.length)];
}

function ArchetypeGuide({
  activeId,
  onChoose,
}: {
  activeId?: string;
  onChoose: (dna: MonsterDna) => void;
}) {
  const { t, option } = useI18n();
  return (
    <section className="archetype-guide" aria-labelledby="archetype-title">
      <div className="archetype-guide-heading">
        <span id="archetype-title">{t("creator.guide")}</span>
        <small>{t("creator.guideHint")}</small>
      </div>
      <div className="archetype-cards">
        {MONSTER_ARCHETYPES.map((archetype) => (
          <button
            key={archetype.id}
            type="button"
            className={activeId === archetype.id ? "selected" : ""}
            aria-pressed={activeId === archetype.id}
            title={t(`archetype.${archetype.id}.summary` as TranslationKey)}
            onClick={() => onChoose(archetype.dna)}
          >
            <i>{archetype.mark}</i>
            <strong>
              {t(`archetype.${archetype.id}.label` as TranslationKey)}
            </strong>
            <small>
              {option(archetype.dna.size)} · {option(archetype.dna.diet)} ·{" "}
              {option(archetype.dna.social)}
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function MonsterCreator({
  dna,
  name,
  onApply,
  onClose,
  error = null,
  saving = false,
}: MonsterCreatorProps) {
  const { t, option } = useI18n();
  const initialDna = { ...dna, mesh: "smooth" } as const;
  const [draft, setDraft] = useState<MonsterDna>(initialDna);
  const [draftName, setDraftName] = useState(name);
  const [dnaText, setDnaText] = useState(() => encodeMonsterDna(initialDna));
  const [dnaError, setDnaError] = useState<string | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.code === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  const updateDraft = (next: MonsterDna) => {
    const smoothed = { ...next, mesh: "smooth" } as const;
    setDraft(smoothed);
    setDnaText(encodeMonsterDna(smoothed));
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
      setDnaText(encodeMonsterDna(parsed));
      setDnaError(null);
    } catch {
      setDnaError(t("creator.invalidDna"));
    }
  };

  const surpriseMe = () => {
    const body = randomOption(BODY_SHAPES);
    const legs =
      body === "biped" || body === "avian"
        ? 2
        : body === "pig" || body === "rhino"
          ? 4
          : body === "slug" || body === "aquatic"
            ? randomOption([0, 2, 4] as const)
            : randomOption(LEG_COUNTS);
    const breathing =
      body === "aquatic"
        ? randomOption(["gills", "both"] as const)
        : randomOption(RESPIRATIONS);
    const adaptation =
      body === "avian"
        ? "wings"
        : body === "aquatic"
          ? "fins"
          : randomOption(ADAPTATIONS);
    updateDraft({
      body,
      legs,
      legShape: legs === 0 ? "stubby" : randomOption(LEG_SHAPES),
      eyes: randomOption(EYE_COUNTS),
      mouth: randomOption(MOUTH_SHAPES),
      size: randomOption(MONSTER_SIZES),
      build: randomOption(MONSTER_BUILDS),
      color: randomOption(MONSTER_COLORS).id,
      accent: randomOption(ACCENT_COLORS).id,
      pattern: randomOption(SMOOTH_PATTERNS),
      horns: randomOption(SMOOTH_HORN_SHAPES),
      ears: randomOption(EAR_SHAPES),
      tail: randomOption(TAIL_SHAPES),
      adaptation,
      diet: randomOption(DIETS),
      breathing,
      social: randomOption(SOCIAL_BEHAVIORS),
      mesh: "smooth",
    });
  };

  const activeArchetype = MONSTER_ARCHETYPES.find(
    (archetype) => encodeMonsterDna(archetype.dna) === encodeMonsterDna(draft),
  )?.id;
  const followerCount = getMonsterFollowerCount(draft);

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
              <Dna size={15} /> {t("creator.kicker")}
            </span>
            <h2 id="creator-title">{t("creator.title")}</h2>
          </div>
          <div className="creator-header-actions">
            <button
              type="button"
              className="creator-close"
              onClick={onClose}
              disabled={saving}
              aria-label={t("creator.close")}
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="creator-layout">
          <div className="creator-stage" data-live-label={t("creator.live")}>
            <div className="creator-canvas">
              <Canvas
                shadows="percentage"
                dpr={[1, 1.5]}
                camera={{ fov: 42, position: [4.2, 2.8, -5.2] }}
              >
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
                  shadow-bias={-0.00015}
                  shadow-normalBias={0.045}
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
              <Rotate3D size={16} /> {t("creator.rotate")}
            </div>
            <div className="specimen-stats">
              <span>
                {draft.eyes}{" "}
                {draft.eyes === 1 ? t("creator.eye") : t("creator.eyes")}
              </span>
              <span>
                {draft.legs} {t("creator.legs")}
              </span>
              <span>{option(draft.body)}</span>
              <span title={t("game.ageHelp")}>
                {t("game.lifespan")}{" "}
                {getCreatureLifespanHours(draft).toFixed(2)} h
              </span>
              <span>
                {followerCount
                  ? `${followerCount} ${t("creator.followers")}`
                  : t("creator.solo")}
              </span>
            </div>
          </div>

          <div className="creator-controls">
            <div className="builder-heading">
              <div>
                <span>{t("creator.builder")}</span>
                <strong>{t("creator.builderHint")}</strong>
              </div>
              <button
                type="button"
                className="surprise-button"
                onClick={surpriseMe}
              >
                <Shuffle size={14} /> {t("creator.surprise")}
              </button>
            </div>

            <ArchetypeGuide activeId={activeArchetype} onChoose={updateDraft} />

            <label className="monster-name-field">
              <span>{t("creator.name")}</span>
              <input
                value={draftName}
                maxLength={24}
                placeholder={t("creator.namePlaceholder")}
                onChange={(event) => setDraftName(event.target.value)}
              />
            </label>

            <div className="gene-sections">
              <TraitSection index="01" title={t("creator.sectionForm")}>
                <GeneChoices
                  label={t("creator.body")}
                  value={draft.body}
                  options={BODY_SHAPES}
                  onChange={(value) => changeGene("body", value)}
                  featured
                />
                <GeneChoices
                  label={t("creator.size")}
                  value={draft.size}
                  options={MONSTER_SIZES}
                  onChange={(value) => changeGene("size", value)}
                />
                <GeneChoices
                  label={t("creator.build")}
                  value={draft.build}
                  options={MONSTER_BUILDS}
                  onChange={(value) => changeGene("build", value)}
                />
                <GeneChoices
                  label={t("creator.legCount")}
                  value={draft.legs}
                  options={LEG_COUNTS}
                  onChange={(value) =>
                    updateDraft({
                      ...draft,
                      legs: value,
                      legShape: value === 0 ? "stubby" : draft.legShape,
                    })
                  }
                />
                <GeneChoices
                  label={t("creator.legShape")}
                  value={draft.legShape}
                  options={LEG_SHAPES}
                  disabled={draft.legs === 0}
                  hint={draft.legs === 0 ? t("creator.noLegShape") : undefined}
                  onChange={(value) => changeGene("legShape", value)}
                />
                <GeneChoices
                  label={t("creator.tail")}
                  value={draft.tail}
                  options={TAIL_SHAPES}
                  onChange={(value) => changeGene("tail", value)}
                />
              </TraitSection>

              <TraitSection index="02" title={t("creator.sectionFace")}>
                <GeneChoices
                  label={t("creator.eyeCount")}
                  value={draft.eyes}
                  options={EYE_COUNTS}
                  onChange={(value) => changeGene("eyes", value)}
                />
                <GeneChoices
                  label={t("creator.mouth")}
                  value={draft.mouth}
                  options={MOUTH_SHAPES}
                  onChange={(value) => changeGene("mouth", value)}
                />
                <GeneChoices
                  label={t("creator.horns")}
                  value={draft.horns}
                  options={SMOOTH_HORN_SHAPES}
                  onChange={(value) => changeGene("horns", value)}
                />
                <GeneChoices
                  label={t("creator.ears")}
                  value={draft.ears}
                  options={EAR_SHAPES}
                  onChange={(value) => changeGene("ears", value)}
                />
              </TraitSection>

              <TraitSection index="03" title={t("creator.sectionSurface")}>
                <GeneChoices
                  label={t("creator.pattern")}
                  value={draft.pattern}
                  options={SMOOTH_PATTERNS}
                  onChange={(value) => changeGene("pattern", value)}
                />
                <ColorChoices
                  label={t("creator.bodyColor")}
                  value={draft.color}
                  options={MONSTER_COLORS}
                  onChange={(value) =>
                    changeGene("color", value as MonsterDna["color"])
                  }
                />
                <ColorChoices
                  label={t("creator.accentColor")}
                  value={draft.accent}
                  options={ACCENT_COLORS}
                  onChange={(value) =>
                    changeGene("accent", value as MonsterDna["accent"])
                  }
                />
              </TraitSection>

              <TraitSection index="04" title={t("creator.sectionAbilities")}>
                <GeneChoices
                  label={t("creator.adaptation")}
                  value={draft.adaptation}
                  options={ADAPTATIONS}
                  onChange={(value) => changeGene("adaptation", value)}
                />
                <GeneChoices
                  label={t("creator.breathing")}
                  value={draft.breathing}
                  options={RESPIRATIONS}
                  onChange={(value) => changeGene("breathing", value)}
                />
              </TraitSection>

              <TraitSection index="05" title={t("creator.sectionInstincts")}>
                <GeneChoices
                  label={t("creator.diet")}
                  value={draft.diet}
                  options={DIETS}
                  onChange={(value) => changeGene("diet", value)}
                />
                <GeneChoices
                  label={t("creator.social")}
                  value={draft.social}
                  options={SOCIAL_BEHAVIORS}
                  hint={t("creator.behaviorGene")}
                  onChange={(value) => changeGene("social", value)}
                />
              </TraitSection>
            </div>

            <details className="dna-drawer">
              <summary>
                <Dna size={15} />
                <span>
                  {t("creator.advanced")}
                  <small>{t("creator.advancedHint")}</small>
                </span>
              </summary>
              <label className={`dna-tape${dnaError ? " invalid" : ""}`}>
                <span>{t("creator.directDna")}</span>
                <textarea
                  value={dnaText}
                  rows={4}
                  spellCheck={false}
                  aria-invalid={Boolean(dnaError)}
                  onChange={(event) => editDna(event.target.value)}
                />
                <small>{dnaError ?? t("creator.dnaHelp")}</small>
              </label>
            </details>
          </div>
        </div>

        <footer className="creator-footer">
          <span
            className={error ? "creator-save-error" : undefined}
            role={error ? "alert" : undefined}
            aria-live="polite"
          >
            {error ?? t("creator.footer")}
          </span>
          <div>
            <button
              type="button"
              className="creator-cancel"
              onClick={onClose}
              disabled={saving}
            >
              {t("creator.keep")}
            </button>
            <button
              type="button"
              className="creator-apply"
              disabled={saving || Boolean(dnaError) || !draftName.trim()}
              aria-busy={saving}
              onClick={() => onApply(draft, draftName.trim())}
            >
              <Check size={17} /> {t("creator.apply")}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
