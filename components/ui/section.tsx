import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionProps = {
  children: ReactNode;
  className?: string;
  id?: string;
};

export function Section({ children, className, id }: SectionProps) {
  return (
    <section id={id} className={cn("py-16 sm:py-24", className)}>
      <div className="shell">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
      <h2 className="mt-5 text-3xl font-semibold leading-tight sm:text-4xl">{title}</h2>
      {body ? <p className="mt-5 text-lg leading-relaxed text-ink-500">{body}</p> : null}
    </div>
  );
}

export function CTA({
  title,
  body,
  primary = { href: "/demo", label: "Demander une démo" },
  secondary = { href: "/tarifs", label: "Voir les tarifs" },
}: {
  title: string;
  body: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <Section>
      <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-14 text-white sm:px-14 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-success/20 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-300">{body}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href={primary.href} className="btn-primary">
              {primary.label}
            </Link>
            <Link
              href={secondary.href}
              className="btn border border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              {secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </Section>
  );
}
