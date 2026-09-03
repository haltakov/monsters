import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Joystick, WorldInputSurface } from "@/components/game/touch-controls";
import { readInput, type ControlState } from "@/components/game/player-monster";
import { sampleJoystick, swipeCamera } from "@/lib/touch-input";
import { normalizeAngle } from "@monsters/game-core";

function controls(): ControlState {
  return {
    keys: new Set(),
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    cameraYaw: 0.4,
    cameraPitch: 0.3,
    action: null,
    actionStarted: 0,
    paused: false,
    energy: 100,
    health: 100,
    isDead: false,
    moving: false,
    sprinting: false,
    locomotionMode: "land",
    playerPosition: { x: 0, y: 0, z: 0 },
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
  };
}

describe("analog touch input", () => {
  it("uses a circular neutral zone and gradual throttle without changing bearing", () => {
    expect(sampleJoystick(3, -3, 40)).toMatchObject({ x: 0, y: 0 });
    const half = sampleJoystick(0, -20, 40);
    expect(half.y).toBeGreaterThan(0.2);
    expect(half.y).toBeLessThan(0.5);
    const diagonal = sampleJoystick(20, -20, 40);
    expect(diagonal.x).toBeCloseTo(diagonal.y);
    expect(sampleJoystick(0, -40, 40).y).toBe(1);
    const clamped = sampleJoystick(400, -300, 40);
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(1);
    expect(Math.hypot(clamped.knobX, clamped.knobY)).toBeCloseTo(40);
    expect(sampleJoystick(4, 4, 0)).toEqual({ x: 0, y: 0, knobX: 0, knobY: 0 });
  });

  it.each([
    0,
    0.08,
    Math.PI / 4,
    Math.PI / 2,
    Math.PI,
    -Math.PI / 4,
    -Math.PI / 2,
  ])(
    "preserves stick direction %s and strength independently of camera orientation",
    (angle) => {
      const state = controls();
      state.move = { x: Math.sin(angle) * 0.5, y: Math.cos(angle) * 0.5 };
      const input = readInput(state);
      expect(input.forward).toBeCloseTo(0.5);
      expect(input.strafe).toBe(0);
      expect(input.turn).toBe(0);
      expect(input.heading).toBeCloseTo(normalizeAngle(0.4 - angle));
      expect(state.cameraYaw).toBe(0.4);
    },
  );

  it("retains keyboard backpedalling and lets touch override agent intent", () => {
    const state = controls();
    state.keys.add("KeyS");
    expect(readInput(state)).toMatchObject({ forward: -1, heading: 0.4 });
    state.keys.clear();
    state.agent.enabled = true;
    state.agent.heading = 2;
    state.agent.forward = 1;
    state.move = { x: 0.5, y: 0.5 };
    expect(readInput(state).heading).toBeCloseTo(0.4 - Math.PI / 4);
    state.paused = true;
    expect(readInput(state)).toMatchObject({
      forward: 0,
      strafe: 0,
      turn: 0,
      sprint: false,
    });
    state.paused = false;
    state.isDead = true;
    expect(readInput(state).forward).toBe(0);
  });

  it("swipes only adjust camera angles, with bounded pitch", () => {
    const state = controls();
    const angle = swipeCamera(
      state.cameraYaw,
      state.cameraPitch,
      100,
      -50,
      false,
    );
    expect(angle.yaw).toBeCloseTo(0.1);
    expect(angle.pitch).toBeCloseTo(0.18);
    expect(state).toEqual(controls());
    state.cameraYaw = angle.yaw;
    state.cameraPitch = angle.pitch;
    expect(readInput(state)).toMatchObject({ forward: 0, strafe: 0, turn: 0 });
    expect(swipeCamera(0, 0.3, 0, -10000, false).pitch).toBe(0.12);
    expect(swipeCamera(0, 0.3, 0, -10000, true).pitch).toBe(-0.72);
    expect(swipeCamera(0, 0.3, 0, 10000, false).pitch).toBe(0.72);
  });
});

// jsdom lacks PointerEvent/capture. Model identity and capture independently
// so two-thumb gestures exercise the actual component handlers.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "touch";
  }
}

