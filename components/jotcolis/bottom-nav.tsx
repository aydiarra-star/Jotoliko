"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Plane, PackagePlus, MapPin, User } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/trajets", label: "Trajets", icon: Plane },
  { href: "/envoyer", label: "Envoyer", icon: PackagePlus },
  { href: "/suivi", label: "Suivi", icon: MapPin },
  { href: "/profil", label: "Profil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex min-h-[44px] min-w-[56px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "text-orange-600"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${
                  active ? "text-orange-500" : "text-slate-400"
                }`}
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
