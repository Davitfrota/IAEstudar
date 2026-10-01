/** Tools that mutate the pasta/documento tree and require a UI refresh. */
export const TREE_MUTATING_TOOLS = new Set([
  "create_folder",
  "create_document",
]);

export function shouldRefreshFolderTree(
  toolName: string,
  status: "pending_confirmation" | "executed" | "error",
): boolean {
  return status === "executed" && TREE_MUTATING_TOOLS.has(toolName);
}
