# Glassy surf agent on eve

An AWS-built surf agent (AgentCore + Lambda + Bedrock) moved onto a production agent layer on Vercel.
One repo, one Vercel project:

- **`agent/`** is an [eve](https://vercel.com/docs/frameworks/agents/eve) agent with durable sessions, tools, approvals and traces.
- **`apps/web/`** is a light version of the Glassy site: destination pages with an "Ask Glassy" chat.
- Model calls go through **Vercel AI Gateway** to **Amazon Bedrock** (Claude), with failover and spend tracking.
- The live surf report is the **existing AWS Lambda**, called with short-lived credentials from Vercel OIDC. No AWS keys are stored.

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

## Known limitations

- **System Bedrock:** the model runs on Bedrock under AI Gateway's credentials and is billed by
  AI Gateway. To run it in your own AWS project, add Bedrock BYOK in AI Gateway (paid tier).
- **eve is a release candidate** (`1.0.0-rc.3`, pinned).
- Rentals and bookings are mock data; the spot list is a snapshot unless Supabase is configured.
- Spots have no coordinates of their own in Glassy's data; the agent picks offshore coordinates itself.
