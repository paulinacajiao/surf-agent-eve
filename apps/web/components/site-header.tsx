import { MessageCircleIcon, WavesIcon } from "lucide-react";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link className="flex items-center gap-2" href="/">
          <WavesIcon className="size-7 text-primary" />
          <span className="font-[family-name:var(--font-heading)] font-bold text-xl">Glassy</span>
          <span className="rounded-full border border-accent/40 px-2 py-0.5 text-accent text-xs">agent demo</span>
        </Link>
        <Link
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:opacity-90"
          href="/s"
        >
          <MessageCircleIcon className="size-4" />
          Ask Glassy
        </Link>
      </div>
    </header>
  );
}
