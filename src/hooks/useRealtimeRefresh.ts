"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type TableName =
  | "schedule_items"
  | "forms"
  | "form_questions"
  | "documents"
  | "folders";

type Options = {
  tables: TableName[];
  onChange: () => void;
  enabled?: boolean;
};

/** Inscreve no Realtime do Supabase e dispara onChange em INSERT/UPDATE/DELETE. */
export function useRealtimeRefresh({
  tables,
  onChange,
  enabled = true,
}: Options) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const key = [...tables].sort().join(",");

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channel = supabase.channel(`ia-estudar:${key}`);
    const list = key.split(",") as TableName[];

    for (const table of list) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          onChangeRef.current();
        },
      );
    }

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [key, enabled]);
}
