"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { stripLeakedToolMarkup } from "@/lib/ai/groq-tools";

type Props = {
  content: string;
  className?: string;
  /** Bolha do usuário (contraste no fundo main). */
  variant?: "assistant" | "user";
};

export function ChatMarkdown({
  content,
  className,
  variant = "assistant",
}: Props) {
  const text = stripLeakedToolMarkup(content);
  if (!text.trim()) return null;

  return (
    <div
      className={cn(
        "chat-md font-base text-sm leading-relaxed",
        variant === "user" && "chat-md--user",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
