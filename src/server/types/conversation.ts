export type ConversationListItem = {
  id: string;
  title: string | null;
  scheduleId: string | null;
  scheduleTitle: string | null;
  updatedAt: string;
  createdAt: string;
};

export type ConversationMessageRow = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
};
