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

## Lot 4 : défi chrono en maths [DEMANDÉ 13/11/2026] · LIVRÉ en 1.8.0 (13/11/2026)

**Besoin.** Un jeu de calcul mental « le plus vite possible », sur le modèle d'un jeu en BASIC sur Thomson TO8 : réponse au pavé numérique, puis Entrée. Pour chaque notion de maths du cahier.

**Livré.**
- Bouton « ⏱️ Défi » à côté de chaque leçon de maths qui a des `generateurs` (sauf `multiplication_posee`, qui se fait sur la feuille) ou au moins 3 calculs fixes ; aussi sur l'écran de fin de la leçon. Le record du profil s'affiche sur le bouton.
- Partie : compte à rebours 3, 2, 1, puis 10 calculs tirés des générateurs (nouveaux nombres à chaque partie ; calculs fixes mélangés à défaut). Chrono à l'écran, pavé + grande touche « ↵ Entrée » ; un clavier physique ou un pavé numérique branché sur la tablette marche aussi (chiffres, virgule, effacement, Entrée).
- Bonne réponse : on enchaîne. Erreur : la bonne réponse s'affiche, +5 secondes. Le chrono ne compte que le temps de réponse (pas les écrans de correction).
- Fin : temps, justes sur 10, record par leçon et par profil (`prog:<profil>:<leçon>.defi`), « Rejouer », « Revoir la leçon » s'il y a eu des erreurs.
- Journal : séance `type: "defi"` (temps de chaque calcul) ; bilan : section « DÉFIS CHRONO » (parties, meilleur temps, erreurs), erreurs du défi dans « À retravailler ».
- Zone parent, carte « Mode quiz et défi chrono » : le défi est affiché par défaut et peut être masqué, par profil.
- Tests : `tests/test_defi.py` (même copie jetable que `test_quiz.py`).

**À vérifier sur la tablette.** Taille du pavé et de la touche Entrée au doigt, lisibilité du chrono.

---

## Lot 5 : problèmes guidés [DEMANDÉ 15/11/2026] · LIVRÉ en 1.9.0 (15/11/2026)

> Livré et testé :
> - `tests/test_generateurs.py` : 1 000 tirages par cas, limite 999 et 9 999. Recalcul indépendant de la réponse et de la valeur de chaque schéma. Un seul bon schéma ; aucun mauvais schéma qui donne la même réponse. Nombres de l'énoncé conformes au schéma et bornés. Rédaction vérifiée : espaces insécables, unités lues en toutes lettres.
> - `tests/test_problemes.py` : 3 gestes, aide qui s'efface et qui revient, journal, bilan, pas de défi. Copie avec `tests/fixtures/essai_problemes.json`.
> - Non-régression : `test_app`, `test_quiz` et `test_defi` restent verts.
>
> À vérifier sur la tablette : lisibilité des schémas au doigt, en portrait (3 côte à côte) et en paysage (2 + 1) ; lecture à voix haute des unités.
>
> Écarts avec le cadrage :
> - après 2 opérations fausses, la bonne s'affiche et le calcul s'ouvre, pour ne pas bloquer l'enfant ;
> - le résumé « problèmes x/y sans erreur (erreurs : schéma, opération, calcul) » est placé en tête de « À retravailler » dès qu'il y a une erreur ;
> - paramètres du schéma de leçon : `strategies`, `problemes` et `limite` (pas `max`, déjà borné à 200 pour `moitie`).

**Besoin.** Résoudre des problèmes est une priorité du programme 2025 du cycle 2, et l'appli n'en propose aucun. Le parent veut un exercice pédagogique sans être trop lourd. Il fournira ensuite le cahier d'exercices de problèmes de l'enfant : il fixera l'ordre des cas à travailler, pas la mécanique.

