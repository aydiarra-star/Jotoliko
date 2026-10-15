# Interface Jotoliko ↔ API — état et limites

## Ce qui a été ajouté

- `/espace/` est une nouvelle page statique qui consomme l'API NestJS depuis le navigateur.
- Connexion par `POST /auth/login` avec identifiant d'entreprise, e-mail et mot de passe.
- Lecture des missions par `GET /missions?take=50` avec jeton Bearer.
- Recherche locale, état GPS fourni par le serveur, montants attendus/encaissés/remis et présence de preuve.
- Le jeton est conservé dans `sessionStorage`, pas dans `localStorage`; le mot de passe n'est pas conservé.
- Le serveur reste l'autorité pour l'authentification, le rôle et le cloisonnement des entreprises.
- Le premier écran est volontairement en lecture seule : aucun encaissement, changement de statut, affectation ou purge n'est déclenché depuis cette interface.

## Configuration au moment de construire le site

Le frontend utilise `NEXT_PUBLIC_API_URL`, injecté à la construction car Next.js produit un export statique. Exemple local uniquement :

```bash
NEXT_PUBLIC_API_URL=https://api.staging.example.fr npm run build
```

Ne pas saisir d'identifiant, de mot de passe, de jeton ou de secret dans une variable `NEXT_PUBLIC_*` : sa valeur est publique dans le bundle. Seule l'adresse publique de l'API peut y figurer.

Sur l'API, configurer `CORS_ORIGIN` avec l'origine exacte du site (schéma + domaine, sans chemin), par exemple `https://staging.example.fr`. Il faut aussi que l'API soit joignable en HTTPS. Ne pas activer une origine générique `*`.

## Démonstration publique

- `/operations/` et `/suivi/1042/` restent des écrans de démonstration et doivent conserver leur bandeau.
- Les exemples de `lib/demo.ts` sont fictifs. Ne pas les convertir en données réelles ni retirer le bandeau pour faire croire à une connexion.
- Le suivi public par référence n'est pas raccordé : l'API actuelle exige une authentification et ne propose pas de jeton client à portée limitée. Il faut concevoir et auditer cette capacité séparément avant d'exposer des données de livraison à un client final.

## Test d'intégration à effectuer en staging

1. Construire le site avec l'URL HTTPS du backend de staging.
2. Vérifier les sondes `/health/live` et `/health/ready`.
3. Utiliser un compte de test déjà créé dans une entreprise de staging; aucun compte n'est créé par cette page.
4. Se connecter et vérifier que seules les missions de cette entreprise apparaissent.
5. Répéter avec un compte DRIVER et confirmer que le serveur limite les résultats à ses missions.
6. Vérifier erreur de mot de passe, session expirée, API indisponible, CORS incorrect et limitation de débit.
7. Confirmer que l'onglet fermé supprime la session et que le bouton déconnexion efface le jeton.
8. Tester sur téléphone et réseau faible.

## Critère de réussite

La CI de compilation valide le code mais ne prouve pas le raccordement réel. Cette intégration ne sera déclarée validée qu'après un test contre un backend de staging et une base de test isolée, avec les cas d'accès inter-entreprises vérifiés. Aucun staging ni compte de test externe n'est actuellement provisionné.
