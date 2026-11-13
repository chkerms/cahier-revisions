# Backlog de l'application

Évolutions demandées par le parent, cadrées sur le code de la version 1.4.0. À lire avant toute évolution de l'appli (voir CLAUDE.md, section 5).
Dépôt public : jamais le prénom de l'enfant ni le contenu d'une leçon dans ce fichier.

Ordre de réalisation : lot 1, puis lot 2, puis lot 3. Le lot 2 a besoin des profils du lot 1, le lot 3 se sert du journal du lot 2.
Chaque lot : `VERSION` (app.js) et `V` (sw.js) incrémentés, tests verts, essai sur la tablette.

Légende : **[DEMANDÉ]** demandé par le parent · **[PROPOSÉ]** proposition de Claude, non validée · **[À ARBITRER]** choix à faire par le parent avant de coder · **[ARBITRÉ]** choix fait par le parent, daté.

---

## Lot 1 : deux profils sur la même tablette [DEMANDÉ] · LIVRÉ en 1.5.0 (13/11/2026)

> Livré et testé en Chrome headless au format tablette (`tests/test_app.py`, section « Profils »). Reste à vérifier sur la vraie tablette : bandeau, bascule, retour au profil enfant après fermeture de l'appli par Android, statut « protégées » en bas de la Zone parent.
> Écart avec le cadrage : le profil actif est stocké dans `profil_actif` (pas d'objet `profils` en localStorage, la liste des profils est fixe dans `app.js`) ; le prénom et les futurs réglages par profil sont dans `reglages:<profil>`.

**Besoin.** Le parent teste l'appli sur l'appareil de l'enfant. Ses essais ne doivent pas toucher la progression de l'enfant.

**Constat dans le code (1.4.0).**
- Progression : `localStorage["prog:<id leçon>"]` (`ouvert`, `fini`, `best`, `demain`), aucune notion de profil.
- Réglages : `localStorage["reglages"]` global (`prenom`, `taille`).
- Remise à zéro : supprime toutes les clés `prog:`.
- Poésie tapée par le parent : `poeme:<leçon>:<bloc>`. C'est du contenu, pas de la progression.

**Solution.**
- Profils dans `localStorage["profils"]` : `{ actif: "enfant", liste: [{ id: "enfant", prenom: "", test: false }, { id: "test", prenom: "Parent", test: true }] }`.
- Clés préfixées par le profil : `prog:<profil>:<id leçon>`, et `reglages:<profil>` pour le prénom et le mode quiz (lot 3). La taille du texte et les poésies tapées restent communes à l'appareil.
- Migration au premier lancement de la nouvelle version : les clés `prog:<id>` deviennent `prog:enfant:<id>`, le prénom actuel passe au profil enfant. Elle ne tourne qu'une fois (drapeau `migration_profils`) et ne perd rien.
- Changement de profil **uniquement dans la Zone parent**, carte « Profil actif ».
- Profil test bien visible : bandeau « 🧪 Profil test » en haut de chaque écran, avec une couleur distincte.
- **[ARBITRÉ 13/11/2026]** Retour automatique au profil enfant à chaque lancement de l'appli, pour qu'un oubli du parent ne fasse pas réviser l'enfant sur le profil test. « Lancement » = chargement de la page, y compris quand Android relance l'appli sortie de la mémoire. « Recharger les leçons » ne change pas de profil.
- « Remettre la progression à zéro » ne vide que le profil actif. Le bouton dit lequel.
- Dans la foulée **[PROPOSÉ]** : appeler `navigator.storage.persist()` au démarrage. Sans cela, Chrome peut effacer les données du site quand l'appareil manque de place.

**Critères d'acceptation.**
- Une leçon faite sur le profil test ne change ni les étoiles, ni « à revoir », ni « nouvelle » sur le profil enfant, et inversement.
- Une tablette en 1.4.0 qui passe à la nouvelle version garde toute la progression de l'enfant.
- Le profil enfant ne permet jamais de passer au profil test sans la Zone parent.

**Tests.** `test_app.py` : migration depuis des clés 1.4.0 injectées, isolation des deux profils, bandeau présent ou absent selon le profil.

---

## Lot 2 : journal des révisions et export par email [DEMANDÉ] · LIVRÉ en 1.6.0 (13/11/2026)

> Livré et testé en Chrome headless (`tests/test_app.py`, sections « Journal » et « Bilan ») : séances, cartes, quiz, calculs, oral, étapes sautées, bilan par profil, téléchargement, période « depuis le dernier envoi », purge à 180 jours.
> Non testable en headless, à vérifier sur la tablette : le menu de partage Android (Gmail, appli Claude) et le bouton Email (`mailto:`).
> Écarts avec le cadrage :
> - store IndexedDB `seances` (une fiche par séance, réécrite à chaque événement) au lieu d'un store `journal` d'événements ;
> - une étape est « finie » dans le journal dès que son écran de résultat s'affiche, même si l'enfant change d'étape par la barre au lieu du bouton Suivant ;
> - une question de quiz ou un calcul quitté après une erreur est enregistré (« question quittée sans la bonne réponse », « calcul quitté en cours ») ;
> - durée d'une séance plafonnée à 30 minutes dans le total (appli restée ouverte) ;
> - l'adresse email est commune à l'appareil (`reglages.email`), la date du dernier envoi est par profil (`reglages:<profil>.dernier_envoi`) ;
> - le choix de période se fait par boutons dans la carte « Bilan des révisions » de la Zone parent.

**Besoin.** Le parent récupère ce que l'enfant a fait (et raté), l'envoie par email ou directement à Claude, pour que les prochaines leçons ciblent les difficultés.

**Constat dans le code (1.4.0).** Aucun détail n'est enregistré. Le quiz connaît le nombre d'essais, les calculs connaissent la saisie, mais tout disparaît en fin d'étape. Seuls `best` et `demain` survivent.

### 2a. Journal
- Stockage IndexedDB (base `cahier` existante, montée en version 2, nouveau store `journal`). Clé : profil + horodatage. Conservation glissante de 180 jours (environ 1 Mo par an d'usage quotidien).
- Une **séance** = ouverture d'une leçon (ou d'un quiz du lot 3) jusqu'au retour à l'accueil : début, fin, profil, leçon, étapes vues, étapes terminées, **étapes sautées** (arrivée sur une étape par la barre d'étapes sans avoir terminé les précédentes).
- Un **événement** par élément, avec l'`id` stable du schéma :
  - quiz : `id` de la question, nombre d'essais, mauvaises réponses choisies, indice affiché ;
  - cartes : `id`, nombre de « pas encore », envoyée à demain ;
  - calculs : `id` ou type de générateur, consigne, réponse attendue, saisies successives ;
  - récitation : niveau de masquage atteint ;
  - oral : `id`, points cochés et non cochés, « validé » ou « on revoit ».
- Le journal du profil test est tenu à part et n'est jamais exporté par défaut.

### 2b. Export
- Zone parent, carte « Bilan » : période **depuis le dernier envoi** (par défaut), 7 jours, 30 jours, tout. Profil exporté = profil enfant, sauf choix contraire.
- Un seul fichier `bilan-AAAA-MM-JJ.txt` :
  1. un résumé lisible par le parent **et par Claude** (exemple ci-dessous) ;
  2. à la fin, le détail brut en JSON entre deux marqueurs, pour un traitement ultérieur.
- Format `.txt` et non `.json` ni `.md` : Chrome n'accepte de partager qu'une liste fermée de types de fichiers, où figure `text/plain` mais pas `application/json`.

### 2c. Envoi
- Bouton principal « 📤 Envoyer le bilan » : `navigator.share({ files: [bilan.txt], title, text: résumé court })`. Android ouvre son menu de partage : Gmail (pièce jointe, objet prérempli), l'appli Claude, Drive, etc. Le destinataire se choisit dans Gmail : le partage ne permet pas de le préremplir.
- Repli si `navigator.canShare` refuse le fichier : bouton « ✉️ Email » en `mailto:` vers l'adresse enregistrée dans la Zone parent, avec le résumé dans le corps (tronqué à 1 500 caractères, sans pièce jointe), plus « ⬇️ Télécharger le fichier ».
- Après un envoi réussi, la date est mémorisée et sert de début à la période « depuis le dernier envoi ».
- Le bilan contient le prénom et les titres des leçons : il ne doit jamais être commité dans ce dépôt.

### Exemple de résumé (contenu fictif)

```
Bilan du cahier de révisions : du 10/11 au 16/11 (profil enfant)
5 séances, 38 minutes au total.

Étapes sautées : leçon lue 3 fois sur 5 (« Leçon 7 : le verbe », « Maths, leçon 4 : … »).

À retravailler
- Leçon 7 : le verbe · quiz q3 « Dans quelle phrase… » : 2 essais (choisi : « … »)
- Maths, leçon 4 · calculs table de 7 : 7 × 8 attendu 56, saisi 54 puis 56
- Leçon 7 : le verbe · cartes c2, c5 envoyées à demain

Acquis (premier coup)
- Leçon 5 : le nom · quiz 5/5 · oral validé

--- DONNÉES BRUTES (JSON) ---
{ ... }
--- FIN ---
```

**Critères d'acceptation.**
- Sur la tablette, « Envoyer le bilan » ouvre le menu de partage avec Gmail et la pièce jointe.
- Le résumé collé dans claude.ai permet à Claude de dire quelles questions et quels calculs ont posé problème, avec l'`id` de leçon pour republier une version ciblée.
- Le profil test n'apparaît jamais dans un bilan par défaut.

**Tests.** `test_app.py` : journal alimenté après une leçon jouée, bilan généré (repli téléchargement en headless), période « depuis le dernier envoi » respectée.

---

## Lot 3 : mode quiz, activable depuis la Zone parent [DEMANDÉ] · LIVRÉ en 1.7.0 (13/11/2026)

> Livré et testé en Chrome headless (`tests/test_quiz.py`, avec la leçon d'essai `tests/fixtures/essai_quiz_tables.json`) : désactivé par défaut, réglage par profil, réservoir « déjà ouvertes », tirage 2 par leçon et pondération x2, 7 + 3 en maths, images homonymes, styles de la leçon d'origine, « Revoir la leçon », bilan rangé par leçon d'origine.
> À vérifier sur la tablette : rendu des raccourcis et de l'écran de fin, lecture à voix haute des questions.
> Écarts avec le cadrage :
> - pas d'écran dédié : le quiz est une leçon assemblée (étapes Quiz puis Calculs), affichée par les écrans existants ;
> - quiz français : si le réservoir a moins de 10 questions, toutes sont posées (5 au minimum, sinon le raccourci est masqué) ; l'accueil annonce le nombre réel ;
> - quiz surprise : 7 questions + 3 calculs dès qu'une leçon de maths du réservoir a des générateurs ;
> - seuls les `generateurs` alimentent les calculs du quiz, pas les calculs fixes ;
> - `window.__cahier.tirer` et `window.__cahier.assemblerQuiz` sont exposés pour les tests.

**Besoin.** L'enfant préfère les quiz et saute les leçons qu'elle pense connaître. Le parent veut des quiz transverses (français, maths, mélange), qu'il active lui-même.

**Solution.**
- Zone parent, carte « Mode quiz » (réglage du profil actif) : désactivé par défaut ; cases « Quiz français », « Quiz maths », « Quiz surprise » (tout mélangé).
- Accueil : quand le mode est actif, une rangée de raccourcis « 🎯 Quiz français », « 🔢 Quiz maths », « 🎲 Quiz surprise », au-dessus des thèmes. Rien n'apparaît s'il est désactivé.
- Tirage : 10 questions (environ 5 minutes), au plus 2 par leçon pour varier. Les questions ratées dans les 30 derniers jours (journal du lot 2) ont 2 fois plus de chances de sortir.
- **[ARBITRÉ 13/11/2026]** Réservoir réglable par le parent dans la carte « Mode quiz » (par profil) : « Toutes les leçons publiées » (valeur par défaut) ou « Seulement les leçons déjà ouvertes ». Avec le second choix, une leçon compte comme ouverte dès que `ouvert` vaut `true` dans la progression du profil actif.
- **[ARBITRÉ 13/11/2026]** Quiz maths : 7 QCM et 3 calculs générés, tirés des `generateurs` des leçons du réservoir. Si le réservoir n'a aucun générateur, 10 QCM. Le quiz surprise suit la même règle pour sa part de maths.
- Mauvaise réponse : même indice qu'aujourd'hui (le bloc de la leçon d'origine).
- Écran de fin : score du premier coup, puis pour chaque question ratée un bouton « 📖 Revoir la leçon » qui ouvre la leçon d'origine sur l'étape Leçon. Le quiz sert de diagnostic, la leçon de remédiation : c'est la réponse au cours sauté.
- Le quiz transverse tient une séance dans le journal (`type: "quiz_transverse"`, matière, questions et leçons d'origine).

**Points techniques (refactoring).**
- `stepQuiz` lit les globales `D`, `BLOCS` et `IMG` d'une seule leçon. Il doit recevoir une liste `{ question, leçon }` et résoudre indice, blocs et images dans la leçon d'origine.
- Les `id` d'images (`img1`…) se répètent d'une leçon à l'autre : préfixer par l'`id` de leçon dans `IMG`.
- Le shell d'une leçon (barre d'étapes, titre) ne convient pas : écran dédié, avec le bouton maison et les étoiles.
- Une matière avec moins de 5 questions disponibles : raccourci masqué.

**Critères d'acceptation.**
- Mode désactivé : accueil identique à aujourd'hui.
- Mode activé sur le profil test seulement : l'accueil du profil enfant ne montre aucun quiz.
- Réservoir « déjà ouvertes » : une leçon jamais ouverte ne fournit aucune question ; le raccourci se masque s'il reste moins de 5 questions.
- Quiz maths : 7 questions à choix puis 3 calculs au pavé, ou 10 questions à choix sans générateur disponible.
- Une question avec dessin affiche le bon dessin, même si deux leçons ont une image `img1`.

**Tests.** `test_app.py` : raccourcis absents par défaut, présents après activation, quiz de 10 questions jouable, images correctes avec deux leçons d'exemple ayant le même `id` d'image, réservoir « déjà ouvertes » respecté, répartition 7 + 3 en maths.

---

## Idées non arbitrées [PROPOSÉ]

À ne pas coder sans accord du parent.

- **Séance du jour avec boîtes de Leitner** (J+1, J+3, J+7, J+15) : cartes et questions dues, toutes leçons confondues, en 5 à 10 minutes. Remplace le seul palier « demain » actuel, qui ne joue que si l'enfant rouvre la leçon.
- **Nouveaux exercices au doigt** : relier, remettre dans l'ordre, texte à trous par étiquettes, tri par nature de mot, ligne graduée, dictée par choix d'orthographe.
- **Ceintures de calcul** sur les générateurs existants (tables, compléments), pour rendre visible la progression des automatismes.
- **Leçon obligatoire à la première ouverture** (réglage parent) : l'étape Leçon doit être terminée avant d'accéder au quiz d'une leçon nouvelle.