**Référence de classe.** La méthode de la classe tient en 4 temps : je comprends, je représente (schéma en barres), je calcule (j'écris l'opération), je réponds par une phrase avec l'unité. Les problèmes sont classés en 7 stratégies : 1 le tout ; 2 une partie d'un tout ; 3 un partage ; 4 une comparaison (plus grand, plus petit, écart) ; 5 « fois plus, fois moins » ; 6 les durées ; 7 le produit cartésien. Plus les problèmes à plusieurs étapes. Les schémas sont des barres : le tout en haut, les parties en dessous, le « ? » sur la case cherchée, une flèche pour l'écart.
Règle de CLAUDE.md : énoncés, contextes et schémas originaux. Aucun exemple du fichier n'est repris, même avec d'autres nombres.

**[ARBITRÉ 15/11/2026, délégué par le parent : « pédagogique sans être trop lourd »]**
- **Un seul écran par problème, pas quatre.** L'étape « comprendre » est incluse dans le choix du schéma : placer le « ? » au bon endroit, c'est savoir ce qu'on cherche. L'étape « répondre » devient la correction : la phrase réponse s'affiche et est lue à voix haute.
- **Trois gestes au doigt** :
  1. l'énoncé est lu à voix haute, l'enfant choisit le bon schéma parmi 3 (mêmes barres et mêmes nombres, le « ? » à des places différentes) ;
  2. l'enfant choisit l'opération : 4 grosses touches + − × ÷ ;
  3. le calcul s'écrit (« 47 − 19 = ? »), l'enfant tape le résultat au pavé, avec l'unité affichée à côté.
- **Aide qui s'efface.** Pour chaque cas, dans chaque profil : après 2 réussites de suite sans erreur, l'étape schéma est sautée (opération puis résultat seulement). Une erreur la fait revenir. Mémoire : `prob:<profil>` dans localStorage.
- **Erreurs, sans punition.**
  - Mauvais schéma : le bon schéma s'affiche, avec une phrase courte (« Tu cherches le tout : le ? est sur la grande barre. »).
  - Mauvaise opération : renvoi vers le schéma (« Regarde : tu cherches une partie. »).
  - Mauvais résultat : même comportement que les calculs actuels.
- **Pièges voulus.** Chaque tirage peut proposer un cas où le mot de l'énoncé trompe : « de plus » qui mène à une soustraction (on cherche la plus petite quantité), ou un ajout qui mène à une soustraction (ce qu'il y avait avant). Le schéma sert précisément à éviter de deviner l'opération d'après les mots.

**Périmètre du lot 5 : stratégies 1 à 5, une étape, 12 cas.**

| Stratégie | Cas | Opération |
|---|---|---|
| 1 | parts différentes · parts identiques | + · × |
| 2 | ce qui manque · ce qui reste après une perte · avant un ajout | − |
| 3 | valeur d'une part · nombre de parts | ÷ |
| 4 | plus grande quantité · plus petite · écart | + · − · − |
| 5 | fois plus · fois moins | × · ÷ |

Plus tard, chacune dans son propre lot : stratégie 6 (demi-droite du temps, réutilise `heure` et `conversion`), stratégie 7 (tableau et arbre), problèmes à deux étapes avec une question intermédiaire.

**Technique.**
- **Générateur** `probleme` dans `generateurs.js`, avec ces paramètres :
  - `strategies` (liste 1 à 5) ou `cas` (liste des 12 identifiants) ;
  - `max` pour + et − (défaut 999, jusqu'à 9 999) ;
  - `tables` pour × et ÷ : un facteur dans la table, l'autre jusqu'à 12 ou un nombre de dizaines ; division toujours exacte.
- **Contextes** : banque originale de situations, chacune avec un objet, une unité (€, kg, cm, m, ans, billes…) et un prénom. La vraisemblance est contrôlée : un âge ne dépasse pas 100.
- **Objet rendu** : en plus de `consigne` et `expression`, le générateur renvoie le cas, l'opération attendue, les 3 schémas SVG (dont l'indice du bon), l'unité et la phrase réponse.
- **Affichage** : l'étape Calculs reconnaît un calcul de type problème et l'affiche avec les 3 gestes. Les autres calculs ne changent pas.
- **Défi chrono** : il exclut `probleme`, comme `multiplication_posee`.
- **Mode quiz** : il peut tirer des problèmes dans sa part de calculs maths.
- **Journal** : pour chaque problème, il enregistre le cas, le schéma choisi, l'opération choisie, les saisies et l'aide affichée ou non.
- **Bilan** : il classe les erreurs par nature : compréhension (schéma), choix de l'opération, calcul.
- **Leçon associée**, publiée à la livraison via la skill, thème `problemes` : la méthode en 4 temps, des cartes mémo (« Je cherche le tout, les parts sont identiques → × »…), un quiz, et des calculs générés `probleme`.

