import { defineTool } from "eve/tools";
import { z } from "zod";
import { findDestination, loadDestinations } from "../lib/glassy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Glassy's own knowledge about a destination: its spots (break type, difficulty),
 * and the typical conditions for a month. Complements get_surf_report, which has
 * the live forecast but knows nothing about the spot itself.
 */
export default defineTool({
  description:
    "Look up a Glassy destination (Bali, North Shore Hawaii, Nazaré Portugal, Santa Teresa Costa Rica, " +
    "Rio de Janeiro Brazil) " +
    "or one of its surf spots. Returns the destination's coordinates, every spot with its break type " +
    "and difficulty, and the typical season for a month (swell, wind, crowds, water temperature). " +
    "Use it to pick a spot that matches the surfer's level and for 'when should I go' questions. " +
    "Call with an empty query to list all destinations.",
  inputSchema: z.object({
    query: z.string().max(100).describe("Destination or spot name, e.g. 'Bali', 'Pipeline', 'nazare-portugal'. Empty lists all."),
    month: z.number().int().min(1).max(12).optional().describe("Month 1-12 for seasonal info; defaults to the current month"),
  }),
  label: { start: ({ query }) => (query ? `Looking up ${query} on Glassy` : "Listing Glassy destinations") },
  async execute({ query, month }) {
    const { source, destinations } = await loadDestinations();
    if (!query.trim()) {
      return {
        source,
        destinations: destinations.map((d) => ({ slug: d.slug, name: d.name, country: d.country, spots: d.surf_spots.map((s) => s.name) })),
      };
    }
    const d = findDestination(destinations, query);
    if (!d) {
      return { source, error: `No Glassy destination matches "${query}".`, available: destinations.map((x) => x.name) };
    }
    const m = month ?? new Date().getUTCMonth() + 1;
    const season = d.destination_seasons.find((s) => s.month === m);
    return {
      source,
      destination: { slug: d.slug, name: d.name, country: d.country, description: d.description, lat: d.lat, lon: d.lon },
      spots: d.surf_spots,
      season: season ? { ...season, month_name: MONTHS[m - 1] } : null,
      page: `/destinations/${d.slug}`,
    };
  },
});
