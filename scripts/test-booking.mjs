// Exercises the booking approval flow end to end:
//   node scripts/test-booking.mjs [baseUrl]   (default http://localhost:3000)
import { Client } from "eve/client";

const client = new Client({ baseUrl: process.argv[2] ?? "http://localhost:3000" });
const { session, delivery } = await client.sessions.create({
  message:
    "I'm a beginner. Book me the 2 h group lesson at Bali Wave Riders in Canggu for 2026-11-06, 1 day, name Paulina. Go ahead and book it.",
});
let result = await delivery.result();
console.log("turn 1:", result.status, "| open approvals:", result.interactions?.length ?? 0);
for (const i of result.interactions ?? []) console.log("  prompt:", i.request?.prompt ?? i.request?.kind);

if (result.interactions?.length) {
  const resumed = await session.respond(
    result.interactions.map((i) => ({ interactionId: i.interactionId, optionId: "approve" })),
  );
  result = await resumed.result();
  console.log("after approve:", result.status);
}
console.log(JSON.stringify(result, null, 1).slice(0, 1500));
