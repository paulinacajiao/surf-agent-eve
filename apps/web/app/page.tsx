import { MapPinIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getDestinations, imageFor } from "@/lib/destinations";

export default async function HomePage() {
  const destinations = await getDestinations();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <section className="relative isolate overflow-hidden">
        <Image alt="" className="-z-10 object-cover opacity-40" fill priority src="/images/hero-surf.jpg" />
        <div className="-z-10 absolute inset-0 bg-gradient-to-b from-background/30 to-background" />
        <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
          <h1 className="max-w-2xl font-[family-name:var(--font-heading)] font-bold text-4xl tracking-tight sm:text-6xl">
            Find your wave, <span className="text-primary">then ask about today.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            Glassy&apos;s destinations, with a surf assistant that checks live conditions, matches spots to your level,
            and sorts out boards and lessons.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <h2 className="mb-6 font-[family-name:var(--font-heading)] font-semibold text-2xl">Destinations</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {destinations.map((d) => (
            <Link
              className="group overflow-hidden rounded-xl border bg-card transition hover:border-primary/60"
              href={`/destinations/${d.slug}`}
              key={d.slug}
            >
              <div className="relative aspect-[4/3]">
                <Image alt={d.name} className="object-cover transition group-hover:scale-105" fill sizes="(min-width: 1024px) 25vw, 50vw" src={imageFor(d)} />
              </div>
              <div className="p-4">
                <h3 className="font-[family-name:var(--font-heading)] font-semibold text-lg">{d.name}</h3>
                <p className="flex items-center gap-1 text-muted-foreground text-sm">
                  <MapPinIcon className="size-3.5" />
                  {d.country}
                </p>
                <p className="mt-2 line-clamp-2 text-muted-foreground text-sm">{d.description}</p>
                <p className="mt-3 text-primary text-xs">{d.surf_spots.length} spots</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <footer className="border-t py-8 text-center text-muted-foreground text-xs">
        Demo build of Glassy. Forecasts: Open-Meteo. Rentals and bookings are mock data.
      </footer>
    </div>
  );
}
