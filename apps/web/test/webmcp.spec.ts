import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWebMcpTools } from "@/lib/agent/webmcp";

describe("WebMCP registration", () => {
  afterEach(() => {
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "modelContext", {
      configurable: true,
      value: undefined,
    });
  });

  it("uses the current document.modelContext surface", async () => {
    const registerTool = vi.fn();
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });
    const controller = new AbortController();
    const tool: WebMcpTool = {
      name: "monsters.observe_world",
      description: "Observe",
      execute: async () => ({}),
    };

    await expect(registerWebMcpTools([tool], controller.signal)).resolves.toBe(
      true,
    );
    expect(registerTool).toHaveBeenCalledWith(tool, {
      signal: controller.signal,
    });
  });

  it("falls back to the deprecated navigator preview surface", async () => {
    const registerTool = vi.fn();
    Object.defineProperty(navigator, "modelContext", {
      configurable: true,
      value: { registerTool },
    });

    await expect(
      registerWebMcpTools(
        [
          {
            name: "monsters.rest",
            description: "Rest",
            execute: async () => ({}),
          },
        ],
        new AbortController().signal,
      ),
    ).resolves.toBe(true);
    expect(registerTool).toHaveBeenCalledOnce();
  });
});
