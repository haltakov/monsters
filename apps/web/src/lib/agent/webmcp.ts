import {
  AgentActionError,
  throwIfAborted,
  validateToolInput,
} from "./execution";

export const WEBMCP_TIMEOUT_MS = 20_000;

function isSignal(value: unknown): value is AbortSignal {
  if (!value || typeof value !== "object") return false;
  const signal = value as AbortSignal;
  return (
    typeof signal.aborted === "boolean" &&
    typeof signal.addEventListener === "function" &&
    typeof signal.removeEventListener === "function"
  );
}

function errorResult(error: unknown, signal?: AbortSignal): WebMcpToolResult {
  const reason = signal?.aborted ? signal.reason : error;
  const code =
    reason instanceof AgentActionError
      ? reason.code
      : signal?.aborted
        ? "cancelled"
        : "actionFailed";
  const message =
    reason instanceof Error
      ? reason.message
      : "Action cancelled or failed. Observe the world before retrying.";
  const result = {
    error: { code, message },
    next: "Observe the world before retrying; an interrupted action may have partially completed. Do not automatically repeat monster creation.",
  };
  return {
    isError: true,
    structuredContent: result,
    content: [{ type: "text", text: JSON.stringify(result) }],
  };
}

export async function registerWebMcpTools(
  tools: WebMcpTool[],
  signal: AbortSignal,
) {
  const context = document.modelContext ?? navigator.modelContext;
  if (!context || typeof context.registerTool !== "function" || signal.aborted)
    return false;
  // Only one mutating call may own the creature. Observations remain available.
  let busy = false;
  const lifetime = new AbortController();
  const unregister = () => lifetime.abort(signal.reason);
  signal.addEventListener("abort", unregister, { once: true });
  const guarded = tools.map((tool): WebMcpRegisteredTool => ({
    ...tool,
    execute: async (rawInput, options) => {
      const invocation = new AbortController();
      const removers: Array<() => void> = [];
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const mutating = !tool.annotations?.readOnlyHint;
      let ownsSlot = false;
      try {
        const supplied = isSignal(options) ? options : options?.signal;
        if (
          supplied !== undefined &&
          supplied !== null &&
          !isSignal(supplied)
        ) {
          throw new AgentActionError(
            "invalidContext",
            "Invalid cancellation signal supplied by the browser.",
          );
        }
        for (const source of [lifetime.signal, supplied]) {
          if (!source) continue;
          if (source.aborted) invocation.abort(source.reason);
          else {
            const abort = () => invocation.abort(source.reason);
            source.addEventListener("abort", abort, { once: true });
            removers.push(() => source.removeEventListener("abort", abort));
          }
        }
        throwIfAborted(invocation.signal);
        const input = rawInput === undefined ? {} : rawInput;
        validateToolInput(input, tool.inputSchema ?? { type: "object" });
        if (mutating && busy)
          throw new AgentActionError(
            "busy",
            "Another action is running. Wait for it to finish; observations are still available.",
          );
        if (mutating) {
          busy = true;
          ownsSlot = true;
        }
        timeout = setTimeout(
          () =>
            invocation.abort(
              new AgentActionError(
                "timeout",
                "Action timed out and was stopped.",
              ),
            ),
          WEBMCP_TIMEOUT_MS,
        );
        const aborted = new Promise<never>((_, reject) => {
          const abort = () => reject(invocation.signal.reason);
          invocation.signal.addEventListener("abort", abort, { once: true });
          removers.push(() =>
            invocation.signal.removeEventListener("abort", abort),
          );
        });
        const execution = Promise.resolve().then(() => {
          throwIfAborted(invocation.signal);
          return tool.execute(input as Record<string, unknown>, {
            signal: invocation.signal,
          });
        });
        // Never allow a second writer while an uncooperative callback still runs.
        const release = () => {
          if (ownsSlot) {
            busy = false;
            ownsSlot = false;
          }
        };
        execution.then(release, release);
        return await Promise.race([execution, aborted]);
      } catch (error) {
        return errorResult(error, invocation.signal);
      } finally {
        clearTimeout(timeout);
        removers.forEach((remove) => remove());
      }
    },
  }));
  try {
    await Promise.all(
      guarded.map((tool) =>
        context.registerTool(tool, { signal: lifetime.signal }),
      ),
    );
  } catch (error) {
    lifetime.abort();
    signal.removeEventListener("abort", unregister);
    if (signal.aborted) return false;
    throw error;
  }
  return true;
}
