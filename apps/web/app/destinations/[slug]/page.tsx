import { ArrowLeftIcon, MapPinIcon, SparklesIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getDestination, getDestinations, imageFor } from "@/lib/destinations";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const DIFFICULTY_STYLE: Record<string, string> = {
  beginner: "border-emerald-400/40 text-emerald-300",
  intermediate: "border-sky-400/40 text-sky-300",
  advanced: "border-amber-400/40 text-amber-300",
  expert: "border-rose-400/40 text-rose-300",
};

export async function generateStaticParams() {
  return (await getDestinations()).map((d) => ({ slug: d.slug }));
}

export default async function DestinationPage({ params }: { readonly params: Promise<{ readonly slug: string }> }) {
  const { slug } = await params;
  const d = await getDestination(slug);
  if (!d) notFound();

  const firstSpot = d.surf_spots[0]?.name ?? d.name;
  const beginnerSpot = d.surf_spots.find((s) => s.difficulty === "beginner")?.name;
  const prompts = [
    `How's the surf at ${firstSpot} right now?`,
    beginnerSpot
      ? `I'm a beginner. Is ${beginnerSpot} good this week?`
      : `I'm a beginner. Which ${d.name} spot should I surf this week?`,
    `Rent me a board and book a lesson in ${d.name}`,
    `When is the best month to surf ${d.name}?`,
  ];
  const ask = (q: string) => `/s?q=${encodeURIComponent(q)}`;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <section className="relative isolate">
        <Image alt={d.name} className="-z-10 object-cover opacity-50" fill priority src={imageFor(d)} />
        <div className="-z-10 absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background" />
        <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6">
          <Link className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground" href="/">
            <ArrowLeftIcon className="size-4" /> All destinations
          </Link>
          <h1 className="mt-6 font-[family-name:var(--font-heading)] font-bold text-4xl sm:text-5xl">{d.name}</h1>
          <p className="mt-2 flex items-center gap-1 text-muted-foreground">
            <MapPinIcon className="size-4" /> {d.country}
          </p>
          <p className="mt-4 max-w-2xl text-lg">{d.description}</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 sm:px-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-10">
          <section>
            <h2 className="mb-4 font-[family-name:var(--font-heading)] font-semibold text-2xl">Surf spots</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {d.surf_spots.map((s) => (
                <div className="rounded-xl border bg-card p-4" key={s.name}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{s.name}</h3>
                    {s.difficulty ? (
                      <span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${DIFFICULTY_STYLE[s.difficulty] ?? ""}`}>
                        {s.difficulty}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs capitalize">{s.break_type} break</p>
                  <p className="mt-2 text-muted-foreground text-sm">{s.description}</p>
                  <Link className="mt-3 inline-block text-primary text-sm hover:underline" href={ask(`How's the surf at ${s.name} right now?`)}>
                    Live conditions →
                  </Link>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-4 font-[family-name:var(--font-heading)] font-semibold text-2xl">Season by month</h2>
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-card text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Month</th>
                    <th className="px-3 py-2 font-medium">Swell (ft)</th>
                    <th className="px-3 py-2 font-medium">Swell dir</th>
                    <th className="px-3 py-2 font-medium">Wind</th>
                    <th className="px-3 py-2 font-medium">Crowds</th>
                    <th className="px-3 py-2 font-medium">Water °C</th>
                  </tr>
                </thead>
                <tbody>
                  {d.destination_seasons.map((m) => (
                    <tr className="border-t" key={m.month}>
                      <td className="px-3 py-2">{MONTHS[m.month - 1]}</td>
                      <td className="px-3 py-2">
                        {m.swell_height_min}–{m.swell_height_max}
                      </td>
                      <td className="px-3 py-2">{m.swell_direction}</td>
                      <td className="px-3 py-2">{m.wind_direction}</td>
                      <td className="px-3 py-2 capitalize">{m.crowd_level}</td>
                      <td className="px-3 py-2">{m.water_temp_c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-primary/40 bg-card p-5">
            <h2 className="flex items-center gap-2 font-[family-name:var(--font-heading)] font-semibold text-xl">
              <SparklesIcon className="size-5 text-primary" /> Ask Glassy
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Live forecast, the right spot for your level, and boards or lessons in {d.name}.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {prompts.map((p) => (
                <Link className="rounded-lg border bg-background px-3 py-2 text-sm hover:border-primary/60" href={ask(p)} key={p}>
                  {p}
                </Link>
              ))}
            </div>
            <form action="/s" className="mt-4 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                maxLength={300}
                name="q"
                placeholder={`Ask about ${d.name}…`}
                required
              />
              <button className="rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground text-sm" type="submit">
                Ask
              </button>
            </form>
            <p className="mt-3 text-muted-foreground text-xs">Rentals and bookings are demo data. Nothing is charged.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
