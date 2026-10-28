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

## v7.16 — Situation quotidienne des navires (fichier de 8 h)
- Import du fichier « Situation navires porte-conteneurs et prévisions » (bouton d'import en vue complète, ou ☰ → Prévisions → « Importer la situation »). Lecture par titres de colonnes. Table Supabase `situation` (SUPABASE_table_situation.sql) ; à défaut, gardée sur l'appareil.
- Clé de rapprochement : N° VISITE. Le poste vient du fichier (une saisie manuelle reste prioritaire). P70–P79 = TCE, P80–P89 = TC3.
- Nouvel écran ☰ → **Prévisions** : navires à quai (prévu, restant à 8 h, avancement), arrivées prévues par jour, appareillés.
- Pilotage : les navires « Appareillé » disparaissent de la liste ; les navires accostés absents du rapport de shift apparaissent avec l'avancement de la situation.
- Correction manuelle d'un portique (Direction) : le poste est proposé d'après la situation.

## v7.17 — Navire appareillé marqué à la main + garde-fous situation
- Écran Prévisions : bouton « Marquer appareillé » sur chaque navire à quai (Administrateurs/Responsables). Le navire disparaît de Pilotage et de la liste « À quai » jusqu'à la prochaine situation (clé DEP:<visite> dans escale_meta).
- Bandeau d'alerte si la situation affichée n'est pas celle du jour.
- Une situation plus ancienne ne remplace plus une situation plus récente gardée sur l'appareil.

## v7.18 — Statut « Navire terminé »
- Le statut « Navire terminé » de la situation est reconnu (comme « Appareillé ») : le navire disparaît de Pilotage et de « À quai », et apparaît dans « Terminés / appareillés ».

## v7.19 — Situation par e-mail (automatique) + statut exact affiché
- Fonctions Edge `ingest-report` v5 et `mailbox` v5 : un fichier dont le nom commence par « Situation » reçu sur la boîte est lu automatiquement et rangé dans la table `situation`.
- Les statuts inconnus du fichier (ex. « En rade ») sont affichés tels quels sur la ligne du navire dans « Arrivées prévues ».

## v7.20 — Objectif GMPH appliqué partout et mémorisé
- L'objectif (mouvements par heure et par portique, 20 par défaut) s'applique maintenant à tous les écrans : Direction, rendement par shift, vue Portiques, pastilles, historique horaire et alertes « grue sous l'objectif ». Avant, seuls le rendement par shift le prenait en compte ; les autres utilisaient le minimum du rapport (20).
- Il est enregistré (clé CFG:GT dans escale_meta) : partagé entre appareils et conservé au rechargement. Réglable depuis l'écran Direction ou le tableau « Rendement des portiques par shift » (Administrateurs et Responsables).

## v7.21 — Trois niveaux de couleur sur le rendement
- Vert : mouvements par heure ≥ objectif (24) ; orange : entre 20 et l'objectif ; rouge : moins de 20 (zéro compris). Appliqué à Direction, rendement par shift, vue Portiques, pastilles, historique horaire et alertes (« grue sous le seuil bas »).
- Le seuil rouge est de 20 (ou l'objectif s'il est inférieur à 20).

## v7.22 — Objectif par défaut = 24
- L'objectif GMPH vaut 24 par défaut (vert ≥ 24, orange 20–23, rouge < 20) sans réglage préalable. Modifiable depuis Direction (champ « Objectif ») ou le tableau de rendement par shift.

## v7.23 — Corrections manuelles gardées et partagées
- Les modifications de poste, d'affectation de portique (navire + poste), de navire appareillé et d'objectif GMPH sont d'abord mises en file d'attente sur l'appareil, puis envoyées à la table `escale_meta`. Tant qu'elles ne sont pas enregistrées sur le serveur, elles restent visibles après rafraîchissement et sont renvoyées automatiquement à chaque chargement.
- Si le serveur refuse l'écriture, le message exact de Supabase est affiché (au lieu de « enregistré sur cet appareil seulement »).
- Les anciennes sauvegardes locales (postes, cman, dep, gt) sont migrées automatiquement.
- À faire une fois : exécuter `SUPABASE_table_escale_meta.sql` dans Supabase > SQL Editor (ajoute les colonnes/droits manquants).

## v7.24 — Correction manuelle d'un portique appliquée à tout le navire
- L'affectation manuelle d'un portique (Direction) est maintenant prise en compte partout : la liste des portiques du navire (Pilotage > Portiques) ajoute le portique ajouté à la main et le retire de son ancien navire.
- Saisir « - » comme navire = portique sur aucun navire (le retire de la liste du navire du rapport).
- Le poste saisi est aussi enregistré pour le navire (visible dans Pilotage).
- Valable jusqu'au prochain rapport de fin de shift.

## v7.25 — Nouveau rapport horaire (navire exact par portique)
- Le nouveau fichier horaire `REP_CRANE_DELAYS_WITH_SQL` donne pour chaque portique le navire (VISIT_ID, VESSEL_NAME), les mouvements import/export et le minimum requis. Fonction Edge `ingest-report` v6 (lecture des deux formats) et `mailbox` v6 (nom de fichier accepté).
- Direction et Pilotage > Portiques utilisent ce navire (prioritaire sur le rapport de shift et sur les corrections manuelles plus anciennes). Le poste est repris de la situation du jour ou du poste saisi pour l'escale.
- Un portique sans navire dans le rapport (CHECK ASSIGN.) garde l'affectation du rapport de shift ; « - » en correction manuelle reste possible.

## v7.26 — Import manuel du nouveau rapport horaire
- L'import manuel (écran Prévisions > « Importer un fichier Excel », plusieurs fichiers possibles ; ou zone d'import de la version complète) lit aussi `REP_CRANE_DELAYS_WITH_SQL`. Sert à rattraper les heures manquantes si la boîte mail n'a pas pu les ingérer.

