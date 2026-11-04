import { eveChannel } from "eve/channels/eve";
import { type AuthFn, localDev, none, vercelOidc } from "eve/channels/auth";

/**
 * DECISION: this is a public demo site, so browsers on it may chat anonymously,
 * but only when PUBLIC_DEMO=true is set on the deployment. Without it, production
 * browser requests get 401 (eve fails closed).
 *
 * Guards for anonymous traffic, cheapest first:
 * 1. Same-origin only: a browser request must come from this site's own pages,
 *    so other sites can't embed the agent. (Non-browser clients can fake Origin;
 *    the next guards cover that.)
 * 2. A per-IP limit on new messages. It's in memory, so per function instance and
 *    best effort. For real traffic, add a Vercel Firewall rate-limit rule on /eve/v1.
 * 3. The per-session cost cap in agent.ts, and an AI Gateway budget on the team.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_POSTS_PER_WINDOW = 30;
const hits = new Map<string, number[]>();

const publicDemo = none<Request>();

const publicDemoAuth: AuthFn<Request> = async (request) => {
  if (process.env.PUBLIC_DEMO !== "true") return null;

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return null;

  if (request.method === "POST") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_POSTS_PER_WINDOW) return null;
    recent.push(now);
    hits.set(ip, recent);
  }
  return publicDemo(request);
};

export default eveChannel({
  auth: [
    // The eve CLI and server code in this Vercel project (scripts/demo.sh, eve remote connect).
    vercelOidc(),
    // Open on localhost for `eve dev` and `pnpm dev:all`; ignored in production.
    localDev(),
    // Anonymous visitors of the public demo site.
    publicDemoAuth,
  ],
});
