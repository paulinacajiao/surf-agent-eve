import { createHash } from "node:crypto";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { RENTAL_SHOPS } from "../lib/glassy";

/**
 * MOCK booking. Nothing is reserved or charged; it returns a demo confirmation.
 *
 * DECISION: approval: always(). A booking is a side effect on the user's behalf,
 * so the turn pauses until the person clicks Approve in the chat. eve keeps that
 * wait durable (it survives restarts and deploys), which is the point of the demo.
 *
 * DECISION: the confirmation code is a hash of the input, not random, so if eve
 * replays this step after a crash it returns the same booking (idempotent).
 */
export default defineTool({
  description:
    "Book a board, gear or lesson from find_rentals. DEMO: no real booking or payment is made. " +
    "Always confirm the item, date and number of days with the user before calling.",
  inputSchema: z.object({
    shop_id: z.string().min(1).max(60),
    sku: z.string().min(1).max(60),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
    days: z.number().int().min(1).max(14),
    customer_name: z.string().min(1).max(80),
  }),
  approval: always(),
  label: { start: ({ sku }) => `Booking ${sku}` },
  async execute(input) {
    const shop = RENTAL_SHOPS.find((s) => s.id === input.shop_id);
    const item = shop?.items.find((i) => i.sku === input.sku);
    if (!shop || !item) return { error: "Unknown shop_id or sku. Call find_rentals first." };
    if (item.stock < 1) return { error: `${item.name} is sold out at ${shop.name}.` };
    const code = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 6).toUpperCase();
    return {
      mock: true,
      confirmation: `GLASSY-${code}`,
      shop: shop.name,
      location: shop.location,
      item: item.name,
      start_date: input.start_date,
      days: input.days,
      total_usd: item.price_per_day_usd * input.days,
      note: "Demo booking: nothing was reserved or charged.",
    };
  },
});
