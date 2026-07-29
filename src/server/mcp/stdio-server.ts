/**
 * Servidor MCP standalone (stdio) — útil para Cursor/Claude Desktop.
 * No app web, as mesmas ferramentas rodam in-process via executeMcpTool.
 *
 * Uso: pnpm mcp
 * Env: SUPABASE_* + o processo pai deve injetar IA_ESTUDAR_USER_ID
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { executeMcpTool, mcpToolDefinitions } from "./tools";

async function main() {
  const userId = process.env.IA_ESTUDAR_USER_ID;
  if (!userId) {
    console.error("IA_ESTUDAR_USER_ID é obrigatório para o servidor MCP stdio");
    process.exit(1);
  }

  const server = new Server(
    { name: "ia-estudar", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpToolDefinitions.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await executeMcpTool(
      { userId },
      request.params.name,
      request.params.arguments ?? {},
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result),
        },
      ],
      isError: result.status === "error",
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
