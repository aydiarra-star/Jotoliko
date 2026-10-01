import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <section className="shell grid min-h-[60vh] place-items-center py-24 text-center">
      <div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="mt-6 text-4xl font-semibold">Cette page a changé de tournée.</h1>
        <p className="mx-auto mt-4 max-w-md text-ink-500">
          La page que vous cherchez n&apos;existe pas ou a été déplacée. Revenons sur la bonne route.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="btn-primary">
            Retour à l&apos;accueil
          </Link>
          <Link href="/fonctionnalites" className="btn-ghost">
            Voir les fonctionnalités
          </Link>
        </div>
      </div>
    </section>
  );
}
