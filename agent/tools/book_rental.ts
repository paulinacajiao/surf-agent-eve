import { createHash } from "node:crypto";
import { defineWorkflowTool } from "eve/tools";
import { FatalError } from "eve/workflow";
import { z } from "zod";
import { RENTAL_SHOPS } from "../lib/glassy";

/**
 * MOCK booking, written as a durable workflow. Nothing is reserved or charged.
 *
 * DECISION: defineWorkflowTool instead of defineTool + approval. Each booking is
 * its own Workflow run with named steps, so Vercel → Workflows shows
 * checkAvailability → priceBooking → (waiting for approval) → reserveBooking →
 * sendConfirmation, and the run ends Completed. The approval is a ctx.ask inside
 * the run, so the person sees the real total, not just the model's raw input.
 *
 * DECISION: the workflow body only orchestrates. It replays after every wait, so
 * anything with side effects or non-determinism (lookups, hashing, clocks) lives
 * in a "use step" function, whose result is recorded and reused on replay.
 */
const BookingInput = z.object({
  shop_id: z.string().min(1).max(60),
  sku: z.string().min(1).max(60),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
  days: z.number().int().min(1).max(14),
  customer_name: z.string().min(1).max(80),
});
type BookingInput = z.infer<typeof BookingInput>;

export default defineWorkflowTool({
  description:
    "Book a board, gear, lesson or camp from find_rentals. DEMO: no real booking or payment is made. " +
    "Call it as soon as you know the item, start date, number of days and the user's name: " +
    "it shows the user the price and an Approve / Deny step itself.",
  inputSchema: BookingInput,
  label: { start: ({ sku }) => `Booking ${sku}` },
  async execute(input, ctx) {
    "use workflow";
    const item = await checkAvailability(input);
    const quote = await priceBooking(input, item.price_per_day_usd);

    const answer = await ctx.ask({
      title: "Confirm booking",
      prompt:
        `${item.item} at ${item.shop} (${item.location})\n` +
        `${input.days} day(s) from ${input.start_date} for ${input.customer_name}\n` +
        `Total: $${quote.total_usd} USD (demo, nothing is charged)`,
      display: "confirmation",
      options: [
        { id: "approve", label: "Approve", style: "primary" },
        { id: "deny", label: "Deny" },
      ],
    });
    if (answer.status !== "answered" || answer.optionId !== "approve") {
      return { booked: false, reason: answer.status === "answered" ? "denied by the user" : answer.status };
    }

    const booking = await reserveBooking(input, quote.total_usd);
    await sendConfirmation(booking.confirmation, input.customer_name);
    return {
      mock: true,
      booked: true,
      ...booking,
      shop: item.shop,
      location: item.location,
      item: item.item,
      start_date: input.start_date,
      days: input.days,
      total_usd: quote.total_usd,
      note: "Demo booking: nothing was reserved or charged.",
    };
  },
});

/** Step 1: the item exists and is in stock (mock inventory in data/rentals.json). */
async function checkAvailability(input: BookingInput) {
  "use step";
  const shop = RENTAL_SHOPS.find((s) => s.id === input.shop_id);
  const item = shop?.items.find((i) => i.sku === input.sku);
  if (!shop || !item) throw new FatalError("Unknown shop_id or sku. Call find_rentals first.");
  if (item.stock < 1) throw new FatalError(`${item.name} is sold out at ${shop.name}.`);
  return { shop: shop.name, location: shop.location, item: item.name, price_per_day_usd: item.price_per_day_usd };
}

/** Step 2: price the booking. */
async function priceBooking(input: BookingInput, pricePerDay: number) {
  "use step";
  return { price_per_day_usd: pricePerDay, days: input.days, total_usd: pricePerDay * input.days };
}

/**
 * Step 3 (after approval): "reserve" it. The code is a hash of the input, not
 * random, so a retried step returns the same booking (idempotent).
 */
async function reserveBooking(input: BookingInput, total: number) {
  "use step";
  const code = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 6).toUpperCase();
  return { confirmation: `GLASSY-${code}`, reserved_at: new Date().toISOString(), total_usd: total };
}

/** Step 4: mock confirmation email (logged only). */
async function sendConfirmation(confirmation: string, customerName: string) {
  "use step";
  console.log(`[book_rental] confirmation ${confirmation} sent to ${customerName} (mock)`);
  return { sent: true };
}
