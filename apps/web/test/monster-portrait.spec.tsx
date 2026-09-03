import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Box3, OrthographicCamera, Vector3 } from "three";
import {
  PortraitCache,
  PortraitQueue,
} from "@/components/account/portrait-queue";
import { framePortraitCamera } from "@/components/account/portrait-camera";
import {
  MonsterPortrait,
  MonsterPortraitProvider,
} from "@/components/account/monster-portrait";

vi.mock("@react-three/fiber", () => ({
  Canvas: () => null,
  useThree: vi.fn(),
}));
vi.mock("@/components/game/monster-model", () => ({
  MonsterVisual: () => null,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("archive portrait queue", () => {
  it("renders sequentially and shares one image for identical DNA", () => {
    const queue = new PortraitQueue(new PortraitCache());
    const a = vi.fn(),
      copy = vi.fn(),
      b = vi.fn();
    queue.request("dna-a", a);
    queue.request("dna-a", copy);
    queue.request("dna-b", b);
    expect(queue.getSnapshot()?.dna).toBe("dna-a");
    queue.complete(queue.getSnapshot()!, "image-a");
    expect(a).toHaveBeenCalledWith("image-a");
    expect(copy).toHaveBeenCalledWith("image-a");
    expect(b).not.toHaveBeenCalled();
    expect(queue.getSnapshot()?.dna).toBe("dna-b");
    const cached = vi.fn();
    queue.request("dna-a", cached);
    expect(cached).toHaveBeenCalledWith("image-a");
    queue.complete(queue.getSnapshot()!, "image-b");
    expect(queue.getSnapshot()).toBeNull();
  });

  it("cancels offscreen work and ignores stale results after a new request", () => {
    const queue = new PortraitQueue(new PortraitCache());
    const oldListener = vi.fn(),
      listener = vi.fn();
    const cancel = queue.request("same", oldListener);
    const stale = queue.getSnapshot()!;
    cancel();
    expect(queue.getSnapshot()).toBeNull();
    queue.request("same", listener);
    queue.complete(stale, "stale-image");
    expect(listener).not.toHaveBeenCalled();
    queue.complete(queue.getSnapshot()!, "new-image");
    expect(listener).toHaveBeenCalledWith("new-image");
    expect(oldListener).not.toHaveBeenCalled();
  });

  it("does not cancel a shared render until its last row leaves", () => {
    const queue = new PortraitQueue(new PortraitCache());
    const cancel = queue.request("shared", vi.fn());
    const second = vi.fn();
    queue.request("shared", second);
    cancel();
    expect(queue.getSnapshot()).not.toBeNull();
    queue.complete(queue.getSnapshot()!, "image");
    expect(second).toHaveBeenCalledWith("image");
  });

  it("keeps the cache bounded, preserves recent images and keys on full DNA", () => {
    const cache = new PortraitCache(2);
    cache.put("red", "red-image");
    cache.put("blue", "blue-image");
    expect(cache.get("red")).toBe("red-image");
    cache.put("green", "green-image");
    expect(cache.get("blue")).toBeUndefined();
    expect(cache.get("red")).toBe("red-image");
    expect(cache.get("green")).toBe("green-image");
  });

  it("continues after an individual failure and resolves all jobs on context loss", () => {
    const queue = new PortraitQueue(new PortraitCache());
    const failed = vi.fn(),
      pending = vi.fn(),
      later = vi.fn();
    queue.request("bad", failed);
    queue.request("good", pending);
    queue.complete(queue.getSnapshot()!, null);
    expect(failed).toHaveBeenCalledWith(null);
    expect(queue.getSnapshot()?.dna).toBe("good");
    queue.failAll();
    expect(pending).toHaveBeenCalledWith(null);
    queue.request("later", later);
    expect(later).toHaveBeenCalledWith(null);
    expect(queue.getSnapshot()).toBeNull();
  });
});

describe("portrait framing", () => {
  it.each([
    [-1, 0, -1, 1, 3, 1],
    [-8, 0, -1, 8, 2, 1], // wings
    [-1, 0, -2, 1, 3, 12], // tail
    [-0.2, 0, -0.2, 0.2, 9, 0.2], // horns / long legs
  ])("keeps all extremes visible: %s", (x1, y1, z1, x2, y2, z2) => {
    const camera = new OrthographicCamera();
    const bounds = new Box3(new Vector3(x1, y1, z1), new Vector3(x2, y2, z2));
    framePortraitCamera(camera, bounds);
    for (const x of [x1, x2])
      for (const y of [y1, y2])
        for (const z of [z1, z2]) {
          const projected = new Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThan(0.9);
          expect(Math.abs(projected.y)).toBeLessThan(0.9);
          expect(Math.abs(projected.z)).toBeLessThan(1);
        }
  });
});

it("loads only visible portraits, cancels on exit, and replaces an image when DNA changes", () => {
  const observers: ((entries: { isIntersecting: boolean }[]) => void)[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const cancel = vi.fn();
  const request = vi
    .spyOn(PortraitQueue.prototype, "request")
    .mockImplementation((dna, listener) => {
      listener(`data:image/png;base64,${dna}`);
      return cancel;
    });
  const view = (dna: string) => (
    <MonsterPortraitProvider>
      <MonsterPortrait dna={dna} name="Moss" generation={2} />
    </MonsterPortraitProvider>
  );
  const result = render(view("red"));
  expect(request).not.toHaveBeenCalled();
  act(() => observers[0]([{ isIntersecting: true }]));
  expect(screen.getByRole("img", { name: "Moss" })).toHaveAttribute(
    "src",
    "data:image/png;base64,red",
  );
  expect(screen.getByText("G2")).toBeVisible();
  act(() => observers[0]([{ isIntersecting: false }]));
  expect(cancel).toHaveBeenCalledTimes(1);
  result.rerender(view("blue"));
  expect(screen.queryByRole("img")).toBeNull();
  act(() => observers[1]([{ isIntersecting: true }]));
  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "data:image/png;base64,blue",
  );
  result.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
});