## v7.27 — Ligne de diagnostic
- Au bas de l'écran Direction : version de l'application, dernier rapport horaire en base (date/heure, ancien ou nouveau format, nombre de portiques avec navire) et dernier rapport de shift. Permet de vérifier d'un coup d'œil que la bonne version est chargée et que les rapports entrent.

## v7.66 — Par navire : une seule ligne par navire, avec terminal et escales
- Un navire (même nom) n'apparaît plus qu'une fois, même s'il a travaillé sur TC3 et TCE : ligne de total (mouvements, EVP, nombre d'escales), puis une ligne par terminal avec ses escales. L'export Excel suit (ligne « TOTAL » + une ligne par terminal).

## v7.65 — Mouvements avant le démarrage de Navis (ancien système de pointage)
- Nouveau fichier reconnu : classeur avec les feuilles « Import » et « Export » (colonnes DATE_HEURE_POINTAGE, TERMINAL, VAR, NAME, DIMENSION, VISIT, NUMERO…). Import par le même bouton de l'écran Trafic.
- Mêmes règles que N4 : jour de shift = heure − 7 h (la colonne DATE_TRAVAIL de l'ancien système, qui est le jour civil, n'est pas utilisée), EVP 20' = 1, 40' = 2, 45' = 2, vides inclus. Catégories import / export plein / vide ; pas de transbordement.
- Fusion par couverture avec les mois N4 déjà importés. L'historique des conteneurs (onglet Conteneur) reçoit aussi ces mouvements (date, navire ; sans position de parc).
- Codes compagnie : ceux du pointage (MSCMAR → MSC, ARKAS → ARKAS, COSMO → COSCO, EVERGRE → EVERGREEN ; les codes agent IMAGESA, MARMEDS, GLOBCA, GLOBEMA restent tels quels).
- Import : environ 30 s de lecture puis 330 000 lignes envoyées à n4_moves (par lots) ; à faire sur ordinateur.
- Navires regroupés par nom en v7.64.

## v7.64 — Trafic par navire : escales d'un même navire regroupées
- « Par navire » regroupe sur une seule ligne toutes les escales d'un même navire (même nom) pour un même terminal : total mouvements / EVP, nombre d'escales et liste des numéros d'escale. L'export Excel suit le même regroupement.

## v7.63 — Fichier N4 à plusieurs onglets (15 jours) + transbordement
- Un fichier N4 « MoveEvent » peut contenir plusieurs onglets de mouvements (par ex. 4 × 15 jours) : tous sont lus, les doublons entre onglets sont ignorés.
- L'onglet des escales (dernier onglet, « VesselVisitDetails… » ou « ESCALE ») est reconnu automatiquement et sert à afficher les noms de navires.
- Fusion par couverture : on peut importer les fichiers dans n'importe quel ordre ; une vacation S3 à cheval sur deux fichiers (ex. 30/09 23:00 → 01/10 07:00) est additionnée correctement.
- Nouvelle catégorie « Transbordement / transit » (Through + Transship), distincte des import / export.
- Sélecteur de période « Tous les mois importés » + tableau « Mois par mois ».
- Import long : environ 100 000 lignes envoyées à n4_moves (par lots de 1000) ; patienter jusqu'au message de fin.