**Critères d'acceptation.**
- Le validateur et `test_generateurs.py` recalculent chaque problème tiré : expression juste, bon schéma unique, nombres dans les bornes, aucun résultat négatif ou non entier.
- Sur la tablette, un problème se fait en moins d'une minute, au doigt, sans clavier.
- Après 2 réussites d'un cas, le schéma n'est plus demandé ; après une erreur, il revient.
- Le bilan distingue les erreurs de schéma, d'opération et de calcul.

**Tests.** `test_generateurs.py` (1 000 tirages par cas), `test_app.py` ou un nouveau `tests/test_problemes.py` (3 gestes, aide qui s'efface, journal).

---

## Lot 6 : rubrique Problèmes, deux étapes, personnalisation [DEMANDÉ 15/11/2026] · LIVRÉ en 1.10.0 (15/11/2026)

**Besoin.** Le parent a fourni des exemples de problèmes du cahier de l'enfant (réunion de 3 quantités, groupes égaux, ce qui manque, périmètre d'un carré, aller-retour pour 2 personnes, budget avec plusieurs dépenses, récolte puis utilisation, grand partage). Il veut des problèmes générés au hasard, variés, accessibles par une seule rubrique, personnalisés avec la vie de l'enfant (maîtresse, copines, doudou, piscine), avec des petites blagues. Représentation de la classe : schéma en barres. Aucun exemple du cahier n'est repris : contextes et nombres originaux.

