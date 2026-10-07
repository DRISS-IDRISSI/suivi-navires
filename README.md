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

## v7.2 — e-mail de contact et mots de passe simples

- Nouveau champ **Adresse e-mail** (facultatif, information seulement) à la création d'un compte, bouton « E-mail » pour la modifier ; script `supabase/ajout_email_contact.sql`.
- Mot de passe : **6 caractères minimum** (ex. `nabil123`), sans autre contrainte. Le changement à la première connexion reste obligatoire. Vérifier dans Supabase (Authentication > Sign In / Providers > Email) que « Minimum password length » est ≤ 6.

## v7.3 — message d'accès aux utilisateurs

Après la création d'un compte ou la réinitialisation d'un mot de passe, la fenêtre propose **Envoyer par e-mail** (ouvre la messagerie avec le message prêt, destinataire = adresse du compte) et **Copier le message**. Le message donne l'adresse, l'identifiant, le mot de passe provisoire, le mode d'emploi des versions téléphone / ordinateur, l'installation et le lien vers `guide-utilisateur.pdf` (guide de 2 pages hébergé avec l'application). L'application n'envoie pas elle-même d'e-mail : le message part de la messagerie de l'administrateur.

## v7.4 — envoi automatique des accès par e-mail (Brevo)

La fonction `admin-users` envoie, à la création d'un compte ou à la réinitialisation d'un mot de passe, le message d'accès (identifiant, mot de passe provisoire, mode d'emploi téléphone / ordinateur, installation, lien du guide) à l'adresse e-mail du compte, via l'API Brevo. Secrets à créer dans Supabase (Edge Functions > Secrets) : `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (expéditeur validé dans Brevo), éventuellement `BREVO_SENDER_NAME` et `APP_URL`. Sans ces secrets, tout fonctionne comme avant (envoi manuel). Case « Envoyer l'accès par e-mail » dans le formulaire de création.

## v7.5 — vue par shift : jour en cours sélectionnable

Le filtre « Par shift » (téléphone) limitait la date au jour du dernier rapport de shift reçu : le shift du jour (en cours) n'était pas sélectionnable. La date maximale est maintenant le jour en cours (heure du Maroc), et l'écran s'ouvre par défaut sur le shift en cours quand des rapports horaires sont disponibles. Le shift en cours est calculé avec les rapports horaires des grues (total des mouvements) ; le détail par rubrique (import, export, etc.) arrive avec le rapport de fin de shift.

## v7.6 — estimation en direct : cas du navire presque terminé

Le dépassement toléré entre les mouvements des grues (rapports horaires) et le restant du dernier rapport de shift passe de +10 à +10 ou +25 % du restant (le plus grand) : le shifting de fin d'escale ne suspend plus l'estimation à tort ; un navire dont le restant est épuisé s'affiche « Terminé (estimé) ». Quand l'estimation est suspendue, l'heure de fin n'est plus affichée (elle était calculée depuis le dernier rapport de shift et devenait fausse) : « À confirmer », et le message indique le nombre de mouvements des grues et les causes possibles (navire presque terminé, grues réaffectées, rapport de shift en attente).

## v7.7 — plus de « 100 % » estimé

Un avancement de 100 % (ou « Terminé ») n'est affiché que lorsque le rapport de shift confirme 0 restant. Quand les grues ont fait au moins le restant du dernier rapport, le navire passe en « Fin imminente » : 99,9 % maximum, restant estimé à 0, encadré orange expliquant que la fin est à confirmer au prochain rapport de shift. Le tableau détaillé indique l'heure du rapport de shift dans « Total rapport de shift (hh:mm) » et « fin à confirmer » sur la ligne de situation estimée.

## v7.8 — bibliothèques intégrées (plus de dépendance à un CDN)

Les quatre bibliothèques (Supabase, SheetJS, jsPDF, autoTable) sont maintenant dans le dossier `lib/` de l'application au lieu d'être chargées depuis cdnjs et jsDelivr. Cela évite que la page reste figée sur l'écran de démarrage quand un de ces sites est inaccessible (APK, réseau d'entreprise, connexion lente) et permet l'ouverture hors connexion. Si un fichier manque malgré tout, un message rouge « Chargement impossible » s'affiche. Pensez à pousser le dossier `lib/` avec le reste. Seule la police Google Fonts reste externe (affichage de secours si elle est bloquée).

## v7.9 — onglet Direction (petit tableau de bord)

Nouvel onglet **Direction**, visible par tous les profils (menu ☰ > Direction sur téléphone) : pour chaque portique du terminal choisi (TCE : PT05, PT08 à PT11 ; TC3 : STS1 à STS4) — statut (en opération si au moins un mouvement dans la dernière heure, à vérifier, à l'arrêt, inactif), navire servi, mouvements de la dernière heure, mouvements réalisés par shift S1 / S2 / S3 de la journée choisie (le shift en cours est complété avec les rapports horaires), rendement heure par heure sur les 12 dernières heures (vert ≥ objectif GMPH de 20, orange en dessous, rouge à zéro) et total du terminal par shift. Une bannière avertit si le dernier rapport horaire est ancien (> 100 min). Lien direct : `…/suivi-navires/#direction` (ajoutable à l'écran d'accueil ; l'application installée propose aussi le raccourci « Direction » par appui long sur l'icône).

## v7.10 — Écran Direction (fusion TC3 + TCE, bleu/blanc)
- L'écran **Direction** fusionne TC3 (STS1–STS4) et TCE (PT) sur une seule page, avec le même style bleu/blanc que l'accueil mobile.
- N'affiche **que les portiques en opération** (au moins 1 mouvement sur le dernier rapport horaire) : mouvements de la dernière heure, S1/S2/S3 de la journée choisie, barres horaires, total par terminal.
- Accès : menu ☰ → Direction (ou lien `#direction`). Retour : ☰ → Pilotage (escales).

## v7.11 — Vue mobile par défaut sur ordinateur
- L'application s'affiche désormais en **vue mobile** (colonne bleu/blanc centrée) aussi sur PC, pour Pilotage et Direction.
- Menu ☰ → « Version complète (tableaux détaillés) » pour passer à l'ancienne vue large ; bouton « Vue mobile » pour revenir. Le choix est mémorisé sur l'appareil.

## v7.12 — Poste affiché sur l'écran Direction
- Chaque portique en opération affiche le poste à quai du navire (ex. P83), tel que saisi dans l'application (clic sur le poste en vue complète sur ordinateur).

## v7.13 — Robustesse (écran figé)
- Service worker : si le réseau ne répond pas en 6 s, l'application s'ouvre depuis le cache au lieu de rester bloquée.
- Menu ☰ → « Recharger l'application (vider le cache) » : désinscrit le service worker, vide le cache et recharge la page.

## v7.14 — Vue mobile lisible en mode sombre
- Corrige le texte quasi invisible de la vue mobile / Direction quand le téléphone est en mode sombre : la vue mobile garde maintenant toujours son style clair bleu/blanc.

## v7.15 — Correction manuelle navire/poste d'un portique (écran Direction)
- Les rapports horaires ne contiennent pas le nom du navire : le navire d'un portique vient du dernier rapport de fin de shift. Si un portique change de navire en cours de shift, toucher sa carte (Direction) permet de saisir le navire et le poste (ex. MIMMI SCHULTE / P83).
- La correction est enregistrée dans la table escale_meta (clé CRANE:<portique>), visible de tous, et s'efface d'elle-même au prochain rapport de fin de shift. Champ vide = retour à l'information du rapport. Réservé aux Administrateurs et Responsables.
