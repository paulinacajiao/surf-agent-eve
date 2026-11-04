import bundledDestinations from "../../data/destinations.json" with { type: "json" };
import rentals from "../../data/rentals.json" with { type: "json" };

/**
 * Glassy's destination and spot data.
 *
 * DECISION: read live from Glassy's Supabase project when SUPABASE_URL and
 * SUPABASE_ANON_KEY are set (the tables are public-read under RLS, so the anon key
 * is enough and no service key is needed). Otherwise use the bundled snapshot in
 * data/destinations.json, so anyone can clone and run the demo with no database.
 */
export type SurfSpot = {
  name: string;
  break_type: string | null;
  difficulty: string | null;
  best_season: string | null;
  wave_height_min: number | null;
  wave_height_max: number | null;
  description: string | null;
};

export type Season = {
  month: number;
  swell_height_min: number | null;
  swell_height_max: number | null;
  swell_direction: string | null;
  wind_direction: string | null;
  crowd_level: string | null;
  water_temp_c: number | null;
  notes: string | null;
};

export type Destination = {
  slug: string;
  name: string;
  country: string;
  description: string | null;
  hero_image: string | null;
  lat: number;
  lon: number;
  surf_spots: SurfSpot[];
  destination_seasons: Season[];
};

const SELECT =
  "slug,name,country,description,hero_image,lat,lon," +
  "surf_spots(name,break_type,difficulty,best_season,wave_height_min,wave_height_max,description)," +
  "destination_seasons(month,swell_height_min,swell_height_max,swell_direction,wind_direction,crowd_level,water_temp_c,notes)";

export async function loadDestinations(): Promise<{ source: string; destinations: Destination[] }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/destinations?select=${SELECT}&status=eq.published`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const rows = (await res.json()) as Destination[];
        return { source: "glassy-supabase", destinations: rows.map(normalize) };
      }
      console.warn(`[glassy] Supabase returned ${res.status}; using bundled data`);
    } catch (err) {
      console.warn("[glassy] Supabase unreachable; using bundled data", err);
    }
  }
  return { source: "bundled-snapshot", destinations: bundledDestinations as Destination[] };
}

function normalize(d: Destination): Destination {
  return {
    ...d,
    lat: Number(d.lat),
    lon: Number(d.lon),
    destination_seasons: [...d.destination_seasons].sort((a, b) => a.month - b.month),
  };
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Match a destination by slug, name, country or one of its spot names. */
export function findDestination(destinations: Destination[], query: string): Destination | undefined {
  const q = norm(query);
  return (
    destinations.find((d) => d.slug === query) ??
    destinations.find((d) => norm(d.name) === q || q.includes(norm(d.name))) ??
    destinations.find((d) => d.surf_spots.some((s) => q.includes(norm(s.name)) || norm(s.name).includes(q))) ??
    destinations.find((d) => q.includes(norm(d.country)) || norm(d.country).includes(q))
  );
}

export type RentalShop = (typeof rentals.shops)[number];
export const RENTAL_SHOPS: RentalShop[] = rentals.shops;
