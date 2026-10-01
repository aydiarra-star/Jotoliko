import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/reveal";

export function PageHero({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-slate-200">
      <div aria-hidden className="absolute inset-0 -z-10 grid-lines opacity-60" />
      <div
        aria-hidden
        className="absolute -top-32 right-0 -z-10 h-80 w-80 rounded-full bg-brand/10 blur-3xl"
      />
      <div className="shell py-16 sm:py-20">
        <Reveal>
          <span className="eyebrow">{eyebrow}</span>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">{title}</h1>
        </Reveal>
        {body ? (
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-500">{body}</p>
          </Reveal>
        ) : null}
        {children ? (
          <Reveal delay={0.15}>
            <div className="mt-9">{children}</div>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}
