"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { nav, site } from "@/lib/content";
import { cn } from "@/lib/utils";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label={`${site.name} — accueil`}>
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-brand text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.9)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
          <path
            d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path d="M12 12v9M12 12 4 7.5M12 12l8-4.5" stroke="currentColor" strokeWidth="1.7" />
        </svg>
      </span>
      <span className={cn("text-lg font-semibold tracking-tight", light ? "text-white" : "text-ink")}>
        {site.name}
      </span>
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-colors duration-300",
        scrolled
          ? "border-slate-200/80 bg-white/85 backdrop-blur-xl"
          : "border-transparent bg-white/60 backdrop-blur-sm",
      )}
    >
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "text-brand" : "text-ink-700 hover:bg-slate-100 hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/contact" className="btn-ghost">
            Contact
          </Link>
          <Link href="/demo" className="btn-primary">
            Demander une démo
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          aria-expanded={open}
          className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-ink lg:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t border-slate-200 bg-white lg:hidden"
          >
            <div className="shell flex flex-col gap-1 py-4">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-3 text-base font-medium text-ink-700 hover:bg-slate-100"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-3 flex flex-col gap-2">
                <Link href="/contact" className="btn-ghost w-full">
                  Contact
                </Link>
                <Link href="/demo" className="btn-primary w-full">
                  Demander une démo
                </Link>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
