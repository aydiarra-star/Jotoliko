import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";

export default function SignupCancelledPage() {
  return (
    <main className="shell min-h-[70vh] py-16">
      <div className="card mx-auto max-w-xl p-6 sm:p-9">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-ink"><Clock3 className="h-6 w-6" /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Paiement interrompu</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          Le paiement n'a pas été confirmé sur cette page. Aucun espace opérationnel n'est activé sans confirmation serveur de PayDunya. Si vous souhaitez reprendre, utilisez le jeton de reprise conservé lors de votre inscription.
        </p>
        <Link href="/inscription" className="btn-primary mt-6 w-full"><ArrowLeft className="h-4 w-4" /> Revenir à l'inscription</Link>
      </div>
    </main>
  );
}
