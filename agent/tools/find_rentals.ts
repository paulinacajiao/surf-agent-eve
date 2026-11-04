import { defineTool } from "eve/tools";
import { z } from "zod";
import { findDestination, loadDestinations, RENTAL_SHOPS } from "../lib/glassy";

/** MOCK: board, gear and lesson availability from data/rentals.json. */
export default defineTool({
  description:
    "Find surf board rentals, gear, lessons and surf camps at a Glassy destination. Returns shops with item SKUs, " +
    "level, price per day in USD and stock. Camps also list weekly availability (week_of = Monday, spots_left). " +
    "DEMO DATA: prices, stock and availability are mock values. " +
    "Use the returned shop_id and sku with book_rental.",
  inputSchema: z.object({
    destination: z.string().min(1).max(100).describe("Destination or spot name, e.g. 'Bali' or 'Canggu'"),
    type: z.enum(["board", "gear", "lesson", "camp", "any"]).default("any"),
    level: z.enum(["beginner", "intermediate", "advanced", "expert", "any"]).default("any"),
  }),
  label: { start: ({ destination }) => `Checking rentals in ${destination}` },
  async execute({ destination, type, level }) {
    const { destinations } = await loadDestinations();
    const d = findDestination(destinations, destination);
    if (!d) return { error: `No Glassy destination matches "${destination}".`, available: destinations.map((x) => x.name) };
    const shops = RENTAL_SHOPS.filter((s) => s.destination === d.slug)
      .map((s) => ({
        shop_id: s.id,
        name: s.name,
        location: s.location,
        rating: s.rating,
        items: s.items.filter(
          (i) => (type === "any" || i.type === type) && (level === "any" || i.level === level || i.level === "all"),
        ),
      }))
      .filter((s) => s.items.length > 0);
    return { destination: d.name, mock: true, shops };
  },
});
