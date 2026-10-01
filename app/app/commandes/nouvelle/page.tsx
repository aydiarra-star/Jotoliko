"use client";

import { useRouter } from "next/navigation";
import { Carte, EnTetePage } from "@/components/app/partage/ui";
import { FormulaireCommande } from "@/components/app/commandes/formulaire-commande";
import { useMagasin } from "@/lib/magasin";
import { lienDetail } from "@/lib/use-parametre";

export default function NouvelleCommandePage() {
  const router = useRouter();
  const { etat, creerCommande } = useMagasin();

  return (
    <div className="space-y-6">
      <EnTetePage
        titre="Nouvelle commande"
        description="La commande est créée au statut « À préparer ». Vous pourrez ensuite créer sa livraison et l'affecter à un livreur."
      />
      <Carte>
        <FormulaireCommande
          clients={etat.monde.clients}
          libelleAction="Créer la commande"
          onValider={(v) => {
            const r = creerCommande(v);
            if (!r.ok) return r.raison;
            const creee = r.valeur.monde.commandes.at(-1);
            router.push(creee ? lienDetail("/app/commandes/detail", creee.id) : "/app/commandes");
            return null;
          }}
          onAnnuler={() => router.push("/app/commandes")}
        />
      </Carte>
    </div>
  );
}
