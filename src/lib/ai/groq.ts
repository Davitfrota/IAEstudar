import OpenAI from "openai";

export function createGroqClient() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY não configurada");
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
}

export function groqModel() {
  return process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
}
