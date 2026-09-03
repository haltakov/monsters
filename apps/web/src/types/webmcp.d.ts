type WebMcpToolResult = {
  content?: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    context: { signal: AbortSignal },
  ) => Promise<WebMcpToolResult | unknown>;
};

type WebMcpContext = {
  registerTool: (
    tool: WebMcpRegisteredTool,
    options?: { signal?: AbortSignal },
  ) => Promise<void> | void;
};

/** Browser versions/bridges may omit execution options or their signal. */
type WebMcpRegisteredTool = Omit<WebMcpTool, "execute"> & {
  execute: (
    input?: unknown,
    context?: { signal?: AbortSignal } | AbortSignal | null,
  ) => Promise<unknown>;
};

interface Document {
  modelContext?: WebMcpContext;
}

interface Navigator {
  /** Deprecated WebMCP preview surface retained as a compatibility fallback. */
  modelContext?: WebMcpContext;
}