## v7.62 — Position du conteneur mise en évidence
- Onglet Conteneur : bandeau bleu « POSITION » en gros caractères sous le numéro (dernière position de parc enregistrée, avec la date et le motif : après déchargement ou avant chargement).

## v7.61 — Positions de parc en langage habituel
- Onglet Conteneur : la position s'affiche sans le préfixe du TOS (`Y-TCC-BZ083B07` devient `BZ083B07`) ; l'emplacement sur le navire s'écrit baie-rang-niveau (ex. 10-02-82).

## v7.60 — Accès à l'onglet Conteneur depuis le téléphone
- Le menu ☰ du téléphone contient maintenant « Conteneur · recherche par numéro » (en v7.59, l'onglet n'existait que dans la barre d'onglets de la version complète).

## v7.59 — Onglet « Conteneur » (recherche par numéro)
- Nouvel onglet **Conteneur** (comptes responsable/administrateur) : taper la marque et le numéro (ex. `MSNU 1413349`) ou seulement une partie du numéro (4 caractères minimum). Affiche : taille, plein/vide, compagnie, terminal, date et navire du **déchargement (import)**, date et navire du **chargement (export)**, **emplacement** enregistré au moment du mouvement (bloc de parc, ou baie/rang/niveau sur le navire), et l'historique complet des mouvements navire (grue, de → vers).
- Données : chaque import d'un fichier « MoveEvent » (Trafic → Trafic réel (N4)) enregistre aussi les mouvements par conteneur dans la table `n4_moves` (script `SUPABASE_table_n4_moves.sql` à exécuter une fois). Clé (conteneur, heure, type) : réimporter le même fichier ne crée pas de doublon. Environ 44 000 lignes par mois (≈ 7 Mo) ; l'import dure plus longtemps (par paquets de 1 000 lignes).
- Limite : le fichier ne contient que les mouvements navire. La **position actuelle au parc** et les **dates d'entrée/sortie par la porte (gate)** n'y figurent pas : il faut un export N4 d'inventaire des conteneurs (Unit) pour les afficher.

## v7.58 — Trafic réel depuis le TOS Navis N4 + correction de l'âge des rapports horaires
- **Nouveau : Trafic → « Trafic réel (N4) »** (comptes responsable/administrateur). Import du fichier Excel « MoveEvent » (feuilles MOVE et ESCALE) avec le bouton d'import de l'onglet Trafic. Chaque ligne = un mouvement de conteneur de navire ; le fichier est agrégé (≈ 46 Ko par mois) et enregistré dans la table `monthly` (id `n4-AAAA-MM`).
- Vues : période (dernier jour, 7 derniers jours, mois, période libre), terminal (TCE / TC3 / les deux), shift (S1 07–15, S2 15–23, S3 23–07), EVP réels et mouvements, répartition import plein / export plein / import vide / export vide / transit, par terminal, par shift, **par compagnie maritime** (compagnie du conteneur, « Line Op »), par navire, jour par jour avec graphique, export Excel de la vue.
- Règles : EVP 20' = 1, 40' = 2, 45' = 2 (constante `N4_EVP45`) ; restow (UNIT_SHIFT_ON_CARRIER) et lignes « Exclude » ignorés ; le jour est celui du début du shift (le S3 appartient au jour où il commence) ; terminal N4 « TCR » = TCE (`N4_TERM`). Codes de compagnie → noms dans `N4_LINES` (les codes inconnus sont affichés tels quels).
- Réimport : un shift complet du nouveau fichier remplace l'ancien ; un shift partiel ne remplace jamais un shift plus complet ; un shift partiel de début de fichier sans donnée antérieure est écarté (ex. le S3 du 30/09 si le fichier commence le 1er à 00:01).
- Vérifié : les mouvements par grue et par navire du fichier N4 sont identiques à ceux du rapport de shift du 04/10 (07:00–15:00) et du rapport horaire du 13/10 (10:00–11:00).
- **Correction** : l'hypothèse UTC de la v7.57 était fausse (les heures du rapport horaire sont bien locales, vérifié avec N4). `HSQL_UTC` repasse à `false`. L'âge du rapport horaire est maintenant mesuré depuis sa **réception** (colonne `created_at` de la table `hourly`), plus depuis la fin de sa fenêtre ; l'écran Direction affiche « reçu il y a … ».

## v7.57 — (ANNULÉ en v7.58) Heure des rapports horaires
- Constat : un rapport horaire de 56 min s'affichait « il y a 1 h 56 ». Les heures WINDOW_START / WINDOW_END du fichier REP_CRANE_DELAYS_WITH_SQL sont en **UTC** (1 h de moins que Casablanca en octobre) ; elles étaient lues comme de l'heure locale.
- Correction à la lecture (aucune donnée à modifier en base) : ces rapports sont reconvertis en heure de Casablanca (fenêtre, heure d'âge, rapprochement avec les rapports de shift). Les rapports de l'ancien format (REP_QUAY_CRANE_DELAYS) ne sont pas touchés. Interrupteur `HSQL_UTC` dans index.html (mettre `false` si le SI passe le fichier en heure locale).
- Conséquence : les mouvements des grues sont rattachés à la bonne heure, donc l'estimation « rapport de shift + grues » peut changer légèrement (elle était décalée d'une heure).
- L'âge s'affiche en heures et minutes (« il y a 1 h 56 ») au lieu d'être arrondi.

## v7.56 — Contrôle des rapports à l'entrée + bandeau « flux de données »
- **Fonction `ingest-report` v13** (à coller dans Supabase, voir `CODE_FONCTION_ingest-report_v13_...txt`) : avant d'enregistrer un rapport de shift ou horaire, elle vérifie qu'il est possible. Rejet seulement pour l'impossible : date dans le futur de plus de 3 h, cumulé ou restant négatif, escale en double, cumul qui baisse de plus de 5 % (et 50) par rapport au rapport précédent, plus de 30 % des navires sans cumulé/restant lisible (colonnes décalées), fenêtre horaire absurde, grue à plus de 100 mouvements/heure. Le reste (total à manipuler qui change beaucoup, restant ≠ somme des catégories, rapport ancien…) est enregistré avec un avertissement.
- Un rapport rejeté n'est pas enregistré : réponse HTTP 200 avec `ok:false, rejected:true` (la boîte mail ne le réessaie pas en boucle) et une ligne est écrite dans la table `ingest_log` (script `SUPABASE_table_ingest_log.sql`, à exécuter avant ou après : sans la table, la fonction continue de travailler). Pour forcer un rapport : l'importer à la main dans l'application (confirmation demandée) ou ajouter `"force": true` au corps de la requête.
- **Application** : bandeau en haut des écrans Pilotage / Direction / Prévisions / Trafic quand le rapport horaire a plus de 90 min (critique à 3 h), le rapport de shift plus de 9 h 30 (critique à 13 h), la Situation plus de 30 h (critique à 54 h). Chaque alerte dit quoi faire. Les comptes responsable/administrateur voient aussi les rapports refusés des 48 dernières heures (le bandeau disparaît quand un rapport plus récent est arrivé).
- Quand aucun rapport (horaire ou shift) n'est arrivé depuis plus de 3 h, l'heure de fin estimée des navires est remplacée par « Données anciennes ».
- Import manuel : mêmes contrôles ; si le rapport est suspect, l'application demande confirmation avant de l'enregistrer.
- L'ancienne alerte « Rapport horaire en retard » (100 min) est remplacée par le bandeau.

## v7.55 — Détail par catégorie daté
- Vue globale d'un navire : un titre « Détail par catégorie · rapport de shift HH:MM » précède Import / Export plein / Export vide, avec le total des catégories (restant du rapport + écart Situation) et le nombre de mouvements faits par les grues depuis le rapport, qui ne peuvent pas être répartis par catégorie.

## v7.54 — Avancement corrigé avec le programme de la Situation
- Problème : le rapport de shift ne contient que les mouvements déjà instruits dans le TOS. Les export vides pas encore instruits en sont absents → « restant 0 » et ~99 % alors que le navire est loin d'être fini (ex. MSC ERMINIA III : 2 324 prévus, 1 325 faits au rapport).
- Correction : pour un navire **Accosté** en **WORKING**, l'application compare le total prévu du fichier Situation à (cumulé + restant du rapport). Si le total prévu est plus grand, l'écart est ajouté au restant (affiché en export vide, dans la limite du programme export vide). Le calcul repart toujours des valeurs d'origine du rapport (idempotent).
- La vue globale affiche une note « Total prévu d'après la Situation… » quand une correction est appliquée.
- Limites : la Situation est celle du dernier fichier reçu (08 h) ; le restow est compté dans le cumulé mais pas dans le programme (écart légèrement sous-estimé) ; si le navire dépasse le programme, la correction disparaît d'elle‑même.

## v7.53 — CIELO DI RABAT = MAERSK
- CIELO DI RABAT est imposé à MAERSK (le fichier Situation donne D'AMICO, l'armateur propriétaire). Priorité : choix manuel > compagnie imposée > situation > recherche Internet > nom du navire. Le consignataire reste celui de la situation (PACOCEAN).

## v7.52 — PDF : page « Trafic par compagnie maritime » + affichage téléphone
- Le PDF du classement a maintenant 2 pages : page 1 = classement des équipes (inchangée) ; page 2 = trafic par armateur et par consignataire du mois choisi (mouvements, part, boîtes, EVP estimé, rendement, navires), même total que page 1.
- Téléphone : le tableau du classement des équipes tient dans l'écran (plus de défilement à droite) ; le nombre de jours passe sous le nom de l'équipe ; la ligne « S3 DIMANCHE » indique « hors équipe » en dessous.

## v7.51 — Armateur / consignataire d'après le fichier « Situation »
- Le tableau « Trafic par compagnie maritime » prend l'armateur (et le consignataire) de chaque navire dans le fichier « Situation » (prévisions des navires). Choix « Armateur | Consignataire » au-dessus du tableau.
- Mémoire : à chaque situation reçue (e-mail ou import), l'application enregistre l'armateur et le consignataire des navires dans la table `monthly` (id `armateurs`, partagée). Les mois passés se complètent donc au fil des situations. Départ : les 32 navires de la situation du 08/10/2026.
- Ordre de priorité : choix manuel (« Classer les navires ») > situation > recherche Internet > nom du navire. Fautes de frappe du rapport de performance reconnues (EL BWINTER, AS PATRONIA, AC CONSTANTINA). Les navires MSC sont rattachés au consignataire MSC MAROC.
- Aucune fonction Edge à redéployer ; compte admin / responsable requis pour l'enregistrement.

## v7.50 — Compagnies : navires recherchés sur Internet
- CIELO DI RABAT passe de MSC à MAERSK (confirmé). Compagnie par défaut ajoutée pour 14 noms de navires (AS PETRONIA = Maersk, IONIKOS et CORELLI = Hapag-Lloyd, MONTPELLIER / AS CONSTANTINA / MIMMI SCHULTE = Cosco, PIRITA = CMA CGM, ELBWINTER = Unifeeder, ECO PONENTE = X-Press Feeders). Source : sites de suivi des navires ; un navire affrété peut changer de ligne, donc corrigeable avec « Classer les navires ».
- Restent « Non classé » : BILBAO TRADER, PAGE, ANDREA (sert plusieurs lignes), TOES.

## v7.49 — Trafic par compagnie maritime
- Écran Trafic > Performance d'exploitation : nouveau tableau « Trafic par compagnie maritime » (sélecteur de mois et de terminal TCE / TC3 / TCE+TC3) : mouvements, part %, boîtes, EVP estimé, rendement, nombre de navires et leurs noms. Total identique au classement des équipes.
- Le rapport de performance ne donne pas la compagnie : elle est déduite du nom du navire (MSC…, CIELO DI…, MAERSK…, HMM…, CONTSHIP / WEC = CMA CGM, X-PRESS…, noms en « … A » et TANGER / CASABLANCA = Arkas). Les autres sont « Non classé ».
- Bouton « Classer les navires par compagnie » (comptes avec droit de saisie) : choix de la compagnie navire par navire ; le choix est partagé (table escale_meta, clés `LINE:NOM DU NAVIRE`) et s'applique à tous les mois. Champ vide = retour à la compagnie déduite du nom.

## v7.48 — 3e shift du dimanche hors équipes
- Le 3e shift (23h–07h) de la journée du dimanche n'est attribué à aucune équipe : il apparaît sur une ligne séparée « S3 DIMANCHE (hors équipe) » (toujours en dernier) dans le classement des équipes TC3 / TCE, les équipes complètes, le classement des shifts, le détail par terminal, le PDF et le tableau « Détail par semaine » (colonne dédiée).
- Les totaux restent identiques (somme des lignes = total du mois). Le S3 « normal » et la colonne « Meilleur » de l'historique n'incluent plus ce S3 du dimanche.
- Hypothèse : « dimanche » = journée dont l'onglet du rapport est daté d'un dimanche.

## v7.47 — Détail par semaine et par shift
- Écran Trafic > Performance d'exploitation : nouveau tableau « Détail par semaine » par terminal (lignes = semaines du mois, colonnes = S1 / S2 / S3, chaque case = équipe de rotation + mouvements). Permet de vérifier d'où vient l'écart entre deux équipes : quel shift (le S3 de nuit produit moins) l'équipe a tenu, pendant quelles semaines.

## v7.46 — EVP dans le classement des équipes
- Colonne « EVP* » ajoutée aux classements des équipes (écran et PDF). Le rapport de performance ne donne pas les 20'/40' : l'EVP est **estimé** = boîtes de l'équipe × EVP par boîte du terminal le jour concerné, tiré du rapport « Trafic Quotidien » du même mois (TCE = colonne TCR, TC3). Sans rapport de trafic du mois, la colonne n'apparaît pas.

## v7.45 — Totaux du mois cohérents avec le classement des équipes
- Si la ligne TOTAL d'une journée du fichier ne reprend pas toutes les lignes navire (plage de somme incomplète), l'application recalcule le total du jour à partir des lignes navire. Les cartes « Mouvements TCE / TC3 », le tableau « Jour par jour » et le classement des équipes donnent ainsi le même total (septembre : 51 449 mouvements, que l'on importe le fichier d'origine ou le fichier corrigé).
- Fonction Edge `ingest-report` v12 (même règle). Ré-importer le rapport du mois après mise à jour.

## v7.44 — Correction de la lecture du rapport de performance (équipes)
- **Libellés de shift** : « 1eSh » (sans espace) n'était pas reconnu au TCE, donc une grande partie des mouvements du TCE n'était attribuée à aucun shift ni équipe (septembre : environ 4 800 mouvements) → jours et totaux TCE par équipe faux.
- **Lignes de total** mal libellées (« TOT3e » sans espace, nom de navire en colonne E) lues comme des lignes de navire → mouvements du TC3 comptés deux fois (septembre : environ 2 600 mouvements en trop).
- Contrôle sur septembre : les totaux de l'application égalent maintenant les lignes « TOTAL » de chaque journée du fichier. Deux écarts viennent du fichier lui-même : le 02/09 (TC3, S2) une ligne de 62 mouvements est hors de la ligne de total, et ses feuilles de semaine / « Planning des équipes » omettent les totaux mal libellés.
- Fonction Edge `ingest-report` v11 (même correction). **Il faut ré-importer le rapport de septembre (et octobre)** : les données déjà enregistrées gardent l'ancienne lecture.

## v7.43 — Jours d'activité des équipes
- Dans le classement des équipes, « (27/30 j) » = jours avec mouvements / jours du mois. Chaque équipe est de service tous les jours (shift de la semaine) ; l'écart vient des shifts où aucun navire n'était à quai.

## v7.42 — Surveillance de la réception automatique des e-mails
- La fonction Edge `mailbox` v8 écrit son état à chaque passage (ligne `MBX:STATUS` de `escale_meta`) : heure de la relève, erreur éventuelle, date du dernier mail reçu. Un mail illisible ne bloque plus les suivants.
- L'application (responsables/admin) affiche un bandeau orange sur l'écran Direction si la relève est arrêtée depuis plus de 20 minutes, si elle est en erreur (message exact) ou si aucun mail n'est arrivé depuis plus de 2 h 30. La ligne de diagnostic en bas indique aussi l'heure de la dernière relève.
- `SUPABASE_verifier_tache_mailbox.sql` : requêtes de contrôle (lecture seule) de la tâche planifiée `poll-mailbox`.
- Si la connexion Microsoft a expiré : relancer `mailbox?action=start` puis `action=finish` (connexion avec marsamaroc.CES@outlook.fr).

## v7.41 — PDF : classement des équipes uniquement
- Le PDF ne contient plus le tableau « Classement des shifts (créneaux) » : équipes TC3, TCE, équipes complètes, rotation, puis comparatif des mois précédents. Le classement des créneaux reste visible à l'écran.

## v7.40 — Choix du mois pour le classement et le PDF
- Écran Trafic, section « Performance d'exploitation » : une liste « Performance · mois » permet de choisir le mois (octobre, septembre…) ; le classement des équipes, celui des shifts et le PDF suivent ce mois. Le PDF est nommé `Classement_equipes_shifts_AAAA-MM.pdf`.
- Le comparatif « Mois précédents » ne liste que les mois antérieurs ou égaux au mois choisi.
- Le PDF indique la rotation de la dernière semaine du mois choisi.
- Le mois n'apparaît que si son rapport de performance (« Rapport Journalier de Performance Opérationnelle » du mois) a été reçu ou importé.

## v7.39 — PDF d'une seule page
- Le PDF à partager tient sur **une seule page A4** : classement des équipes TC3, TCE, équipes complètes (TC3 + TCE), rotation en cours et classement des shifts (S1/S2/S3, TCE + TC3). Titre ajusté à la largeur de la page.
- Le comparatif « Mois précédents – rendement par shift » est inclus en bas de la page. Les détails par terminal/créneau restent consultables à l'écran (écran Trafic).

## v7.38 — Rotation hebdomadaire et classement par équipe
- Les équipes (groupes) tournent chaque semaine : S1 → S3 → S2 → S1. Chaque journée du rapport de performance est attribuée à l'équipe de service ce jour-là.
- Rotation de départ (semaine du 12/10/2026) : S1 HADDAZI (TC3) + BAKKALI (TCE) ; S2 AZZAM + BAHOUS ; S3 HOUSSAM + EDDAOUDI. L'historique est calculé à rebours à partir de cette semaine.
- Écran Trafic : « Classement des équipes » par terminal (rendement, mouvements, boîtes, jours travaillés) + équipes complètes TC3+TCE, carte « Rotation des équipes » (semaine en cours et suivante). Le classement des créneaux S1/S2/S3 est conservé.
- Bouton « Modifier la rotation » (responsables/admin) : date de référence (lundi) + noms des 6 groupes ; enregistré en partage dans `escale_meta` (clé `CFG:ROT`), aucune nouvelle table.
- Le PDF à partager contient les classements par équipe, la rotation en cours et les classements par créneau.

## v7.37 — Classement mensuel des shifts + PDF à partager
- Écran Trafic (responsables), sous « Performance d'exploitation » : « Classement des shifts » du mois, du meilleur au moins bon rendement, avec les mouvements et les boîtes traitées (import + export). Suit le sélecteur TCE | TC3 | TCE+TC3 ; pour TCE+TC3, détail terminal × shift en plus. Mois en cours signalé « provisoire » ; en fin de mois, résultat définitif.
- Tableau « Mois précédents » (rendement S1 / S2 / S3 de chaque mois reçu et meilleur shift).
- Bouton « Partager le classement en PDF (3 shifts) » : PDF d'une à deux pages (tous terminaux, TCE, TC3, classement général, mois précédents) ; sur téléphone ouvre le partage (WhatsApp, e-mail…), sur ordinateur télécharge le fichier.
- Les shifts sont recalculés ligne par ligne : les totaux « TOT 1e/2e/3e » du fichier sont parfois mal étiquetés (ex. TC3 du 02/10).

## v7.36 — Rapport Trafic Quotidien : en-tête plus tolérant
- Le fichier de septembre n'avait pas la cellule « Jour » dans l'en-tête et était refusé. L'en-tête est maintenant reconnu par les colonnes IMPORT / EXPORT (P) / EXPORT (V) / GLOBAL (application et ingest-report v10).

## v7.35 — Bilan mensuel : mois en cours partiel
- Le fichier « Situation du Trafic Conteneur » arrêté en cours de mois (ex. au 12/10) est géré : le mois en cours est comparé aux mêmes jours de 2025, signalé « (au 12/10) », et le calcul « pour égaler 2025 » se fait sur les jours restants de l'année.
- Un fichier sans feuille « D.S » (délai de séjour) n'efface plus le délai de séjour déjà reçu (ingest-report v9).

## v7.34 — Trafic : chaque terminal séparément
- Le sélecteur TCE | TC3 | TCE+TC3 est maintenant en haut de l'écran Trafic et pilote tout : bilan mensuel ET suivi quotidien.
- Suivi quotidien par terminal : cumul EVP, graphique, tableau « jour par jour » avec ligne Cumul, mois reçus. 2026 = chiffres réels du terminal (colonnes TCR = TCE et TC3 du fichier).
- 2025 par terminal = ESTIMATION (le fichier quotidien ne donne 2025 que pour l'ensemble) : chaque jour reçoit la part du terminal dans le trafic du même mois de 2025, tirée du bilan mensuel. Sans bilan importé, l'application affiche l'ensemble et le signale.
- Le détail import / export plein / export vide reste global (le fichier ne le donne pas par terminal).

## v7.33 — Trafic réservé aux responsables
- La rubrique Trafic (comparaison avec 2025, bilan mensuel, performance d'exploitation) n'apparaît plus que pour les comptes Responsable et Administrateur. Les comptes Lecture ne la voient ni dans le menu ni dans les onglets.
- Protection côté base : relancer SUPABASE_table_monthly.sql pour que la table monthly refuse toute lecture aux comptes Lecture (sinon la rubrique est seulement masquée).

## v7.32 — Écran Trafic : tableaux dans l'ordre chronologique
- Les tableaux « Jour par jour » (trafic et performance) et « Détail mensuel » commencent maintenant par le premier jour / mois en haut et finissent par le plus récent en bas.
- Le tableau « Jour par jour (EVP global) » se termine par une ligne **Cumul** (2026, 2025, écart).

## v7.31 — Bilan mensuel du trafic (TCE / TC3 / TCE+TC3)
- Nouveau fichier reconnu : « Situation du Trafic Conteneur 2026/2025 » (feuilles Tableau de bord Trafic, TC3, T EST, D.S, Calc). Import par le bouton de l'écran Trafic, ou automatique par e-mail avec la fonction ingest-report v8.
- Écran Trafic : en haut, « Bilan 2026 contre 2025 » avec le sélecteur TCE | TC3 | TCE+TC3 : cumul EVP et écart, import / export plein / export vide, boîtes, graphique par mois, détail mensuel, comparaison par terminal, ce qu'il faut réaliser par mois pour égaler 2025, et délai de séjour (cumul). Le suivi quotidien reste en dessous.
- Le total TCE + TC3 est celui du fichier (TCE = feuille « T EST »).

## v7.30 — Sélecteur de terminal : TCE | TC3 | TCE+TC3
- Écran Direction : trois boutons en haut (TCE, TC3, TCE+TC3). Les portiques, totaux S1/S2/S3 et indicateurs suivent le choix. Par défaut : TCE+TC3 (comme avant). Le choix est mémorisé.
- Pilotage (téléphone) : mêmes trois boutons au-dessus de la liste des escales ; la pastille en haut fait défiler TC3 → TCE → TCE+TC3.
- Pilotage / Conducteurs (ordinateur) : le bouton « Tous » devient « TCE+TC3 ».
- Un compte limité à un seul terminal ne voit pas le sélecteur.
- Connexion : messages d'erreur précis (mot de passe incorrect, trop de tentatives, réseau).

## v7.29 — Session expirée (« JWT expired »)
- Si la lecture échoue parce que la session Supabase a expiré, l'application la renouvelle automatiquement et relit les données ; si le renouvellement est impossible, elle revient à l'écran de connexion (message « Session expirée »).
- Au retour sur l'application (téléphone sorti de veille), la session est renouvelée puis les données sont rechargées.

## v7.28 — Trafic et comparaison avec l'an dernier
- Nouvel écran **Trafic** (menu ☰ > « Trafic · comparaison 2025 ») : à partir du rapport « Suivi Trafic Quotidien » (EVP et boîtes, import / export plein / export vide, global TCE-TC3) il affiche le cumul du mois contre le même nombre de jours de 2025, l'écart en % et en EVP, la courbe cumulée et le tableau jour par jour. Le cumul de l'année s'affiche dès que plusieurs mois sont reçus.
- Partie **Performance d'exploitation** à partir du « Rapport Journalier de Performance Opérationnelle » (un onglet par jour) : mouvements et rendement portique par terminal, arrêts, rendement du jour (couleurs selon l'objectif GMPH), classement des navires du mois.
- Fonction Edge `ingest-report` v7 et `mailbox` v7 (noms de fichiers `Rapport_Trafic_Quotidien…` et `Rapport_Journalier_de_Performance…`). Table `monthly` : exécuter `SUPABASE_table_monthly.sql`.
- Import manuel possible depuis l'écran Trafic (un ou deux fichiers à la fois).