describe("touch gesture ownership", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    const captured = new Map<HTMLElement, Set<number>>();
    Object.defineProperties(HTMLElement.prototype, {
      setPointerCapture: {
        configurable: true,
        value: function (this: HTMLElement, id: number) {
          if (!captured.has(this)) captured.set(this, new Set());
          captured.get(this)!.add(id);
        },
      },
      hasPointerCapture: {
        configurable: true,
        value: function (this: HTMLElement, id: number) {
          return captured.get(this)?.has(id) ?? false;
        },
      },
      releasePointerCapture: {
        configurable: true,
        value: function (this: HTMLElement, id: number) {
          captured.get(this)?.delete(id);
        },
      },
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      toJSON: () => ({}),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ignores a second finger and resets only when its owner releases", () => {
    const onMove = vi.fn();
    render(<Joystick label="Move" onMove={onMove} />);
    const stick = screen.getByRole("application", { name: "Move" });
    fireEvent.pointerDown(stick, {
      pointerId: 1,
      clientX: 55,
      clientY: 14,
      button: 0,
    });
    const [x, y] = onMove.mock.lastCall!;
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(x * 6);
    fireEvent.pointerDown(stick, {
      pointerId: 2,
      clientX: 90,
      clientY: 50,
      button: 0,
    });
    fireEvent.pointerMove(stick, { pointerId: 2, clientX: 90, clientY: 50 });
    fireEvent.pointerUp(stick, { pointerId: 2 });
    expect(onMove).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(stick, { pointerId: 1 });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
  });

  it.each([
    "pointerCancel",
    "lostPointerCapture",
    "blur",
    "hidden",
    "disabled",
    "unmount",
  ])("clears held movement on %s", (ending) => {
    const onMove = vi.fn();
    const view = render(<Joystick label="Move" onMove={onMove} />);
    const stick = screen.getByRole("application", { name: "Move" });
    fireEvent.pointerDown(stick, {
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      button: 0,
    });
    expect(onMove).toHaveBeenLastCalledWith(0, 1);
    if (ending === "disabled")
      view.rerender(<Joystick label="Move" onMove={onMove} disabled />);
    else if (ending === "unmount") view.unmount();
    else if (ending === "blur") fireEvent.blur(window);
    else if (ending === "hidden") {
      vi.spyOn(document, "hidden", "get").mockReturnValue(true);
      fireEvent(document, new Event("visibilitychange"));
    } else
      fireEvent[ending as "pointerCancel" | "lostPointerCapture"](stick, {
        pointerId: 1,
      });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
  });

  it("keeps a held stick across parent renders and uses the latest callback", () => {
    const first = vi.fn();
    const next = vi.fn();
    const view = render(<Joystick label="Move" onMove={first} />);
    const stick = screen.getByRole("application", { name: "Move" });
    fireEvent.pointerDown(stick, {
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      button: 0,
    });
    view.rerender(<Joystick label="Move" onMove={next} />);
    expect(first).toHaveBeenCalledTimes(1);
    fireEvent.pointerMove(stick, { pointerId: 1, clientX: 88, clientY: 50 });
    expect(next).toHaveBeenLastCalledWith(1, -0);
  });

  it("supports camera swiping with a second thumb while the first keeps walking", () => {
    const onMove = vi.fn();
    const onSwipe = vi.fn();
    render(
      <>
        <WorldInputSurface
          disabled={false}
          onSwipe={onSwipe}
          onInteract={vi.fn()}
        >
          <canvas data-testid="world" />
        </WorldInputSurface>
        <Joystick label="Move" onMove={onMove} />
      </>,
    );
    const stick = screen.getByRole("application", { name: "Move" });
    const canvas = screen.getByTestId("world");
    fireEvent.pointerDown(stick, {
      pointerId: 1,
      clientX: 50,
      clientY: 0,
      button: 0,
    });
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 500, clientY: 500 });
    expect(onSwipe).not.toHaveBeenCalled();
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 230, clientY: 310 });
    expect(onSwipe).toHaveBeenLastCalledWith(30, 10);
    fireEvent.pointerUp(canvas, { pointerId: 2 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 400, clientY: 310 });
    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenLastCalledWith(0, 1);
    fireEvent.pointerUp(stick, { pointerId: 1 });
    expect(onMove).toHaveBeenLastCalledWith(0, 0);
  });

  it("does not start a camera drag on UI or keep one through a menu", () => {
    const onSwipe = vi.fn();
    const surface = (disabled: boolean) => (
      <WorldInputSurface
        disabled={disabled}
        onSwipe={onSwipe}
        onInteract={vi.fn()}
      >
        <canvas data-testid="world" />
        <button>Menu</button>
      </WorldInputSurface>
    );
    const view = render(surface(false));
    const canvas = screen.getByTestId("world");
    fireEvent.pointerDown(screen.getByRole("button"), {
      pointerId: 1,
      clientX: 0,
    });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 100 });
    expect(onSwipe).not.toHaveBeenCalled();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0 });
    view.rerender(surface(true));
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 100 });
    view.rerender(surface(false));
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 200 });
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
