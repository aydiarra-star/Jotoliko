# Jotoliko — Wireframes et principes UX

## 1. Principes directeurs

Ces principes s'appliquent à toutes les interfaces. Ils découlent des contraintes
terrain, pas d'une préférence esthétique.

**Le livreur travaille debout, au soleil, d'une main.** Les cibles tactiles font au
minimum 48 px, les actions principales sont en bas de l'écran, jamais en haut.

**Une action, un écran.** Chaque écran livreur répond à une seule question. Le
livreur ne navigue pas, il avance.

**Le réseau ne doit jamais bloquer.** Aucun écran ne se bloque sur une requête.
L'état hors ligne est affiché en permanence, pas seulement en cas d'erreur.

**Le montant est toujours visible.** Sur les écrans de livraison et de caisse, le
montant en FCFA est l'information la plus grosse de l'écran.

**Le vocabulaire est celui du métier.** « Livraison », « caisse », « reverser ».
Jamais « entité », « enregistrement », « synchronisation ».

## 2. Console web — Dashboard

```
┌────────────────────────────────────────────────────────────────┐
│ Jotoliko          Commandes  Livreurs  Caisse  Rapports   [SM] │
├────────────────────────────────────────────────────────────────┤
│  Aujourd'hui — mardi 30 septembre                  [Jour ▾]    │
│                                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │   128    │ │   104    │ │   24     │ │  1 240 000 FCFA  │  │
│  │Commandes │ │ Livrées  │ │En tournée│ │  Encaissé        │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│                                                                │
│  ⚠  Caisse à reverser                          [Tout voir →]  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ Moussa Diallo      412 000 FCFA   attendu    [Valider] │   │
│  │ Fatou Ndiaye       298 500 FCFA   attendu    [Valider] │   │
│  │ Ibrahima Sow       176 000 FCFA   écart −2 000 [Voir]  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  Dernières commandes                                           │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ CMD-2418  Aminata Ba      Mermoz    12 500  ● En route │   │
│  │ CMD-2417  Boutique Awa    Plateau    8 000  ● Livrée   │   │
│  └────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**Décisions.** La caisse à reverser est placée au même niveau que les compteurs, pas
dans un onglet secondaire. Un écart est signalé en rouge avec le montant exact, et
la ligne « Tout voir » mène à la remise de caisse.

## 3. Console web — Détail commande

```
┌────────────────────────────────────────────────────────────────┐
│ ← CMD-2418                                    ● En route       │
├────────────────────────────────────────────────────────────────┤
│ Aminata Ba · 77 123 45 67          [Appeler]  [WhatsApp]      │
│ Mermoz, derrière la pharmacie, immeuble bleu                   │
│ Repère GPS · Zone Dakar Sud                                    │
├────────────────────────────────────────────────────────────────┤
│ Lignes                                                         │
│   2 × Thiéboudienne            5 000    10 000 FCFA            │
│   1 × Jus de bissap            1 500     1 500 FCFA            │
│                                Sous-total  11 500              │
│                                Livraison    1 000              │
│                                TOTAL       12 500 FCFA         │
│                                À encaisser 12 500 FCFA         │
├────────────────────────────────────────────────────────────────┤
│ Livreur : Moussa Diallo            [Réaffecter]                │
│ Preuve : 📷 photo · reçue par Aminata Ba                       │
├────────────────────────────────────────────────────────────────┤
│ Historique                                                     │
│   09:12  CONFIRMED  par Awa (bureau)                           │
│   09:20  ASSIGNED   par Awa → Moussa                           │
│   10:04  IN_TRANSIT par Moussa (terrain)                       │
└────────────────────────────────────────────────────────────────┘
```

**Décisions.** L'adresse affiche les trois niveaux (repère libre, GPS, zone). Les
boutons Appeler et WhatsApp sont côte à côte. L'historique distingue les actions
bureau et terrain.

## 4. Application livreur — Liste des missions

```
┌─────────────────────────┐
│  Bonjour Moussa         │
│  8 missions · 92 500 FCFA│
│  ● 2 en attente d'envoi │
├─────────────────────────┤
│ 1  Aminata Ba           │
│    Mermoz · 12 500 FCFA │
│    [Appeler] [GPS] [→]  │
├─────────────────────────┤
│ 2  Boutique Awa         │
│    Plateau · 8 000 FCFA │
│    [Appeler] [GPS] [→]  │
├─────────────────────────┤
│ 3  Pharmacie Mermoz     │
│    Sacré-Cœur · 15 000  │
│    [Appeler] [GPS] [→]  │
└─────────────────────────┘
```

**Décisions.** Le total à encaisser de la journée est visible dès l'ouverture. La
file d'attente hors ligne est affichée en permanence. Chaque mission a trois actions
directement accessibles, sans ouvrir de menu.

## 5. Application livreur — Clôture de mission

```
┌─────────────────────────┐
│  ← Aminata Ba           │
│  Mermoz · 77 123 45 67  │
│  [Appeler]      [GPS]   │
├─────────────────────────┤
│  À ENCAISSER            │
│    12 500 FCFA          │
├─────────────────────────┤
│  Montant reçu           │
│  ┌───────────────────┐  │
│  │ 12 500         │  │  │
│  └───────────────────┘  │
│  Mode : [Espèces ▾]     │
├─────────────────────────┤
│  Preuve                 │
│  ┌───────────────────┐  │
│  │   📷 Prendre      │  │
│  │      la photo     │  │
│  └───────────────────┘  │
│  Reçu par : [Aminata ]  │
├─────────────────────────┤
│  [ LIVRÉE ]             │
│  [ Échec ]              │
└─────────────────────────┘
```

**Décisions.** Le montant à encaisser est pré-rempli pour éviter la faute de frappe.
Si le montant saisi diffère, l'écart est affiché immédiatement et un motif est
demandé. La preuve est demandée avant la validation, pas après.

## 6. Application livreur — Remise de caisse

```
┌─────────────────────────┐
│  Ma caisse              │
├─────────────────────────┤
│  Encaissé aujourd'hui   │
│    92 500 FCFA          │
│  Missions : 8 dont 6 payées│
├─────────────────────────┤
│  Je reverse             │
│  ┌───────────────────┐  │
│  │ 92 500         │  │  │
│  └───────────────────┘  │
│  Écart : 0 FCFA ✓       │
├─────────────────────────┤
│  Note (optionnel)       │
│  ┌───────────────────┐  │
│  │                   │  │
│  └───────────────────┘  │
├─────────────────────────┤
│  [ DÉCLARER LA REMISE ] │
└─────────────────────────┘
```

**Décisions.** Le livreur déclare ce qu'il reverse. L'écart est calculé en direct
contre la caisse attendue. Un écart non nul reste possible mais doit être assumé,
ce qui est précisément le comportement recherché : rendre l'écart visible plutôt
que de le cacher.

## 7. Design system — application aux écrans

| Token | Usage |
| --- | --- |
| `#0F172A` bleu profond | Fonds de navigation, texte principal |
| `#2563EB` bleu électrique | Actions principales, liens, états actifs |
| `#10B981` vert succès | Livraisons réussies, caisse équilibrée |
| Rouge (à définir) | Écarts de caisse, échecs, retards |
| `#F8FAFC` gris | Fonds de page, séparateurs |
| Inter | Toutes les interfaces |
| Framer Motion | Transitions web, 150 à 250 ms |

L'application Flutter reprend ces tokens et évite les animations longues, coûteuses
sur les appareils d'entrée de gamme.

## 8. Prochaines étapes UX

1. Maquettes haute fidélité des six écrans ci-dessus.
2. Test des écrans livreur auprès de 5 livreurs réels, sur leurs propres téléphones.
3. Test du dashboard auprès de 2 responsables d'exploitation.
4. Mesure du temps de clôture de mission : cible sous 60 secondes.
