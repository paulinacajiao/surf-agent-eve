# Demo script: "Lambda + Bedrock → a production agent layer"

**Length:** about 12 minutes. **Live URL:** https://surf-agent-eve.vercel.app

**Story in one line:** Glassy already had a surf agent on AWS (AgentCore, Lambda, Bedrock). We kept
the AWS tool and the Bedrock model, and moved the agent layer onto Vercel: eve for durable sessions,
tools and traces, and AI Gateway for one API, model flexibility, spend visibility and failover.

## Before you start (5 min ahead)

Open these tabs:

| Tab | What it shows |
|---|---|
| 1 | https://surf-agent-eve.vercel.app/destinations/bali-indonesia |
| 2 | Vercel → `surf-agent-eve` → Observability → **Agent Runs** |
| 3 | Vercel → **AI Gateway → Logs** (filter tag `app:surf-agent-eve`) |
| 4 | AWS console → CloudWatch → log group `/aws/lambda/surf_report` |
| 5 | Editor on `agent/agent.ts` and `agent/tools/` |
| 6 | Terminal in `surf-agent-eve/` |

Warm up: ask one question on the site, so the first live answer isn't a cold start.

## 1. The starting point (1 min)

**Show:** a slide or the README diagram.

**Say:**
- Glassy is a surf trip site. Its surf agent ran on AWS: an AgentCore harness, a Lambda that wraps
  Open-Meteo, and Claude on Bedrock.
- Customers in this situation want to keep their AWS investment. They don't want to rebuild the
  agent loop, sessions, streaming, approvals and observability by hand.

## 2. Start a session and call an AWS tool (3 min)

**Do:** on the Bali page (tab 1), click **"I'm a beginner. Is Canggu good this week?"**

**Point at while it streams:**
- **Tool steps appear live:** "Looking up Bali on Glassy" (Glassy's own spot data), then
  "Checking the surf at Canggu" (the **existing AWS Lambda**, unchanged).
- **The answer is grounded:** live wave height, period and wind, plus a level-appropriate pick.
  It steers the beginner away from Uluwatu and Padang Padang (expert reefs).

**Say:** the Lambda is called with short-lived credentials. The Vercel function presents its
OIDC token to AWS STS and assumes one IAM role, whose only permission is invoking this Lambda.
No AWS keys are stored in Vercel.

**Show:** tab 5, `agent/tools/get_surf_report.ts` (about 30 lines), then tab 4, the same invocation
in CloudWatch.

## 3. Durable session with a human in the loop (2 min)

**Do:** in the same chat, type: *"Rent me a soft-top and book the group lesson for Friday, name Alex."*

**Show:**
- The agent finds the rentals, then **pauses** with an **Approve** button for `book_rental`.
- Click **Approve**: you get a demo confirmation code (mock data, nothing charged).

**Say:**
- The wait is durable: it runs on Vercel Workflows, so it survives restarts and deploys, and
  could last days.
- Approval is declared on the tool (`approval: always()`), not left to the model's judgement.

## 4. The model call goes through AI Gateway to Bedrock (2 min)

**Show:** tab 3, AI Gateway Logs, on the request you just made:
- Provider: **bedrock**. Model: `anthropic/claude-haiku-5.5`.
- Cost and latency per call. Tags: `app:surf-agent-eve`, `env:production`, `primary:<model>`.

**Show:** tab 5, `agent/agent.ts`:
- `only: ["bedrock"]`: Bedrock stays the provider, with no silent move to another one.
- `models: [...]`: the failover chain.
- `tags`: spend can be attributed per app, environment and model.
- `limits.sessionUsage`: a $0.25 cap per conversation.

## 5. Switch models and show failover (2 min)

Use the terminal (tab 6). Locally, each switch takes a few seconds:

```bash
SURF_MODEL=deepseek/deepseek-v3.2 pnpm dev        # a different vendor, still on Bedrock
SURF_MODEL=mistral/mistral-large-3 pnpm dev       # not on Bedrock → failover
```

**Say:**
- **Switch:** changing the model is an environment variable. On Vercel, that's a redeploy, and an
  instant rollback if it goes wrong.
- **Failover:** Mistral Large 3 isn't served by Bedrock, so `only: ["bedrock"]` rejects it.
  AI Gateway retries the *same request* on Claude Sonnet 5.5 on Bedrock, and the user never sees
  an error.

**Show:** AI Gateway Logs for that request: one failed attempt (mistral), then one successful
attempt (sonnet).

**Backup if live is slow:** a screenshot of that log entry.

## 6. Inspect a run trace for cost and time (2 min)

**Show:** tab 2, Agent Runs, then open the Canggu conversation.

**Walk through a real example:**

| Step | Time | Cost |
|---|---|---|
| Model decides to look up the spot | 1.8 s | $0.0008 |
| `get_spot_info` (Glassy data) | 19 ms | n/a |
| Model asks for the live report | 1.9 s | $0.0005 |
| `get_surf_report` (AWS Lambda) | 1.2 s | n/a |
| Model writes the answer | 5.2 s | $0.0008 |
| **Total** | **10.2 s** | **$0.002** |

**Say:**
- The model accounts for most of the time, and the AWS tool is about 1 s.
- Cost is visible per step and per conversation, and AI Gateway adds the cross-app view.

## 7. Close (30 s)

- **Kept:** the AWS Lambda, Bedrock as the provider, and the system prompt, word for word.
- **Gained:**
  - Durable sessions and approvals.
  - A web chat on the customer's own site.
  - One model API with failover.
  - Spend per tag.
  - Traces for every run.
- **Effort:** about 4 tool files, 1 agent config file and an IAM role. There are no AWS keys in Vercel.

## If something breaks live

| Symptom | Fallback |
|---|---|
| Site chat errors | `scripts/demo.sh https://surf-agent-eve.vercel.app` in the terminal |
| AI Gateway slow or erroring | Show the failover log screenshot, and explain that this is exactly the case it covers |
| Lambda errors | The agent explains the failure. Show the CloudWatch log and the sanitized error in `get_surf_report.ts` |
| No traces yet | `pnpm exec eve traces` locally |
