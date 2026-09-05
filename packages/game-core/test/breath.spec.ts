import { describe, expect, it } from "vitest";
import {
  BREATH_COOLDOWN_SECONDS,
  BREATH_ENERGY_COST,
} from "../src/sim/constants";
import { stepWorld } from "../src/sim/engine";
import {
  BREATH_ELEMENTS,
  type BreathElement,
  type SimCommand,
} from "../src/sim/types";
import {
  deserializeWorldState,
  serializeWorldState,
} from "../src/sim/snapshot";
import { emptyWorld, makeEntity, makePlayer, withDna } from "./helpers";

function setup(y = 30) {
  const caster = makePlayer("caster", {
    y,
    locomotion: "fly",
    dna: withDna({ adaptation: "wings" }),
  });
  const target = makeEntity("target", {
    z: -9,
    y,
    locomotion: "fly",
    dna: withDna({ adaptation: "wings" }),
    nextDecisionAt: 999,
    breathCooldownUntil: 999,
  });
  const state = emptyWorld({ entities: [caster, target] });
  return { state, caster, target };
}
const cast = (element?: BreathElement): SimCommand => ({
  type: "action",
  entityId: "caster",
  action: "breath",
  element,
});

describe("elemental breath", () => {
  it.each(BREATH_ELEMENTS)(
    "casts %s with authoritative damage, direction and energy cost",
    (element) => {
      const { state, caster, target } = setup();
      const events = stepWorld(state, 0.1, [cast(element)]);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "breath",
          element,
          entityId: caster.id,
          yaw: 0,
          range: 14,
        }),
      );
      expect(target.health).toBeLessThan(100);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "attack",
          attackerId: caster.id,
          targetId: target.id,
        }),
      );
      expect(caster.energy).toBeCloseTo(100 - BREATH_ENERGY_COST - 0.075, 1);
    },
  );

  it("defaults to blue radiation and shares a cooldown across all elements", () => {
    const { state, caster } = setup();
    const events = stepWorld(state, 0.1, [
      cast(),
      cast("fire"),
      cast("poison"),
    ]);
    expect(events.filter((event) => event.type === "breath")).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "breath", element: "radioactive" });
    expect(
      events.filter((event) => event.type === "breathFailed"),
    ).toHaveLength(2);
    expect(caster.breathCooldownUntil! - state.time).toBeCloseTo(
      BREATH_COOLDOWN_SECONDS,
    );
    state.time = caster.breathCooldownUntil!;
    expect(
      stepWorld(state, 0.1, [cast("water")]).some(
        (event) => event.type === "breath",
      ),
    ).toBe(true);
  });

  it("does not hit behind, outside the cone, beyond range, or on a different altitude", () => {
    const { state, target } = setup();
    target.z = 8;
    const side = makeEntity("side", { x: 8, z: -8, y: 30 });
    const above = makeEntity("above", { z: -8, y: 42 });
    const far = makeEntity("far", { z: -25, y: 30 });
    state.entities.push(side, above, far);
    stepWorld(state, 0.1, [cast()]);
    for (const entity of [target, side, above, far])
      expect(entity.health).toBe(100);
  });

  it("uses facing direction and protects other controlled players", () => {
    const { state, caster, target } = setup();
    caster.yaw = Math.PI / 2;
    target.x = -9;
    target.z = 0;
    const protectedPlayer = makePlayer("friend", { x: -5, y: 30 });
    state.entities.push(protectedPlayer);
    stepWorld(state, 0.1, [cast()]);
    expect(target.health).toBeLessThan(100);
    expect(protectedPlayer.health).toBe(100);
  });

  it.each(["land", "dive"] as const)("can breathe while on %s", (mode) => {
    const { state, caster, target } = setup();
    for (const entity of [caster, target]) {
      entity.x = mode === "dive" ? 175 : 0;
      entity.y = mode === "dive" ? -7 : 3;
      entity.locomotion = mode;
      entity.dna = withDna({ adaptation: "fins", breathing: "gills" });
    }
    const events = stepWorld(state, 0.1, [cast("water")]);
    expect(events.some((event) => event.type === "attack")).toBe(true);
  });

  it("lets wild defenders breathe toward their attacker at a slower rate", () => {
    const { state, caster, target } = setup(3);
    caster.controllerId = null;
    caster.ownerGuestId = null;
    caster.locomotion = "land";
    caster.lastAttackerId = target.id;
    caster.lastAttackedAt = 0;
    const events = stepWorld(state, 0.1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "breath", entityId: caster.id }),
    );
    expect(caster.breathCooldownUntil! - state.time).toBeCloseTo(12);
  });

  it("stops the stream at terrain", () => {
    const { state, caster, target } = setup();
    caster.y = -100;
    target.y = -100;
    const events = stepWorld(state, 0.1, [cast()]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "breath", range: 0 }),
    );
    expect(target.health).toBe(100);
  });

  it("rejects dead, exhausted and invalid casts without spending energy", () => {
    const { state, caster } = setup();
    caster.energy = 12;
    expect(stepWorld(state, 0.1, [cast()])).toContainEqual(
      expect.objectContaining({ type: "breathFailed", reason: "energy" }),
    );
    expect(caster.breathCooldownUntil).toBeUndefined();
    caster.alive = false;
    expect(stepWorld(state, 0.1, [cast()])).toContainEqual(
      expect.objectContaining({ type: "breathFailed", reason: "dead" }),
    );
    caster.alive = true;
    caster.energy = 100;
    expect(
      stepWorld(state, 0.1, [cast("bogus" as BreathElement)]).some(
        (event) => event.type === "breath",
      ),
    ).toBe(false);
    expect(caster.energy).toBeGreaterThan(99);
  });

  it("preserves cooldown through a checkpoint and accepts older checkpoints", () => {
    const { state } = setup();
    stepWorld(state, 0.1, [cast()]);
    const restored = deserializeWorldState(serializeWorldState(state));
    expect(stepWorld(restored, 0.1, [cast()])).toContainEqual(
      expect.objectContaining({ type: "breathFailed", reason: "cooldown" }),
    );
    delete restored.entities[0].breathCooldownUntil;
    expect(
      stepWorld(restored, 0.1, [cast()]).some(
        (event) => event.type === "breath",
      ),
    ).toBe(true);
  });

  it("emits a death event for a defeated wild monster", () => {
    const { state, target } = setup();
    target.health = 1;
    const events = stepWorld(state, 0.1, [cast()]);
    expect(target.alive).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "death",
        killerId: "caster",
        entityId: "target",
      }),
    );
  });
});
