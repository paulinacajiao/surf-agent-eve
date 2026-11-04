import { AgentChat } from "@/app/_components/agent-chat";

export default async function NewSessionPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const prompt = typeof q === "string" ? q.trim().slice(0, 300) : undefined;
  return <AgentChat initialPrompt={prompt || undefined} sessionless={Boolean(prompt)} />;
}
