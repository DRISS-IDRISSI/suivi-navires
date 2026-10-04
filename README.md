# Suivi des escales TC3

Application web de suivi de l'avancement des mouvements par navire, alimentée chaque heure par le rapport Excel `REP_MM_END_SHIFT_ALL_WORKING_VESSELS`.

```
Outlook -> Power Automate -> Edge Function Supabase -> base Supabase -> application (GitHub Pages)
```

Contenu du dossier :
- `index.html` : l'application (tableau de bord, alertes, historique, exports Excel et PDF, import manuel).
- `config.js` : URL et clé publique de votre projet Supabase.
- `supabase/schema.sql` : création de la table et des règles d'accès.
- `supabase/functions/ingest-report/index.ts` : fonction qui reçoit le rapport et l'enregistre.

## 1. Supabase : base et comptes (10 min)

1. Ouvrez votre projet Supabase, menu **SQL Editor**, collez le contenu de `supabase/schema.sql`, cliquez **Run**.
2. Menu **Authentication > Users > Add user** : créez un compte (e-mail + mot de passe) pour vous et chaque personne de l'équipe. Cochez *Auto confirm user*.
3. Menu **Authentication > Sign In / Providers** : désactivez *Allow new users to sign up*, pour que personne d'autre ne puisse créer de compte.
4. Menu **Project Settings > API** : copiez **Project URL** et la clé **anon public**, puis collez-les dans `config.js`.

## 2. Supabase : fonction de réception (10 min)

1. Menu **Edge Functions > Deploy a new function > Via Editor**. Nom : `ingest-report`.
2. Remplacez le code par celui de `supabase/functions/ingest-report/index.ts` et déployez.
3. Dans les réglages de cette fonction, désactivez **Verify JWT** (l'accès est protégé par la clé ci-dessous).
4. Menu **Edge Functions > Secrets** : ajoutez `INGEST_KEY` avec une longue valeur aléatoire (30 caractères ou plus). Gardez-la, elle sert à l'étape 4.

Test depuis un terminal (remplacez les valeurs) :

```
curl -X POST "https://VOTRE-PROJET.supabase.co/functions/v1/ingest-report" \
  -H "x-api-key: VOTRE_INGEST_KEY" -H "content-type: application/json" \
  -d "{\"contentBase64\":\"$(base64 -w0 rapport.xlsx)\"}"
```
Réponse attendue : `{"ok":true,"id":"202610041503","navires":4}`.

## 3. GitHub : publication (10 min)

1. Créez un dépôt, par exemple `suivi-navires`.
2. **Add file > Upload files** : déposez `index.html`, `config.js`, `README.md` et le dossier `supabase`. Validez (*Commit changes*).
3. **Settings > Pages** : Source = *Deploy from a branch*, branche `main`, dossier `/ (root)`. L'adresse apparaît après une minute.

Le dépôt peut rester public : `config.js` ne contient que la clé publique, et les données sont protégées par les règles d'accès de la table (lecture réservée aux comptes connectés). Ne déposez jamais la clé `service_role`.

## 4. Outlook : envoi automatique (Power Automate)

Créez un flux automatisé :
1. Déclencheur **Quand un nouvel e-mail arrive (V3)** : filtre sur l'expéditeur ou l'objet du rapport, option *Inclure les pièces jointes* = Oui.
2. **Appliquer à chaque** pièce jointe, avec une condition : le nom contient `REP_MM_END_SHIFT`.
3. Si oui, action **HTTP** :
   - Méthode : POST
   - URI : `https://VOTRE-PROJET.supabase.co/functions/v1/ingest-report`
   - En-têtes : `x-api-key` = votre INGEST_KEY, `content-type` = `application/json`
   - Corps : `{"contentBase64": "@{items('Appliquer_à_chaque')?['contentBytes']}"}`

Si Power Automate n'est pas disponible sur votre compte, importez le fichier à la main avec le bouton **Importer le rapport horaire** de l'application : le résultat est le même.

## Règles métier

- Postes à 0 mouvement sur le shift : ignorés (tableaux, GMPH recalculé sur les postes actifs).
- Avancement = cumulé / (cumulé + restant).
- Fin estimée = restant / somme des GMPH des postes actifs.
- Alertes : navire à 0 restant encore en phase WORKING, GMPH sous le seuil, aucune progression depuis le rapport précédent.
