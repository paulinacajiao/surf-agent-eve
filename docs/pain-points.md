# Pain points: moving the surf agent to eve and AI Gateway

These are the problems actually hit while building this (2026-11-03 and 04). For each one:
what happened, how it was solved, and the takeaway.

## Model access and billing

| # | Pain point | What happened | Resolution | Takeaway / feedback |
|---|---|---|---|---|
| 1 | **A card is needed before any request** | The first call failed: "AI Gateway requires a valid credit card on file" | The user added a card | Surprising for a "free credits" tier; worth saying in onboarding |
| 2 | **Free credits block Claude, DeepSeek and GPT** | Still refused after adding a card: `RestrictedModelsError` ("Free tier users do not have access to this model") | Bought paid credits. The credits API showed $4.99 (free) vs. $24.99 (paid) | The restriction isn't obvious up front. Upgrading the Vercel *plan* isn't the same as buying AI Gateway *credits* |
| 3 | **Failover hid the real error** | eve reported "This model doesn't support the strict field", which came from the *last* fallback (Nova). The real cause, the free tier blocking Claude, only appeared in `modelAttempts` | Called AI Gateway directly to see each attempt | When every fallback fails, show the primary's error first, or a summary of all attempts |
| 4 | **Keeping the model "in your AWS" needs BYOK** | With system credentials, Bedrock runs on AI Gateway's AWS account, billed by AI Gateway. BYOK is paid tier only, and silently falls back to system credentials if it fails | Chose system Bedrock for the demo, and documented BYOK | Customers with Bedrock commitments will ask about this. The silent fallback needs explaining |

## Model flexibility vs. tool calling

| # | Pain point | What happened | Resolution | Takeaway / feedback |
|---|---|---|---|---|
| 5 | **Nova on Bedrock rejects eve's tools** | "This model doesn't support the strict field": eve marks every tool `strict`, with no option to turn it off | Fallback chain limited to Claude | "Any model" really means any model that supports tool calling *as eve sends it* |
| 6 | **Llama 4 on Bedrock can't stream tool calls** | "This model doesn't support tool use in streaming mode" | Removed from the chain | The model catalog doesn't show per-provider tool or streaming support |
| 7 | **The catalog changes under you** | The failover demo planned GPT-5.5 as "not on Bedrock", but Bedrock now serves it, so it answered directly | Used Mistral Large 3 instead (Mistral-only) | Test fallback scenarios against the live catalog, not assumptions |
| 8 | **The trace shows the requested model, not the one that served** | After failover, `eve traces` still showed `mistral-large-3` while Sonnet answered | Failover is shown from AI Gateway Logs | Agent Runs should show the model that actually served the call |

Verified working with eve tools on Bedrock: Claude Haiku 5.5, Sonnet 5.5, GPT-5.5, DeepSeek V3.2.

## AWS integration

| # | Pain point | What happened | Resolution | Takeaway / feedback |
|---|---|---|---|---|
| 9 | **OIDC federation is manual IAM work** | Needed an OIDC provider, a role with the exact `sub` format (`owner:<team>:project:<p>:environment:<env>`), and a scoped policy | Created them by hand, and documented the steps in the README | A template (CloudFormation/Terraform) would remove the guesswork |
| 10 | **Vercel sets `AWS_REGION`** | Functions get `AWS_REGION` set to the *execution* Region, which isn't the Lambda's Region | Pinned it with a separate `SURF_AWS_REGION` | An easy mistake for AWS customers to make |
| 11 | **Dev access vs. least privilege** | Letting `eve dev` use the role means trusting `environment:development`, so anyone on the Vercel project can get a 12 h token | Kept it for the demo, and flagged it | Customers should use a separate dev role |
| 12 | **AgentCore Gateway (MCP) vs. a direct Lambda call** | Going through the AgentCore Gateway would add a second signed hop and an MCP client for one tool | Called the Lambda directly | Fine for one tool; with many tools, connect eve to the gateway over MCP |

## eve framework and the Vercel platform

| # | Pain point | What happened | Resolution | Takeaway / feedback |
|---|---|---|---|---|
| 13 | **Release candidate** | eve is `1.0.0-rc.3`, so its API may change | Pinned the exact version | Note it in a customer proposal |
| 14 | **Type errors in tool definitions** | `label: "..."` doesn't compile; it needs `{ start: (input) => ... }` | Fixed by following the type | The docs and examples could show this |
| 15 | **Web chat refuses production traffic by default** | `placeholderAuth()` returns 401 in production; a public demo needs a custom `AuthFn` around `none()` | Wrote an auth gate: same-origin, a per-IP limit, and an env flag | Secure by default (good), but there's no built-in rate limit for anonymous use |
| 16 | **Local site + agent needs a newer CLI** | `vercel dev --local` needs Vercel CLI 59.16+, and 50.33 was installed | Used `pnpm dlx vercel@latest` | The installer could check the version |
| 17 | **Images broke under Vercel services** | With `vercel.ts` services, Next.js `/_next/image` returned 404, so every image was broken | `images: { unoptimized: true }` | Looks like a platform/routing gap worth reporting |
| 18 | **No preview path for deploys** | `eve deploy` only deploys to production. `vercel deploy` without `--prod` also went to production, as the project's first deployment | Connected the GitHub repo: branches now get preview deployments, and `main` deploys to production | A preview flag on `eve deploy` would help; the Git workflow is the practical answer |
| 19 | **Short-lived dev tokens** | The local AI Gateway token from `eve link` lasts 12 h | Re-run `eve link` | Fine, but surprising mid-demo |

## Data and product

| # | Pain point | What happened | Resolution | Takeaway |
|---|---|---|---|---|
| 20 | **No real rentals backend** | Glassy has no bookings data | Mock catalog with Glassy's school names, and an approval-gated mock booking | Good enough to show the pattern; label it clearly |
| 21 | **Spots have no coordinates** | Only destinations have latitude/longitude in Glassy's Supabase | The agent picks offshore coordinates itself | Add per-spot coordinates for accuracy |

## What went well (for balance)

- The **AWS Lambda didn't change at all**: same input and output contract as the AgentCore Gateway target.
- **Failover really works:** one request, a failed attempt, then a successful one, with no error to the user.
- **Cost is tiny and visible:** about $0.002 to $0.02 per question, with 5 to 10 s end to end.
- **Durable approval** came from one line (`approval: always()`).
- **One repo, one deploy** for the website and the agent (`vercel.ts`).
