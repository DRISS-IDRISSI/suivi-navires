# Suivi des escales TC3

Application web de suivi de l'avancement des mouvements par navire, alimentée par deux rapports Excel reçus par e-mail :
- `REP_QUAY_CRANE_DELAYS` (.xls, **chaque heure**) : mouvements des 60 dernières minutes par grue, avec statut OK / LOW - ALERT / CHECK ASSIGN. (minimum 20 mouvements/heure). Table `hourly`.
- `REP_MM_END_SHIFT_ALL_WORKING_VESSELS` (.xlsx, **fin de chaque shift**, 3 par jour) : avancement par navire (cumulé, restant, GMPH, grues). Table `snapshots`.

Entre deux rapports de shift, l'application estime le restant de chaque navire = restant du dernier rapport de shift − mouvements horaires des grues de ce navire (affiché comme « estimation »).

```
Outlook -> Power Automate -> Edge Function Supabase -> base Supabase -> application (GitHub Pages)
```

Contenu du dossier :
- `index.html` : l'application (tableau de bord, alertes, historique, exports Excel et PDF, import manuel).
- `config.js` : URL et clé publique de votre projet Supabase.
- `supabase/schema.sql` : création des tables (`snapshots`, `hourly`) et des règles d'accès.
- `supabase/functions/ingest-report/index.ts` : fonction qui reconnaît le type de rapport (d'après son contenu) et l'enregistre.

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

Alternative retenue en production : la fonction `mailbox` lit la boîte Outlook elle-même (Microsoft Graph) toutes les 10 minutes et accepte les pièces jointes `REP_MM_END_SHIFT*.xlsx` et `REP_QUAY_CRANE_DELAYS*.xls(x)`. En secours, le bouton **Importer un rapport** de l'application accepte les deux types de fichiers.

## Règles métier

- Postes à 0 mouvement sur le shift : ignorés (tableaux, GMPH recalculé sur les postes actifs).
- Avancement = cumulé / (cumulé + restant).
- Fin estimée = restant / somme des GMPH des postes actifs.
- Alertes : navire à 0 restant encore en phase WORKING, GMPH sous le seuil, aucune progression depuis le rapport précédent.


## Version 4 : deux rubriques

- **Pilotage** (vue manager) : situation des quais par terminal (TCE : PT05, PT08, PT09, PT10, PT11 ; TC3PC : STS1 à STS4) avec poste, navire, portiques affectés et avancement ; avancement détaillé par navire (import, export plein/vide, transbordement, panneaux, hors gabarits, shifting, débarquement/réembarquement) ; rendement de chaque portique par shift (S1, S2, S3).
- **Analyse** : alertes, dernière heure par grue, estimations en direct, navires à clôturer, escales suivies, historique et courbes.
- Le **poste** n'est pas dans les rapports actuels : il se saisit dans l'application (clic sur la cellule). Exécuter `supabase/escale_meta.sql` une fois pour le partager entre utilisateurs.
- Les rubriques marquées « n/d » s'afficheront dès que les rapports les fourniront (voir le canevas Excel transmis à l'IT).

## v5 — rubrique « Conducteurs »

Nouvel onglet **Conducteurs** (réservé aux responsables) alimenté par le rapport `REP_LATESTSHIFTRTGSCECDRIVERMOVES…` reçu après chaque shift (~07 h 11, 15 h 11, 23 h 11) :
classement des conducteurs RTG et cavaliers (nom, matricule, engins, connexion, mouvements, déchargement/chargement, IN/OUT, parc, shifting), mouvements par heure connectée, points d'attention (rendement faible, shifting élevé, connectés sans mouvement, RTG absents du rapport horaire), synthèse par engin, export Excel (feuille « Conducteurs »).

Mise en service côté Supabase : exécuter `supabase/driver_shift.sql`, redéployer les fonctions `ingest-report` et `mailbox` (dossiers `supabase/functions/`). Seuils modifiables dans l'onglet (objectif RTG 15/h, cavaliers 10/h, alerte shifting 40 %).

## v5.1 — mise à jour horaire de l'avancement

Chaque rapport horaire reçu met à jour automatiquement, sur l'onglet Pilotage, les mouvements faits, le restant, le % d'avancement et l'heure de fin estimée de chaque navire : base = dernier rapport de shift (officiel) + mouvements des grues du navire dans les rapports horaires reçus depuis. C'est une estimation (indiquée sur la carte) ; au rapport de shift suivant (≈ 07 h, 15 h, 23 h) les chiffres sont recalés sur le rapport officiel. Si les grues d'un navire dépassent le restant connu (réaffectation), la mise à jour est suspendue et signalée. Les fenêtres horaires manquantes sont signalées.

