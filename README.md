# Glassy surf agent on eve

An AWS-built surf agent (AgentCore + Lambda + Bedrock) moved onto a production agent layer on Vercel.
One repo, one Vercel project:

- **`agent/`** is an [eve](https://vercel.com/docs/frameworks/agents/eve) agent with durable sessions, tools, approvals and traces.
- **`apps/web/`** is a light version of the Glassy site: destination pages with an "Ask Glassy" chat.
- Model calls go through **Vercel AI Gateway** to **Amazon Bedrock** (Claude), with failover and spend tracking.
  Claude runs in our own AWS project through **Bedrock BYOK** (since 2026-11-09), so those tokens are
  billed by AWS. See [Billing: system Bedrock vs. BYOK](#billing-system-bedrock-vs-byok).
- The live surf report is the **existing AWS Lambda**, called with short-lived credentials from Vercel OIDC.
  No AWS keys are stored in this repo or in the project's environment variables.

Live demo: https://surf-agent-eve.vercel.app

```
browser ──► apps/web (Next.js)  ── /eve/v1/* ──►  eve agent (Vercel Functions + Workflows)
                                                   │
             ┌───────────────────┬─────────────────┼────────────────────┐
             ▼                   ▼                 ▼                    ▼
       get_spot_info       get_surf_report    find_rentals         book_rental
       Glassy Supabase     AWS Lambda          mock data            mock data,
       (or bundled JSON)   → Open-Meteo                             needs approval
                                                   │
                                          AI Gateway (only: bedrock)
                                          Haiku 5.5 → Sonnet 5.5 → Haiku 4.5
                                                   ▼
                                            Amazon Bedrock
```

| What | Where |
|---|---|
| System prompt | `agent/instructions.md` |
| Model, Bedrock pin, failover chain, spend tags, cost cap | `agent/agent.ts` |
| Tools | `agent/tools/*.ts` |
| AWS auth (OIDC role, pinned Region) | `agent/lib/aws.ts` |
| Spot data loader (Supabase or bundled) | `agent/lib/glassy.ts`, `apps/web/lib/destinations.ts` |
| Who may chat (public demo guard) | `agent/channels/eve.ts` |
| Demo data | `data/destinations.json` (snapshot of Glassy's Supabase), `data/rentals.json` (mock) |
| Site + agent as one deployment | `vercel.ts` |

## Run it locally

Needs Node 24, pnpm, and a Vercel account with AI Gateway **paid credits**: free credits refuse
Claude, DeepSeek and GPT models.

```bash
pnpm install
pnpm exec eve link                     # links a Vercel project, gives a 12 h AI Gateway token
cp .env.example .env.local             # optional: everything has a default
AWS_PROFILE=<profile> pnpm dlx vercel@latest dev --local   # site + agent on http://localhost:3000
```

- `pnpm dev` runs the agent alone in eve's terminal chat.
- Without AWS access, `get_surf_report` fails and the agent says so; the other tools still work.
  To bring your own: deploy a Lambda that takes `{spot_name, latitude, longitude}` and returns
  conditions, and set `SURF_LAMBDA_NAME`.
- Running site and agent together (`vercel dev --local`) needs Vercel CLI 59.16 or newer, hence `pnpm dlx vercel@latest`.

## Deploy

This repo is connected to the Vercel project `surf-agent-eve`:

- **Push to any branch:** Vercel builds a **preview** deployment and posts its URL on the commit or PR.
- **Merge to `main`:** Vercel deploys to **production** (https://surf-agent-eve.vercel.app).

To deploy your own copy from scratch:

```bash
pnpm exec eve link
vercel env add PUBLIC_DEMO production         # true
vercel env add AWS_ROLE_ARN production        # see "AWS setup"
vercel env add SUPABASE_URL production        # optional
vercel env add SUPABASE_ANON_KEY production   # optional
pnpm exec eve deploy --non-interactive --yes
```

### AWS setup (one time)

| Resource | Setting |
|---|---|
| IAM OIDC provider | URL `https://oidc.vercel.com/<team-slug>`, audience `https://vercel.com/<team-slug>` |
| IAM role `surf-agent-eve-vercel-role` | Trust `sts:AssumeRoleWithWebIdentity` from that provider, `aud` = the audience, `sub` like `owner:<team-slug>:project:surf-agent-eve:environment:production` (add `preview`/`development` as needed). Inline policy: `lambda:InvokeFunction` on the `surf_report` function only. Max session 1 h |

The `development` environment lets `eve dev` use the same role, but anyone with access to the
Vercel project can then get a 12 h token. Drop it for customer setups.

Cleanup: delete the role's inline policy, then the role, then the OIDC provider.

## Try it (generates traces)

- On the site: open a destination, then click a question in **Ask Glassy**.
- Script: `scripts/demo.sh https://<deployment>` sends 4 canned questions, one session each.
- Booking with approval: `node scripts/test-booking.mjs http://localhost:3000`. The turn pauses at
  `book_rental` until it's approved, then returns a demo confirmation.

Good demo questions:
1. "I'm a beginner going to Bali. Which spot should I surf tomorrow?" uses `get_spot_info` and `get_surf_report`.
2. "Rent me a board and book a lesson in Canggu for Friday, name Alex." uses `find_rentals`, then `book_rental` with approval.
3. "When is the best month to surf Nazaré?" uses Glassy's seasonal data.

## Switch models (no code change)

The model comes from `SURF_MODEL` (default `anthropic/claude-haiku-5.5`). Verified with eve tools
on Bedrock (2026-11-04):

| `SURF_MODEL` | Notes |
|---|---|
| `anthropic/claude-haiku-5.5` | Default, same as the AWS harness |
| `anthropic/claude-sonnet-5.5` | Bigger Claude |
| `openai/gpt-5.5` | Served by Bedrock too |
| `deepseek/deepseek-v3.2` | Served by Bedrock |

Amazon Nova and Llama 4 on Bedrock **don't** work with eve tools: Nova rejects the `strict` flag
eve sets on every tool, and Llama on Bedrock can't stream tool calls.

- Locally: `SURF_MODEL=deepseek/deepseek-v3.2 pnpm dev`
- On Vercel: `vercel env add SURF_MODEL production`, then redeploy. Each deploy is immutable, so
  rolling back a model change is an instant rollback.
- `SURF_PROVIDERS=bedrock,anthropic` allows provider-level failover too (Bedrock first).

## Model picker (visitors choose the model)

The chat has a **Model** dropdown under the message box. The list lives in
`data/chat-models.json`; edit it to add or remove models (any id from
`https://ai-gateway.vercel.sh/v1/models`).

| Picker option | Served by | If that provider fails |
|---|---|---|
| Claude Haiku 5.5 (default) | Amazon Bedrock (`SURF_MODEL`) | Claude Sonnet 5.5 → Haiku 4.5, still Bedrock only |
| Claude Sonnet 5.5 | Amazon Bedrock | same Claude chain on Bedrock |
| GPT-6.1 Terra | OpenAI | default Claude on Bedrock |
| Grok 4.7 | xAI | default Claude on Bedrock |
| Gemini 3.8 Flash | Google | default Claude on Bedrock |

How it works: the chat sends `clientContext: { model }` with each message.
`agent/channels/eve.ts` accepts only ids in that file (anything else gets the default) and passes
the choice to `agent/agent.ts`, which sets the model and AI Gateway routing for that turn. Each
request is tagged `model:<id>` and `provider:<name>`, so AI Gateway shows cost and latency per model.
All five were verified with a full booking (find_rentals, then book_rental with approval) on
2026-11-08. GPT, Grok and Gemini are billed through AI Gateway credits. Claude is billed by AWS
through Bedrock BYOK (see [Billing](#billing-system-bedrock-vs-byok)).

## Demonstrate failover

Pick a primary model Bedrock doesn't serve, so the `only: ["bedrock"]` filter rejects it:

```bash
SURF_MODEL=mistral/mistral-large-3 pnpm dev
```

The answer still arrives: AI Gateway moves the same request to `claude-sonnet-5.5` on Bedrock.
AI Gateway → Logs shows the failed and successful attempts (`modelAttempts`). `eve traces`
shows the model the agent *requested*, not the one that answered.

## Traces, cost, and time

- **Vercel → project → Observability → Agent Runs:** every conversation, its steps and tool calls, tokens, time.
- **Vercel → AI Gateway → Logs:** each model request with provider (`bedrock`), model, cost, fallbacks.
  Requests are tagged `app:surf-agent-eve`, `env:<env>`, `primary:<model>`.
- **Local:** `pnpm exec eve traces list`, then `pnpm exec eve traces`.
- **AWS:** CloudWatch log group `/aws/lambda/surf_report`.
- Typical question: about $0.002 to $0.02, 5 to 10 s (model ≈ 1.5 s per step, Lambda ≈ 1 s).

## Guardrails for a public demo

- `PUBLIC_DEMO=true` admits anonymous visitors, but only same-origin requests, and at most
  30 new messages per IP per 10 min (in memory, per instance; best effort).
- Each session stops calling the model after $0.25 or 200k new input tokens (`agent/agent.ts`).
- Recommended: set an AI Gateway budget and a Vercel Firewall rate-limit rule on `/eve/v1`.
- `book_rental` always needs approval, and bookings are fake (no payment, nothing reserved).

## Billing: system Bedrock vs. BYOK

AI Gateway can call Bedrock two ways:

- **System credentials** (AI Gateway's default): Bedrock runs under Vercel's own access. Tokens are
  billed as AI Gateway credits, not on your AWS bill, and don't use your Bedrock quotas, CloudWatch
  or Cost Explorer.
- **BYOK** (bring your own key): AI Gateway calls Bedrock with your AWS credentials, in your AWS
  project. Same code, same routing, failover, tags and Logs; tokens are billed by AWS.

**This demo uses BYOK for Bedrock** (enabled 2026-11-09, for the demo only):

- IAM user `vercel-ai-gateway-bedrock` in project `962966032955`, tagged `project=surf-agent`, with
  an inline invoke-only policy (`bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` on
  Claude and Nova models and their `us.`/`global.` inference profiles).
- Its access key is stored in Vercel → AI Gateway → Bring Your Own Key → Amazon Bedrock. The key
  applies to the whole Vercel team.
- The `get_surf_report` Lambda doesn't use this key: it still uses Vercel OIDC → IAM role (no stored key).

Why a stored key and not OIDC: with BYOK, AI Gateway (not our code) calls Bedrock, and Bedrock BYOK
accepts an access key/secret or a Bedrock API key, not a role to assume. So the key is scoped to
invoke only, rotated with **Replace Key** in the BYOK page, and visible in CloudTrail.

If a BYOK request fails, AI Gateway retries with its system credentials, and that request is
billed as AI Gateway credits again. BYOK spend also isn't counted in AI Gateway budgets: use an
AWS Budget on Bedrock (the per-session $0.25 cap in `agent/agent.ts` still applies).

| Models | Served by | Billed to |
|---|---|---|
| Claude Haiku 5.5, Sonnet 5.5 | Amazon Bedrock, with our key (BYOK) | **Our AWS bill** |
| GPT-6.1 Terra, Grok 4.7, Gemini 3.8 Flash | OpenAI, xAI, Google | AI Gateway credits |

### Check that BYOK is used

- **AI Gateway → Logs:** open a request. Under **Cost**, **Inference** is `$0.0000` for BYOK
  requests (AWS bills the tokens), and the **Routing** card shows the credential source. The
  **Routing** filter shows only BYOK or only system requests. The **Authentication** column is how
  the app signed in to AI Gateway (here the project's OIDC token, `surf-glassy-agent`), not the
  Bedrock credential.
- **Why the Cost column isn't $0:** it includes **Tag / User ID reporting**, $0.075 per 1,000 tag
  writes, billed to AI Gateway credits even with BYOK. The agent sends 5 tags per model call
  (`tagsFor()` in `agent/agent.ts`), so about $0.0004 per call. That's more than Haiku's own
  inference cost, so for production keep only the tags you report on (for example `env` and `model`).
- **AWS → CloudTrail → Event history,** filter **User name = `vercel-ai-gateway-bedrock`:** one
  `InvokeModelWithResponseStream` per model step, a second or two after the matching AI Gateway log.
  A fallback to system credentials would leave no event here.
- **AWS → IAM → Users → `vercel-ai-gateway-bedrock` → Security credentials:** "Last used" with Amazon Bedrock.
- **AWS → Cost Explorer,** service Bedrock: shows the spend after about 24 hours.

To turn BYOK off, disable or delete the key in the BYOK page; AI Gateway goes back to system
credentials with no code change. Cleanup: delete the access key and the IAM user.

## Known limitations

- **Bedrock BYOK uses a stored access key** (invoke-only IAM user), not OIDC. For production,
  rotate it regularly and alert on its use in CloudTrail (see [Billing](#billing-system-bedrock-vs-byok)).
- **eve is a release candidate** (`1.0.0-rc.3`, pinned).
- Rentals and bookings are mock data; the spot list is a snapshot unless Supabase is configured.
- Spots have no coordinates of their own in Glassy's data; the agent picks offshore coordinates itself.