**Livré.**
- **Rubrique « 💡 Problèmes » sur l'accueil** : 5 problèmes par séance, un cas par stratégie tirée au hasard, plus 1 ou 2 problèmes à deux étapes. « Recommencer » tire de nouveaux cas. Pas de progression de leçon ; journal de type `problemes`, bilan sous `[problemes]`.
- **Nouveaux cas** (19 au total) : `s1_trois` (3 parties, schéma à 3 cases ; mauvais schémas : une partie oubliée, l'écart), `s1_perimetre` (tour d'un carré, 4 × côté ; mauvais schémas : 2 côtés, 4 + côté), grands partages dans `s3_part` (diviseur 2, 4, 5 ou 10, quotient multiple de 5), et 5 cas à deux étapes : `e2_gagne_donne` (a + b − c), `e2_depenses` (B − (a + b)), `e2_groupes_fois` ((x × y) × z, dont l'aller-retour à deux), `e2_groupes_plus` (n × k + e), `e2_total_partage` ((a + b) ÷ k, dans les tables). 4 contextes ou plus par cas.
- **Deux étapes** : pas d'étape schéma ; « D'abord… » (question intermédiaire), opération, calcul ; puis « Ensuite… » ; l'étape faite reste affichée (« ✓ 281 + 161 = 442 g »). Après 3 essais, le résultat intermédiaire est donné et on continue.
- **Personnalisation chiffrée** `lecons/perso.json` (`outils/perso.py`), déclarée dans `index.json` (clé `perso`) : prénoms de l'enfant et des copains (genre pour les accords), maîtresse, doudou, parents. Sans elle : prénoms génériques, et le prénom du profil enfant. Élisions automatiques (« d'Inès », « qu'elle ») ; corrige au passage « que elle » dans un contexte existant.
- **Blagues** facultatives par contexte, affichées et lues après la phrase réponse.
- **Zone parent, carte « Problèmes »** : rubrique affichée ou masquée, nombres jusqu'à 1 000 ou 10 000 (défaut), état de la personnalisation.
- Unités g et dm lues en toutes lettres.

**Tests.** `test_generateurs.py` : 1 000 tirages par cas, avec et sans personnalisation, limites 999 et 9 999 (76 000 problèmes) ; étapes recalculées et chaînées, divisions exactes, élisions, personnalisation absente quand elle n'est pas chargée. `test_rubrique_problemes.py` : 6 séances jouées, deux étapes, 4 opérations, personnalisation utilisée, bilan, réglages. Non-régression : `test_app`, `test_quiz`, `test_defi`, `test_problemes` verts.

**À vérifier sur la tablette.** Lisibilité des schémas à 3 cases ; lecture à voix haute des questions « D'abord / Ensuite ».

**Complément 1.10.1 (15/11/2026), après le questionnaire du parent.**
- Personnalisation publiée (`lecons/perso.json`, chiffrée) : enfant, 5 copains, maîtresse, doudou, parents, famille, 18 énoncés personnels (activités, repas, vacances, doudous), avec blagues.
- Nouveaux champs : `famille` (tirée 4 fois sur 10 à la place d'un parent) et `problemes` (énoncés personnels à trous, vérifiés par `outils/perso.py` avant chiffrement ; plage `e` ajoutée au cas `e2_groupes_plus`).
- **[ARBITRÉ 15/11/2026]** Rubrique : nombres jusqu'à 1 000 et pas de division par défaut (« pas plus de 1 000 pour le moment, pas encore de division ») ; la Zone parent permet de passer à 10 000 et d'activer les partages.
- Non retenu : un doudou tiré d'un personnage de dessin animé connu (règle des personnages connus), le nom de la boîte à histoires (marque).

## Lot 7 : suite des problèmes (grands nombres, centimes, oui ou non, fraction qui reste) [DEMANDÉ 15/11/2026] · LIVRÉ en 1.11.0 (15/11/2026)

**Besoin.** Nouvelle série d'exemples du cahier de l'enfant : reste avec de grands nombres, seuil avec réponse oui / non, fraction qui reste, grand partage, prix en deux étapes, multiplication d'un nombre à 2 chiffres, groupements, partie manquante parmi trois, complément avec de grands nombres, prix avec centimes, fois plus avec un grand nombre. Deux exemples reportés par le parent (« on verra plus tard »). Aucun énoncé repris : contextes et nombres originaux.

**Livré.**
- **Nouveaux cas** (23 au total) : `s2_trois` (t − a − b, schéma à 3 cases dont une inconnue), `s4_moins` (« de moins », comparaison directe), `e2_seuil` (total en une addition, puis « Est-ce assez ? / Peut-on tout porter ? » : boutons 👍 Oui / 👎 Non, un seul essai, la phrase réponse compare les deux nombres), `s2_fraction` (6/6 − 3/6 : « Quelle fraction reste-t-il ? », réponse en nombre de parts, sans schéma).
- **Grands nombres** (quand la limite est 10 000) : nouveaux contextes camion, billets de train, train en km, club de foot, gros camion, places de cinéma ; grands partages (436 ÷ 2) ; groupements plus grands dans `s3_nombre`.
- **Prix avec centimes** : contextes marqués `centimes` dans `s1_parties`, `s2_perte`, `s4_grande`, `s4_moins`, `s5_fois_plus` ; montants multiples de 5 centimes, 1 € au moins ; schémas étiquetés « 19,95 » ; touche « , » sur le pavé ; lecture « 19 euros 95 ».
- **Zone parent, carte « Problèmes »** : options « Prix avec des centimes » et « Fraction qui reste », désactivées par défaut (arbitrage du 15/11 : pas plus de 1 000, pas de division pour le moment).
- **Rubrique** : un cas qui a un énoncé personnel est tiré une fois sur deux dans sa stratégie (avec 23 cas, les énoncés personnels devenaient rares).
- Pas d'énoncé personnel pour `e2_seuil` et `s2_fraction` (`outils/perso.py` le refuse).

**Tests.** `test_generateurs.py` : 84 000 problèmes (un sur deux en mode centimes), réponses décimales recalculées, seuils (bonne réponse oui / non, total ≠ seuil), fractions (r = d − a). `test_rubrique_problemes.py` : réponses avec virgule, fractions, oui / non, options activées. `test_problemes.py` : calcul à trois nombres. Non-régression verte.

**À vérifier sur la tablette.** Lecture à voix haute des prix et des fractions ; taille des boutons Oui / Non.

---

## Lot 8 : rubrique « Questionner l'espace » [DEMANDÉ 15/11/2026] · LIVRÉ en 1.12.0 (15/11/2026)

**Besoin.** Ajouter de la géographie et les astres, en lien avec le programme de CE2 (Questionner l'espace et le temps, programme de 2020 encore en vigueur en CE2 en 2026-2027) : la Terre et les astres avec des animations ; continents et océans ; grandes villes françaises ; lieux familiers de l'enfant à placer sur une carte.

**Livré.**
- **Accueil** : rubrique « Questionner l'espace » (matière `questionner_le_monde`), thèmes `astres` (☀️ La Terre et les astres), `monde` (🌍 Continents et océans), `lieux` (📍 Villes et lieux). Les thèmes peuvent porter une rubrique : le titre de section vient de la rubrique, sinon de la matière. Zone parent, carte « Programme » : la rubrique est listée.
- **Bloc `animation`**, dessiné par l'appli (SVG + `requestAnimationFrame`, bouton pause, arrêt quand l'écran change, à l'arrêt si l'appareil demande moins d'animations) : `systeme_solaire` (8 planètes nommées, la Lune autour de la Terre), `jour_nuit` (Terre vue du pôle Nord, point rouge = l'enfant, heure qui défile, jour ou nuit), `annee` (tour du Soleil, mois et jour sur 365), `lune` (Lune éclairée par le Soleil, encart « depuis la Terre, je vois », phases). Pas à l'échelle.
- **Fonds de carte** `cartes.js` (133 Ko, en cache hors ligne), générés par `outils/cartes_build.py` : planisphère en projection Natural Earth (continents, avec Amérique du Nord et du Sud séparables ; océans découpés par des limites conventionnelles simplifiées) et France métropolitaine (régions, pays voisins, mers, projection pour placer une ville par latitude et longitude).
- **Fond local** : `outils/fond_local.py` fabrique un SVG (départements, pays voisin, une zone par commune) à mettre dans la leçon chiffrée ; il refuse d'écrire dans le dépôt. L'appli nettoie le SVG avant de l'insérer (scripts, liens, attributs `on…`).
- **Bloc `carte`** : repères coloriés et nommés, étiquettes gardées dans le cadre, rose des vents en option.
- **Étape « 🗺️ Sur la carte »** (`carte`) : « Touche sur la carte : … » (zone, ou point avec une tolérance au doigt), puis « Quel est ce continent / cet océan / ce lieu ? » (3 boutons, lieu qui clignote, aucune étiquette). Erreur : le lieu touché est nommé (« Non, ça, c'est l'Asie ») ; au 3e essai raté, le bon lieu est montré. Étoile au premier coup, étiquette gagnée qui reste sur la carte, phrase `info` facultative.
- **Journal** : événement `geo` (lieu, mode, erreurs, lieux confondus, résolu) ; **bilan** : « carte g2 « Asie » (le toucher) : raté du premier coup… (confondu avec : …) », et « carte x/y du premier coup ».
- Schéma (`b_animation`, `b_carte`, `lieu`, `fond`, objet `carte`), validateur (zones connues, ville dans le cadre, zone présente dans le SVG, noms distincts, durée 10 s par lieu).

**Tests.** `tests/test_espace.py` (2 leçons d'essai génériques, sans rien de personnel : `essai_espace_monde.json`, `essai_espace_lieux.json`) : rubrique, 4 animations qui bougent et se mettent en pause, repères, zones touchées (juste, faux, hors cible), lieu montré après 3 erreurs, étoiles, nommer, point touché à côté, journal, bilan, programme. Non-régression : `test_validate`, `test_emojis`, `test_generateurs`, `test_app`, `test_quiz`, `test_defi`, `test_problemes`, `test_rubrique_problemes` verts.

**À vérifier sur la tablette.** Précision du doigt sur les petites zones (Europe, une petite commune), fluidité des animations sur l'ancienne tablette, lecture à voix haute des noms de lieux.

**Complément 1.13.0 (15/11/2026), à la demande du parent.**
- Fond **`europe`** dans `cartes.js` (Natural Earth 1:50m) : un pays par zone, le Royaume-Uni en 4 parties (Angleterre, Écosse, pays de Galles, Irlande du Nord ; zone composée `royaume_uni`), villes par latitude et longitude, mers nommées.
- Fond à zones générique dans l'appli (monde et europe), question « Quel est ce pays ? ».
- Toucher : un pays demandé se valide partout sur le pays, même sur le point d'une ville ; une ville demandée se valide au plus près (tolérance au doigt). Test ajouté (`test_espace.py` : point posé dans une zone).
- Leçons complétées (fond local plus grand, deux villes de plus en France) et nouvelle leçon sur les voyages en Europe.

**[À ARBITRER]** Continents : les leçons comptent 6 continents avec une seule Amérique (Amérique du Nord et du Sud citées comme ses deux parties). Si la classe en compte 7, les zones `amerique_nord` et `amerique_sud` existent déjà : il suffit de republier la leçon.

---

## Idées non arbitrées [PROPOSÉ]

À ne pas coder sans accord du parent.

Axes issus de l'étude programme 2025 et de Duolingo Math (15/11/2026), à passer en revue avec le parent :
- **Générateurs alignés sur le programme** :
  - droite graduée (nombres, fractions) ;
  - fractions : égalités, comparaison, complément à l'unité ;
  - procédures de calcul mental (+9 et +19 par la dizaine, ×4 et ×8 par doublements, ×10, multiples de 25) ;
  - monnaie (centimes et euros, rendre la monnaie) ;
  - additions et soustractions posées ;
  - conjugaison (présent, imparfait, futur, passé composé ; être, avoir, 1er groupe, faire, aller, dire, venir, pouvoir, voir, vouloir, prendre) ;
  - lettre muette finale par la famille de mots.
- **Manipulations au doigt** : régler les aiguilles d'une horloge, colorier une fraction, glisser des pièces et des billets, compléter une figure symétrique sur quadrillage.
- **Jeux** :
  - paires contre la montre (cartes et calculs existants) ;
  - KenKen 4×4, pyramides de nombres, table de Pythagore à trous ;
  - mot mystère (étiquettes de lettres, plutôt qu'un pendu) ;
  - mots croisés (le plus coûteux).
- **Mémorisation** : rattrapage automatique des erreurs du journal ; difficulté des générateurs qui s'ajuste aux résultats.
- **Motivation** : série de jours avec un jour de repos automatique, collection ou badges. Ni vies ni classement.
- **Oral et lecture** : fluence chronométrée validée par le parent ; dictée lue par la synthèse vocale, avec réponse par étiquettes.
- **Côté parent** : carte de couverture du programme (attendus CE2 qui ont déjà une leçon).

- **Séance du jour avec boîtes de Leitner** (J+1, J+3, J+7, J+15) : cartes et questions dues, toutes leçons confondues, en 5 à 10 minutes. Remplace le seul palier « demain » actuel, qui ne joue que si l'enfant rouvre la leçon.
- **Nouveaux exercices au doigt** : relier, remettre dans l'ordre, texte à trous par étiquettes, tri par nature de mot, ligne graduée, dictée par choix d'orthographe.
- **Ceintures de calcul** sur les générateurs existants (tables, compléments), pour rendre visible la progression des automatismes.
- **Leçon obligatoire à la première ouverture** (réglage parent) : l'étape Leçon doit être terminée avant d'accéder au quiz d'une leçon nouvelle.