## v6 — version téléphone

Sur un écran de téléphone (largeur ≤ 700 px) l'onglet Pilotage devient une application simplifiée : liste des escales (avancement, faits/restants, boutons Vue globale / Rendement / Portiques), puis écrans détaillés (import, export, transbordement, débarquement/réembarquement, hors gabarit, shifting, panneaux ; rendement des grues par shift ; mouvements par heure de chaque portique). Le menu ☰ donne accès à Actualiser, Conducteurs, Analyse, Version complète et Déconnexion. Le bouton « Vue mobile » de la version complète permet d'y revenir.

## v6.1 — deux terminaux indépendants

Le bouton **TC3 ⇄** en haut du téléphone (et le sélecteur TCE / TC3 / Tous sur ordinateur) bascule entre les deux terminaux :
- **TCE** : navires travaillant avec PT05, PT08, PT09, PT10, PT11 ; conducteurs CC (cavaliers, feuille « SC » du rapport conducteurs) ; pas de section RTG.
- **TC3** : navires travaillant avec STS1 à STS4 ; conducteurs RTG ; rapport horaire RTG.
Les navires sans portique connu (terminés, ex. RORO) apparaissent sous « Non rattachés à un terminal ». Le choix est mémorisé sur l'appareil. L'onglet Analyse reste global.

## v6.2 — vue par shift (téléphone) et rattachement des navires

- Un navire n'appartient plus qu'à **un seul terminal** : celui de ses portiques ayant le plus travaillé. Les navires **RORO / DTV** (et ceux sans portique connu) sont rattachés à **TCE**.
- Téléphone : le bouton central de chaque escale devient **Par shift** : choix de la date, cases S1 / S2 / S3, bouton Rechercher ; affiche import, export (plein/vide), débarquement/réembarquement, hors gabarit, shifting, panneaux et mouvements par portique pour les shifts cochés. Le shift en cours (sans rapport de fin de shift) est complété avec les rapports horaires.

## v7 — comptes utilisateurs

Rôles : **Administrateur** (gère les comptes), **Responsable** (voit tout, y compris les conducteurs, et importe), **Lecture** (consulte ; pas d'onglet Conducteurs, pas d'import). Chaque compte est rattaché à **TCE**, **TC3** ou aux deux.
Mise en service : exécuter `supabase/comptes_utilisateurs.sql` (après avoir remplacé l'e-mail administrateur), déployer la fonction `supabase/functions/admin-users`, désactiver l'inscription publique (Authentication > Sign In / Providers > « Allow new users to sign up » désactivé), puis publier l'application. Onglet **Comptes** (administrateur) : créer un compte avec mot de passe provisoire, changer rôle / terminaux, désactiver, réinitialiser le mot de passe, supprimer. Chaque utilisateur change son mot de passe via **Mon compte**.
Sécurité : lecture et import sont contrôlés côté base (RLS) ; les données conducteurs ne sont lisibles que par administrateurs et responsables. La restriction de terminal est une restriction d'affichage (les rapports des deux terminaux restent lisibles par tout compte actif).

## v7.1 — connexion par identifiant et mot de passe à changer à la première connexion

- Chaque utilisateur se connecte avec un **identifiant** (ex. `FELLAH`) et son mot de passe, plus avec une adresse e-mail. En interne, le compte Supabase est `identifiant@suivi-tc3.invalid` (adresse fictive : aucun e-mail n'est envoyé). Si Supabase refusait ce domaine, changer la constante `DOMAINE` dans la fonction `admin-users` et `IDOM` dans `index.html`.
- À la **première connexion** (et après chaque réinitialisation par l'administrateur), une fenêtre non fermable impose de choisir un mot de passe personnel (10 caractères minimum, lettres et chiffres). Le contrôle est fait par l'application (indicateur `doit_changer_mdp` dans `profiles`).
- L'administrateur initial est `d_fellahidrissi@marsamaroc.co.ma` (script SQL). Après sa première connexion avec cet e-mail : onglet **Comptes** > bouton **Identifiant** > `fellah`, puis se reconnecter avec FELLAH.
- Onglet Comptes : création par identifiant, bouton « Identifiant » pour renommer, mention « doit changer son mot de passe ».
