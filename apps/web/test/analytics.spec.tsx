import type { ReactNode } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics, sanitizeAnalyticsEvent } from "@/components/analytics";

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
        init: expect.objectContaining({
          endpoint: "https://p.monstersdna.com/api/event",
          autoCapturePageviews: false,
          formSubmissions: false,
          outboundLinks: false,
          transformRequest: sanitizeAnalyticsEvent,
        }),
      }),
    );
    expect(state.track).not.toHaveBeenCalled();
  });

  it("redacts URL/referrer details and properties even for automatically captured events", () => {
    // Match next-plausible's serialization: this must work without closures.
    const transform = new Function(
      `return (${sanitizeAnalyticsEvent.toString()})`,
    )();
    expect(
      transform({
        n: "pageview",
        d: "wrong.example",
        v: 36,
        u: "https://monstersdna.com/game/?token=secret#dna",
        r: "https://example.com/private?email=secret#token",
        p: { nickname: "private" },
        $: { amount: 100 },
      }),
    ).toEqual({
      n: "pageview",
      d: "monstersdna.com",
      v: 36,
      u: "https://monstersdna.com/game/",
      r: "https://example.com",
    });
    expect(
      transform({ n: "File Download", u: "https://monstersdna.com/dna.json" }),
    ).toBe(false);
    expect(
      transform({ n: "Form: Submission", u: "https://monstersdna.com/" }),
    ).toBe(false);
    expect(transform({ n: "pageview", u: "invalid" })).toBe(false);
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
