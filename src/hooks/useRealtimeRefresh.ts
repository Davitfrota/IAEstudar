"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type TableName =
  | "schedule_items"
  | "forms"
  | "form_questions"
  | "documents"
  | "folders";

const TABLES_WITH_USER_ID: TableName[] = [
  "schedule_items",
  "forms",
  "documents",
  "folders",
];

type Options = {
  tables: TableName[];
  onChange: () => void;
  enabled?: boolean;
  userId?: string;
};

/** Inscreve no Realtime do Supabase e dispara onChange em INSERT/UPDATE/DELETE. */
export function useRealtimeRefresh({
  tables,
  onChange,
  enabled = true,
  userId,
}: Options) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const key = [...tables].sort().join(",");

  useEffect(() => {
    if (!enabled) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const debouncedOnChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChangeRef.current();
      }, 400);
    };

    const supabase = createClient();
    const channel = supabase.channel(`ia-estudar:${key}:${userId ?? "all"}`);
    const list = key.split(",") as TableName[];

    for (const table of list) {
      const config: {
        event: "*";
        schema: "public";
        table: TableName;
        filter?: string;
      } = {
        event: "*",
        schema: "public",
        table,
      };

      if (userId && TABLES_WITH_USER_ID.includes(table)) {
        config.filter = `user_id=eq.${userId}`;
      }

      channel.on("postgres_changes", config, debouncedOnChange);
    }

    void channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [key, enabled, userId]);
}
