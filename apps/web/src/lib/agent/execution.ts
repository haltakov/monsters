export class AgentActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentActionError";
  }
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Action cancelled", "AbortError");
  }
}

/** Bounded, cancellable animation wait. Always removes listeners and timers. */
export function waitForAgentAction(
  durationSeconds: number,
  signal?: AbortSignal,
  check?: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let monitor: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(monitor);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const abort = () =>
      fail(
        signal?.reason ?? new DOMException("Action cancelled", "AbortError"),
      );
    const validate = () => {
      throwIfAborted(signal);
      check?.();
    };
    try {
      if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds < 0 ||
        durationSeconds > 8
      ) {
        throw new AgentActionError(
          "invalidInput",
          "Action duration must be between 0 and 8 seconds.",
        );
      }
      validate();
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        try {
          validate();
          cleanup();
          resolve();
        } catch (error) {
          fail(error);
        }
      }, durationSeconds * 1000);
      if (check)
        monitor = setInterval(() => {
          try {
            validate();
          } catch (error) {
            fail(error);
          }
        }, 50);
    } catch (error) {
      fail(error);
    }
  });
}

/** Validate the JSON Schema subset used by our tool definitions, even on old bridges. */
export function validateToolInput(
  value: unknown,
  schema: Record<string, unknown>,
  path = "input",
) {
  const invalid = (detail: string): never => {
    throw new AgentActionError("invalidInput", `${path}: ${detail}`);
  };
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      invalid("expected an object");
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<
      string,
      Record<string, unknown>
    >;
    for (const key of (schema.required ?? []) as string[]) {
      if (!Object.hasOwn(object, key)) invalid(`missing ${key}`);
    }
    for (const [key, entry] of Object.entries(object)) {
      if (!Object.hasOwn(properties, key)) {
        if (schema.additionalProperties === false)
          invalid(`unknown property ${key}`);
      } else validateToolInput(entry, properties[key], `${path}.${key}`);
    }
  } else if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value))
      invalid("expected a finite number");
    const number = value as number;
    if (schema.type === "integer" && !Number.isInteger(number))
      invalid("expected an integer");
    if (typeof schema.minimum === "number" && number < schema.minimum)
      invalid(`minimum is ${schema.minimum}`);
    if (typeof schema.maximum === "number" && number > schema.maximum)
      invalid(`maximum is ${schema.maximum}`);
  } else if (schema.type === "string") {
    if (typeof value !== "string") invalid("expected a string");
    const length = (value as string).length;
    if (typeof schema.minLength === "number" && length < schema.minLength)
      invalid("value is too short");
    if (typeof schema.maxLength === "number" && length > schema.maxLength)
      invalid("value is too long");
  } else if (schema.type === "boolean" && typeof value !== "boolean")
    invalid("expected a boolean");
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    invalid("not an allowed value");
}
