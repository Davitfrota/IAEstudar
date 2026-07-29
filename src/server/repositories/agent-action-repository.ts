import type { AdminClient } from "@/lib/supabase/admin";

export class AgentActionRepository {
  constructor(private db: AdminClient) {}

  async log(input: {
    userId: string;
    toolName: string;
    input: unknown;
    output?: unknown;
    status: "success" | "error" | "pending_confirmation";
  }) {
    const { data, error } = await this.db
      .from("agent_actions")
      .insert({
        user_id: input.userId,
        tool_name: input.toolName,
        input: input.input,
        output: input.output ?? null,
        status: input.status,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  }
}
