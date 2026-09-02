import type { ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "@/components/analytics";

const state = vi.hoisted(() => ({
  pathname: "/game/",
  track: vi.fn(),
  provider: vi.fn(),
  onLoad: undefined as (() => void) | undefined,
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next-plausible", () => ({
  usePlausible: () => state.track,
  default: (props: {
    children: ReactNode;
    scriptProps: { onLoad: () => void };
  }) => {
    state.provider(props);
    state.onLoad = props.scriptProps.onLoad;
    return props.children;
  },
}));

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID", "pa-test-site");
  state.pathname = "/game/";
  state.track.mockClear();
  state.provider.mockClear();
  state.onLoad = undefined;
});
afterEach(() => vi.unstubAllEnvs());

describe("first-party analytics", () => {
  it.each([
    "",
    "not-an-id",
    "pa-test.js",
    "https://plausible.io/js/pa-test.js",
  ])("does not load an unconfigured or invalid script (%s)", (id) => {
    vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_SCRIPT_ID", id);
    render(<Analytics />);
    expect(state.provider).not.toHaveBeenCalled();
  });

  it("does not load analytics during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<Analytics />);
    expect(state.provider).not.toHaveBeenCalled();
  });

  it("proxies script and events and disables automatic URL capture", () => {
    render(<Analytics />);
    expect(state.provider).toHaveBeenCalledWith(
      expect.objectContaining({
        src: "/js/script.js",
        init: {
          endpoint: "/api/event",
          autoCapturePageviews: false,
        },
      }),
    );
    expect(state.track).not.toHaveBeenCalled();
  });

  it("waits for the script and tracks navigation without query parameters or duplicates", () => {
    window.history.replaceState(
      {},
      "",
      "/game/?token=private&email=private#dna",
    );
    const { rerender } = render(<Analytics />);
    act(() => state.onLoad?.());
    expect(state.track).toHaveBeenCalledExactlyOnceWith("pageview", {
      u: "https://monstersdna.com/game/",
    });
    rerender(<Analytics />);
    expect(state.track).toHaveBeenCalledTimes(1);
    state.pathname = "/privacy/";
    rerender(<Analytics />);
    expect(state.track).toHaveBeenLastCalledWith("pageview", {
      u: "https://monstersdna.com/privacy/",
    });
    state.pathname = "/game/";
    rerender(<Analytics />);
    expect(state.track).toHaveBeenCalledTimes(3);
  });
});
