import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n";
import { BreathControl } from "@/components/game/breath-control";
import type { WorldConnection } from "@/lib/net/world-connection";
import type { SimEvent } from "@monsters/game-core";

beforeEach(() => {
  window.localStorage.setItem("monsters-language", "en");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("selects an element, fires, and keeps the shared cooldown until it expires", () => {
  vi.useFakeTimers();
  let listener: (events: SimEvent[]) => void = () => {};
  const off = vi.fn();
  const connection = {
    on: (_event: string, callback: typeof listener) => {
      listener = callback;
      return off;
    },
  } as unknown as WorldConnection;
  const onCast = vi.fn();
  const onElement = vi.fn();
  const { unmount } = render(
    <LanguageProvider>
      <BreathControl
        connection={connection}
        entityId="me"
        element="radioactive"
        onElement={onElement}
        onCast={onCast}
        disabled={false}
      />
    </LanguageProvider>,
  );
  const select = screen.getByRole("combobox", { name: "Breath element" });
  expect(select).toHaveValue("radioactive");
  fireEvent.change(select, { target: { value: "poison" } });
  expect(onElement).toHaveBeenCalledWith("poison");
  fireEvent.click(
    screen.getByRole("button", { name: "Breath: Blue radiation" }),
  );
  expect(onCast).toHaveBeenCalledTimes(1);
  act(() =>
    listener([
      {
        type: "breath",
        tick: 1,
        entityId: "other",
        element: "fire",
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        range: 14,
      },
    ]),
  );
  expect(screen.getByRole("button")).toBeEnabled();
  act(() =>
    listener([
      {
        type: "breath",
        tick: 2,
        entityId: "me",
        element: "radioactive",
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        range: 14,
      },
    ]),
  );
  expect(screen.getByRole("button")).toBeDisabled();
  fireEvent.click(screen.getByRole("button"));
  expect(onCast).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(4200));
  expect(screen.getByRole("button")).toBeEnabled();
  unmount();
  expect(off).toHaveBeenCalledOnce();
});

describe("breath feedback", () => {
  it("respects a server cooldown after reconnect and disables both controls while paused", () => {
    vi.useFakeTimers();
    let listener: (events: SimEvent[]) => void = () => {};
    const connection = {
      on: (_event: string, callback: typeof listener) => {
        listener = callback;
        return () => {};
      },
    } as unknown as WorldConnection;
    const renderControl = (disabled: boolean) => (
      <LanguageProvider>
        <BreathControl
          connection={connection}
          entityId="me"
          element="water"
          onElement={() => {}}
          onCast={() => {}}
          disabled={disabled}
        />
      </LanguageProvider>
    );
    const { rerender } = render(renderControl(false));
    act(() =>
      listener([
        {
          type: "breathFailed",
          tick: 1,
          entityId: "me",
          reason: "cooldown",
          seconds: 2,
        },
      ]),
    );
    expect(screen.getByRole("button")).toBeDisabled();
    act(() => vi.advanceTimersByTime(2200));
    expect(screen.getByRole("button")).toBeEnabled();
    rerender(renderControl(true));
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
