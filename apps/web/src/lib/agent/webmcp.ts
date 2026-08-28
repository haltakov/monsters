export async function registerWebMcpTools(
  tools: WebMcpTool[],
  signal: AbortSignal,
) {
  const context = document.modelContext ?? navigator.modelContext;
  if (!context) return false;
  await Promise.all(
    tools.map((tool) => context.registerTool(tool, { signal })),
  );
  return true;
}
