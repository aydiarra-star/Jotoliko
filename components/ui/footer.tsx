import Link from "next/link";
import { footerNav, markets, site } from "@/lib/content";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-surface">
      <div className="shell grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="text-xl font-semibold tracking-tight text-ink">{site.name}</p>
          <p className="mt-1 text-sm font-medium text-brand">{site.slogan}</p>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-ink-500">
            {site.description}
          </p>
          <p className="mt-6 text-sm text-ink-500">
            <a href={`mailto:${site.contactEmail}`} className="hover:text-brand">
              {site.contactEmail}
            </a>
          </p>
        </div>

        {footerNav.map((group) => (
          <div key={group.title}>
            <p className="text-sm font-semibold text-ink">{group.title}</p>
            <ul className="mt-4 space-y-3">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-ink-500 hover:text-brand">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div>
          <p className="text-sm font-semibold text-ink">Présence</p>
          <ul className="mt-4 space-y-3">
            {markets.map((m) => (
              <li key={m} className="text-sm text-ink-500">
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="shell flex flex-col gap-3 py-6 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {site.name}. Tous droits réservés.
          </p>
          <p>Conçu en Afrique de l&apos;Ouest, pour l&apos;Afrique de l&apos;Ouest.</p>
        </div>
      </div>
    </footer>
  );
}
