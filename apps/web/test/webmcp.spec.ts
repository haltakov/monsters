import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWebMcpTools, WEBMCP_TIMEOUT_MS } from "@/lib/agent/webmcp";
import { AgentActionError, waitForAgentAction } from "@/lib/agent/execution";

describe("WebMCP registration", () => {
  afterEach(() => {
    vi.useRealTimers();
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
    expect(registerTool).toHaveBeenCalledWith(
      expect.objectContaining({
        name: tool.name,
        execute: expect.any(Function),
      }),
      { signal: expect.any(AbortSignal) },
    );
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

  async function register(
    tools: WebMcpTool[],
    controller = new AbortController(),
  ) {
    const registered = new Map<string, WebMcpRegisteredTool>();
    const registerTool = vi.fn((tool: WebMcpRegisteredTool) => {
      registered.set(tool.name, tool);
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });
    await registerWebMcpTools(tools, controller.signal);
    return { registered, controller };
  }

  const action = (name = "monsters.move"): WebMcpTool => ({
    name,
    description: "Timed action",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: { duration: { type: "number", minimum: 0.25, maximum: 8 } },
    },
    execute: async (_, { signal }) => {
      await waitForAgentAction(0.25, signal);
      return { ok: true };
    },
  });

  it.each([
    "monsters.move",
    "monsters.explore",
    "monsters.eat",
    "monsters.attack",
    "monsters.flee",
    "monsters.rest",
    "monsters.breed",
  ])("executes %s without browser cancellation options", async (name) => {
    vi.useFakeTimers();
    const { registered } = await register([action(name)]);
    for (const context of [undefined, {}, null, { signal: undefined }]) {
      const result = registered.get(name)!.execute({}, context);
      await vi.advanceTimersByTimeAsync(250);
      await expect(result).resolves.toEqual({ ok: true });
      expect(vi.getTimerCount()).toBe(0);
    }
  });

  it("supports direct and options-wrapped abort signals, including pre-cancelled calls", async () => {
    vi.useFakeTimers();
    const execute = vi.fn(action().execute);
    const { registered } = await register([{ ...action(), execute }]);
    for (const direct of [false, true]) {
      const cancel = new AbortController();
      const result = registered
        .get("monsters.move")!
        .execute({}, direct ? cancel.signal : { signal: cancel.signal });
      await vi.advanceTimersByTimeAsync(100);
      cancel.abort();
      await expect(result).resolves.toMatchObject({
        isError: true,
        structuredContent: { error: { code: "cancelled" } },
      });
      expect(vi.getTimerCount()).toBe(0);
    }
    const cancel = new AbortController();
    cancel.abort();
    await registered
      .get("monsters.move")!
      .execute({}, { signal: cancel.signal });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("cancels in-flight work and rejects stale handles after unregister", async () => {
    vi.useFakeTimers();
    const { registered, controller } = await register([action()]);
    const result = registered.get("monsters.move")!.execute({});
    await vi.advanceTimersByTimeAsync(50);
    controller.abort();
    await expect(result).resolves.toMatchObject({ isError: true });
    await expect(
      registered.get("monsters.move")!.execute({}),
    ).resolves.toMatchObject({ isError: true });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects overlapping mutations but permits observing, then releases the action lock", async () => {
    vi.useFakeTimers();
    const { registered } = await register([
      action(),
      {
        name: "observe",
        description: "Observe",
        annotations: { readOnlyHint: true },
        execute: async () => ({ ok: true }),
      },
    ]);
    const result = registered.get("monsters.move")!.execute({});
    await expect(
      registered.get("monsters.move")!.execute({}),
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "busy" } },
    });
    await expect(registered.get("observe")!.execute()).resolves.toEqual({
      ok: true,
    });
    await vi.advanceTimersByTimeAsync(250);
    await result;
    const next = registered.get("monsters.move")!.execute({});
    await vi.advanceTimersByTimeAsync(250);
    await expect(next).resolves.toEqual({ ok: true });
  });

  it("returns a bounded timeout without unlocking a callback that ignores cancellation", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const { registered } = await register([
      {
        ...action(),
        execute: () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      },
    ]);
    const result = registered.get("monsters.move")!.execute({});
    await vi.advanceTimersByTimeAsync(WEBMCP_TIMEOUT_MS);
    await expect(result).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "timeout" } },
    });
    await expect(
      registered.get("monsters.move")!.execute({}),
    ).resolves.toMatchObject({
      structuredContent: { error: { code: "busy" } },
    });
    finish();
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    null,
    [],
    "bad",
    { duration: NaN },
    { duration: Infinity },
    { duration: 9 },
    { duration: -1 },
    { unexpected: true },
  ])("rejects invalid input before side effects: %j", async (input) => {
    const execute = vi.fn();
    const { registered } = await register([{ ...action(), execute }]);
    await expect(
      registered.get("monsters.move")!.execute(input),
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { code: "invalidInput" } },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("turns callback failures into readable tool errors and releases the lock", async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error("Target disappeared"))
      .mockResolvedValue({ ok: true });
    const { registered } = await register([{ ...action(), execute }]);
    await expect(
      registered.get("monsters.move")!.execute({}),
    ).resolves.toMatchObject({
      isError: true,
      structuredContent: { error: { message: "Target disappeared" } },
    });
    await expect(registered.get("monsters.move")!.execute({})).resolves.toEqual(
      { ok: true },
    );
  });

  it("aborts partial registration if a browser rejects one of the tools", async () => {
    const signals: AbortSignal[] = [];
    const registerTool = vi.fn(
      (_: WebMcpRegisteredTool, options: { signal: AbortSignal }) => {
        signals.push(options.signal);
        if (signals.length === 2)
          return Promise.reject(new Error("Registration failed"));
      },
    );
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: { registerTool },
    });
    await expect(
      registerWebMcpTools(
        [action("one"), action("two")],
        new AbortController().signal,
      ),
    ).rejects.toThrow("Registration failed");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});

describe("agent animation waits", () => {
  afterEach(() => vi.useRealTimers());
  it("works without a signal and cleans up listeners on success", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = waitForAgentAction(1, controller.signal);
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    const fallback = waitForAgentAction(0.25);
    await vi.advanceTimersByTimeAsync(250);
    await fallback;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["human control", "death", "world reset", "disconnect"])(
    "stops promptly on %s and never executes the next attack",
    async () => {
      vi.useFakeTimers();
      let interrupted = false;
      const attack = vi.fn();
      const result = waitForAgentAction(8, undefined, () => {
        if (interrupted)
          throw new AgentActionError("interrupted", "Action stopped");
      })
        .then(attack)
        .catch((error) => error);
      await vi.advanceTimersByTimeAsync(100);
      interrupted = true;
      await vi.advanceTimersByTimeAsync(50);
      expect(await result).toMatchObject({ code: "interrupted" });
      expect(attack).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
