import "server-only";
import bundled from "../../../data/destinations.json";
import demoExtras from "../../../data/demo-destinations.json";

/**
 * Same source rule as the agent (agent/lib/glassy.ts): Glassy's Supabase when
 * SUPABASE_URL and SUPABASE_ANON_KEY are set, else the bundled snapshot.
 */
export type Destination = {
  slug: string;
  name: string;
  country: string;
  description: string | null;
  hero_image: string | null;
  lat: number;
  lon: number;
  surf_spots: {
    name: string;
    break_type: string | null;
    difficulty: string | null;
    best_season: string | null;
    wave_height_min: number | null;
    wave_height_max: number | null;
    description: string | null;
  }[];
  destination_seasons: {
    month: number;
    swell_height_min: number | null;
    swell_height_max: number | null;
    swell_direction: string | null;
    wind_direction: string | null;
    crowd_level: string | null;
    water_temp_c: number | null;
    notes: string | null;
  }[];
};

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
        return withDemoExtras(
          rows.map((d) => ({
            ...d,
            destination_seasons: [...d.destination_seasons].sort((a, b) => a.month - b.month),
          })),
        );
      }
    } catch {
      // fall through to the bundled snapshot
    }
  }
  return withDemoExtras(bundled as Destination[]);
}

/** Same rule as the agent: demo-only destinations (e.g. Rio) fill in what the database lacks. */
function withDemoExtras(destinations: Destination[]): Destination[] {
  const real = new Set(destinations.filter((d) => d.surf_spots.length > 0).map((d) => d.slug));
  const extras = (demoExtras as Destination[]).filter((d) => !real.has(d.slug));
  return [...destinations.filter((d) => !extras.some((e) => e.slug === d.slug)), ...extras];
}

export async function getDestination(slug: string): Promise<Destination | undefined> {
  return (await getDestinations()).find((d) => d.slug === slug);
}

/** Bundled images are named destination-<x>.jpg; fall back to the hero shot. */
export function imageFor(d: Destination): string {
  return d.hero_image ?? "/images/hero-surf.jpg";
}
