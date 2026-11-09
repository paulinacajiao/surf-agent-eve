import { defineAgent } from "eve";
import { defineDynamic } from "eve/models";
import chatModels from "../data/chat-models.json" with { type: "json" };

/**
 * Model layer: every model call goes through Vercel AI Gateway (a plain
 * "creator/model" string is a Gateway model ID). Nothing here is
 * Bedrock-SDK-specific, so switching models is a config change, not a code change.
 *
 * DECISION: the model is chosen at runtime from SURF_MODEL instead of being
 * hard-coded, so switching models is "set an env var and redeploy" (or restart
 * `eve dev`). The default matches the AWS harness: Claude Haiku 5.5.
 */
const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

/**
 * DECISION: failover chain. If every Bedrock endpoint for the primary model
 * fails (outage, throttling, model not served), AI Gateway retries the next
 * model in this list in the SAME request. The app never sees the error.
 * - Sonnet 5.5: same family, more capable, served by Bedrock.
 * - Haiku 4.5: previous generation, separate Bedrock capacity pool.
 * All Claude: eve marks every tool `strict`, which Nova on Bedrock rejects, and
 * Llama on Bedrock can't stream tool calls (both tested 2026-11-03).
 * For provider-level failover too, set SURF_PROVIDERS=bedrock,anthropic.
 */
const FALLBACK_MODELS = ["anthropic/claude-sonnet-5.5", "anthropic/claude-haiku-4.5"];

/**
 * DECISION: `only: ["bedrock"]` is a hard provider filter. Calls are served by
 * Amazon Bedrock and never silently move to Anthropic's API or Vertex.
 * This uses AI Gateway's own Bedrock credentials (no AWS keys stored in Vercel).
 * To bill your own AWS project instead, add Bedrock BYOK credentials in
 * AI Gateway; no code change is needed here.
 * To ALSO allow cross-provider failover, change `only` to
 * `order: ["bedrock", "anthropic"]`.
 */
const PROVIDERS = (process.env.SURF_PROVIDERS ?? "bedrock").split(",").map((p) => p.trim());

/**
 * DECISION: model picker. The chat sends the visitor's choice, agent/channels/eve.ts
 * checks it against data/chat-models.json and stores it on the turn's auth as
 * `attributes.model`, and this function reads it. Unknown ids never reach here.
 * - Claude models stay Bedrock-only, with the Claude failover chain.
 * - Other vendors are served by their own provider, and fall back to the default
 *   Claude model on Bedrock if that provider fails: cross-provider failover.
 * The choice is memoized per turn, so a turn never switches model halfway
 * (e.g. while it waits for a booking approval).
 */
type ChatModel = (typeof chatModels.models)[number];
const PICKER = new Map<string, ChatModel>(chatModels.models.map((m) => [m.id, m]));

export default defineAgent({
  model: defineDynamic(async (ctx) => {
    const picked = await ctx.memo(["model", ctx.turn?.id ?? null], () => {
      const value = ctx.session.auth.current?.attributes.model;
      return typeof value === "string" && PICKER.has(value) ? value : "default";
    });
    const envModel = process.env.SURF_MODEL?.trim() || DEFAULT_MODEL;
    const model = picked === "default" ? envModel : picked;
    const isClaudeOnBedrock = picked === "default" || PICKER.get(picked)?.provider === "bedrock";
    const provider = PICKER.get(picked)?.provider ?? "bedrock";

    const gateway: Record<string, string[] | boolean> = isClaudeOnBedrock
      ? {
          only: PROVIDERS,
          models: FALLBACK_MODELS.filter((m) => m !== model),
          sessionAffinity: false,
          tags: tagsFor(model, "bedrock"),
        }
      : {
          // The vendor's own API first; if it fails, the default Claude on Bedrock.
          only: [provider, "bedrock"],
          order: [provider, "bedrock"],
          models: [DEFAULT_MODEL],
          sessionAffinity: false,
          tags: tagsFor(model, provider),
        };
    return { model, modelOptions: { providerOptions: { gateway } } };
  }),

  // DECISION: the AWS harness only allowed its surf tool (`allowedTools: ["@surf"]`).
  // Mirror that: turn off eve's optional sandbox/shell/file tools so the
  // model can only call get_surf_report.
  defaultTools: false,

  limits: {
    // Cost guardrail for the free AI Gateway credits: stop starting new
    // model calls once one conversation passes $0.25 or 200k new input tokens.
    sessionUsage: ({ window }) =>
      (window.costUsd ?? 0) >= 0.25 ||
      window.inputTokens - window.cacheReadTokens >= 200_000,
    // Idle sessions end after 12 hours (the default is 30 days).
    sessionTimeoutMs: 12 * 60 * 60 * 1_000,
  },
});

/** Spend visibility: AI Gateway reporting can group cost by these tags. */
function tagsFor(model: string, provider: string) {
  return [
    "app:surf-agent-eve",
    `env:${process.env.VERCEL_ENV ?? "local"}`,
    `primary:${model}`,
    `model:${model}`,
    `provider:${provider}`,
  ];
}
