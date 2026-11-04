import "server-only";
import bundled from "../../../data/destinations.json";

/**
 * Same source rule as the agent (agent/lib/glassy.ts): Glassy's Supabase when
 * SUPABASE_URL and SUPABASE_ANON_KEY are set, else the bundled snapshot.
 */
export type Destination = (typeof bundled)[number];

const SELECT =
  "slug,name,country,description,hero_image,lat,lon," +
  "surf_spots(name,break_type,difficulty,best_season,wave_height_min,wave_height_max,description)," +
  "destination_seasons(month,swell_height_min,swell_height_max,swell_direction,wind_direction,crowd_level,water_temp_c,notes)";

export async function getDestinations(): Promise<Destination[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/destinations?select=${SELECT}&status=eq.published&order=name`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 3600 },
      });
      if (res.ok) {
        const rows = (await res.json()) as Destination[];
        return rows.map((d) => ({
          ...d,
          destination_seasons: [...d.destination_seasons].sort((a, b) => a.month - b.month),
        }));
      }
    } catch {
      // fall through to the bundled snapshot
    }
  }
  return bundled;
}

export async function getDestination(slug: string): Promise<Destination | undefined> {
  return (await getDestinations()).find((d) => d.slug === slug);
}

/** Bundled images are named destination-<x>.jpg; fall back to the hero shot. */
export function imageFor(d: Destination): string {
  return d.hero_image ?? "/images/hero-surf.jpg";
}
