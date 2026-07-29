"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AgentChat } from "@/components/AgentChat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AgentePage() {
  const [lastPreview, setLastPreview] = useState<{
    tool: string;
    input: unknown;
  } | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <AgentChat
        onToolCallPreview={(tool, input) => {
          setLastPreview({ tool, input });
        }}
        onToolExecuted={(tool) => {
          if (tool === "create_document") toast.success("Documento criado");
          if (tool === "update_document") toast.success("Documento atualizado");
          if (tool === "generate_schedule") toast.success("Cronograma gerado");
          if (tool === "generate_form") toast.success("Formulário pronto");
          if (tool === "create_folder") toast.success("Pasta criada");
        }}
      />
      <Card className="h-fit bg-mint">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <p className="text-sm opacity-80">
            Use o botão Confirmar no chat para persistir schedule/form/update.
          </p>
        </CardHeader>
        <CardContent>
          {lastPreview ? (
            <Alert variant="lavender">
              <AlertTitle>{lastPreview.tool}</AlertTitle>
              <AlertDescription>
                <pre className="mt-2 overflow-x-auto text-xs">
                  {JSON.stringify(lastPreview.input, null, 2)}
                </pre>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm">Nenhuma ferramenta pendente.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
