# Cahier de révisions : instructions pour Claude

Ce dépôt contient une application web (GitHub Pages) qui fait réviser un enfant de CE2 sur une tablette Android : leçon lue à voix haute, cartes mémo, quiz, calculs au pavé numérique, récitation, interro orale. Les leçons sont **rédigées par Claude** à la demande du parent, puis **chiffrées** avant d'être publiées : le dépôt est public, les leçons ne le sont pas.

Ce fichier est la référence. Une conversation qui produit une leçon le suit de bout en bout.

## 1. Règles de rédaction (non négociables)

**Contenu original, aligné sur la classe.**
- Tu ne recopies jamais un support d'éditeur (Nathan, MHM, MHF, fichiers, mini-fichiers, affichages), ni la trace écrite ou les exercices de l'enseignant(e). Pas de transcription, pas de paraphrase phrase à phrase, pas d'exercice repris avec d'autres nombres.
- Les photos ou notes du parent sont une **référence** : quelle notion, quels mots la classe emploie (« dizaine », « groupe nominal »…), quelle technique (soustraction posée par compensation ou par emprunt, sens de la multiplication…), quelles notations. Tu t'alignes sur ces choix, avec tes propres phrases, tes propres exemples et tes propres nombres.
- **Technique inconnue = question au parent avant d'écrire**, dès qu'une procédure peut être enseignée de plusieurs façons (opérations posées, décomposition, méthode de calcul mental). Enseigner autre chose que la maîtresse perd l'enfant.
- Périmètre : uniquement la notion demandée, au niveau CE2 (programmes 2025 du cycle 2). Pas de prolongement, pas d'anecdote culturelle, pas de « le savais-tu ? ».

**Lisible par un enfant de 8 ans.** Phrases courtes (15 mots au maximum), vocabulaire de CE2, une idée par bloc, exemples tirés de la vie d'un enfant. Encouragements bienveillants, jamais de punition.

**Exact.** Tout calcul d'un exercice porte une `expression`, que le validateur recalcule. Les règles de français suivent les formulations scolaires usuelles. En cas de doute sur une règle, choisis la formulation la plus simple et la plus sûre, ou demande au parent.

**Illustrations.** Les dessins sont des SVG originaux (`images[].svg`) : formes simples, `viewBox` obligatoire, aucun script, aucune image externe, aucun personnage connu. Une question qui s'appuie sur un dessin doit l'afficher (`"image": "imgN"`). Le recadrage d'une photo (`source` + `cadrage`) est réservé au travail de l'enfant lui-même, jamais à un support d'éditeur.

## 2. Format

- Contrat : `schema/lesson_data.schema.json` (v2.0). Exemples complets dans `exemples/`. Lis celui qui ressemble le plus à la demande avant d'écrire.
- `meta.id` : identifiant stable en minuscules avec tirets (ex. `maths-nombres-jusqua-10000`). Republier le même id remplace la leçon.
- `meta.date` : date de la séance en classe (sinon la date du jour). C'est elle qui ordonne l'accueil.
- `meta.methode` (`MHM`, `MHF`, `autre`, `aucune`), `meta.periode`, `meta.module` : à renseigner si le parent les donne.
- `meta.theme` : obligatoire en français et en maths, il range la leçon sur l'accueil. Français : `grammaire`, `conjugaison`, `dictee` (listes de mots, orthographe), `vocabulaire`, `poesie`. Maths : `nombres`, `fractions`, `operations`, `calcul_mental`, `mesures`, `heure`, `geometrie`, `monnaie`, `problemes`, `donnees`. Absent pour les autres matières. Une leçon sans thème est rangée d'après son titre (repli pour les leçons anciennes) ; la Zone parent montre le classement. La liste est commune à `app.js` (THEMES) et `outils/validate.py` (THEMES).
- Dans un thème, les leçons s'affichent dans l'ordre de la méthode : période, puis numéro dans le titre (« Leçon 2 » avant « Leçon 10 »). Mets le numéro de la leçon de la méthode dans le titre.
- Balisage inline : `{c1:mot}` (style déclaré dans `styles`), `{mc:mot}` (mot-clé), `{frac:3/4}`, `{lang-en:hello}`. Pas d'imbrication. Jamais `3/4` en ligne, `×` et pas `*`, virgule décimale.
- Champ `oral` seulement si la synthèse vocale lirait mal (homographes, sigles).

**Parcours selon la leçon**

| Type | parcours |
|---|---|
| Notion ou règle de français | `lecon, cartes, quiz, oral` |
| Maths avec du calcul | `lecon, cartes, quiz, calculs, oral` |
| Liste à mémoriser (mots, tables) | `lecon, cartes, quiz, oral` (jusqu'à 12 cartes) |
| Poésie | `lecon, recitation, oral` |

Pour une poésie, n'utilise que des textes du domaine public. Si le texte n'est pas dans le domaine public (ou si tu ne peux pas le vérifier), ne le transcris pas, même depuis une photo : bloc `poeme` avec `"saisie_parent": true` et sans `strophes`. La tablette demande alors au parent de taper la poésie une fois (stockée sur l'appareil uniquement), puis la récitation fonctionne normalement. Tu peux ajouter des blocs originaux d'aide à la mémorisation (plan, repères), sans paraphrase vers à vers.

**Activités**
- Cartes : 5 à 8. Une notion par carte, réponse avec les mots de la leçon.
- Quiz : exactement 5 questions, `reponse` + 2 `distracteurs`. Chaque distracteur doit apparaître mot pour mot dans le texte de la leçon (le validateur le vérifie). `indice.bloc` = le bloc à relire. Chaque question se comprend sans la leçon sous les yeux.
- Calculs : 3 à 10, réponse saisie au pavé numérique (entier ou décimal), avec `expression` dès que c'est un calcul.
- **Calculs générés** (maths) : préfère `generateurs` aux calculs fixes dès qu'un type existe, pour que l'enfant ait de nouveaux nombres à chaque séance. Types : `decomposition` (`chiffres` 3|4, `forme` somme|produits), `composition` (`chiffres`), `echanges`, `ecrire_chiffres` (`chiffres`, orthographe rectifiée avec tirets), `comparer` (`chiffres`, `sens` grand|petit|mixte), `table` (`tables`, `operation` multiplication|division|mixte), `partage` (`tables`, deux sens de la division), `moitie` (`max`), `fractions` (`operation` addition|soustraction|mixte, même dénominateur), `heure` (`cas` horloge|grande_aiguille|apres_midi|moins ; horloge dessinée), `multiplication_posee` (`chiffres` 2|3, `chiffres_multiplicateur` 1|2), `conversion` (`groupes` longueur|masse|contenance|duree), `perimetre` (`figure` carre|rectangle|mixte), `double_moitie` (`operation`, `niveau` 1|2|3 comme les parties MHM), `decomposer_produit` ; `table` accepte aussi `operation` addition, `jusqua` et la table de 25. Total par séance (fixes + générés) : 3 à 10. Un nouveau type se code dans `generateurs.js` et se vérifie dans `tests/test_generateurs.py`.
- Oral : 1 ou 2 questions ouvertes, `points_cles` que le parent coche.
- Durée cible : 10 minutes au maximum (le validateur avertit au-delà).

## 3. Déroulé d'une demande

1. **Comprendre.** Quelle notion, quel jour, quelle méthode, quelle technique ? Pose au maximum 2 questions, et seulement si la réponse change le contenu (voir « Technique inconnue »). Si une photo est jointe, regarde-la en entier. Un mot ou un nombre illisible qui compte va dans `alertes_lecture`, avec la gravité `bloquante`.
2. **Rédiger** le JSON **hors du dépôt** (ex. `/tmp/lecon.json`). Ne commite jamais une leçon en clair.
3. **Valider** : `python3 -I outils/validate.py /tmp/lecon.json`, et corriger jusqu'à 0 erreur.
4. **Montrer au parent** un aperçu court dans le chat : titre, texte de la leçon bloc par bloc, questions du quiz et calculs avec leurs réponses. Demande « Je publie ? ». Saute cette étape seulement si le parent a dit de publier directement.
5. **Publier** : `python3 -I outils/publier.py /tmp/lecon.json` (le script chiffre et met l'index à jour, sans mot de passe).
6. **Commit et push** :
   ```bash
   git add lecons/ && git commit -m "Ajout d'une leçon" && git push
   ```
   Le message de commit reste neutre : jamais le titre ni le sujet, le dépôt est public.
7. **Prévenir le parent** : la leçon arrive sur la tablette 1 à 2 minutes après le push, au prochain retour à l'accueil (ou Zone parent > Recharger).

Si le push est impossible (pas d'accès en écriture dans la session), envoie au parent le fichier `lecons/<id>.json` produit par `publier.py`. Il l'ajoute depuis la Zone parent > « Ajouter une leçon depuis un fichier ».

## 4. Corriger, supprimer, mot de passe

- Corriger : republie avec le même `meta.id`. Pour relire une leçon publiée, il faut le mot de passe du parent : `python3 -I outils/publier.py --lire <id> --mot-de-passe …`.
- Supprimer : `python3 -I outils/publier.py --supprimer <id>`, puis commit (« Suppression d'une leçon ») et push.
- Changer le mot de passe : `python3 -I outils/cles.py changer --ancien … --nouveau …`, puis commit et push. Les leçons restent lisibles. Une tablette déjà ouverte le reste : pour lui redemander le mot de passe, Zone parent > Verrouiller.
- Ne lance jamais `cles.py init --force` : toutes les leçons deviendraient illisibles.
- Le mot de passe n'est jamais écrit dans un fichier du dépôt, ni dans un message de commit.

## 5. Si tu modifies l'application

`index.html`, `app.js` et `sw.js` ne se modifient jamais pour une leçon donnée. Les évolutions demandées et leur cadrage sont dans `BACKLOG.md` : lis-le avant de coder, et mets-le à jour quand un lot est livré. Pour une évolution de l'application :
1. Incrémente `VERSION` dans `app.js` **et** `V` dans `sw.js` : sinon la tablette garde l'ancienne version en cache.
2. Lance les tests :
```bash
python3 -I tests/test_validate.py
python3 -I tests/test_generateurs.py     # node requis ; pip install num2words pour vérifier les nombres en lettres
python3 -m http.server 8765 &   # à la racine
python3 tests/test_app.py http://localhost:8765/ <mot de passe>   # Chrome headless au format tablette Android
python3 tests/test_quiz.py http://localhost:8765/ <mot de passe>  # mode quiz : copie avec les 3 exemples + tests/fixtures/essai_quiz_tables.json publiés
python3 tests/test_defi.py http://localhost:8765/ <mot de passe>  # défi chrono : même copie que test_quiz.py
```
`test_app.py` attend exactement les 3 leçons d'exemple : lance `test_quiz.py` et `test_defi.py` sur une autre copie jetable, où la leçon d'essai est aussi publiée, chacun sur un appareil neuf (ils le sont : nouveau contexte de navigateur).
Dépendances : `pip install --break-system-packages jsonschema cryptography pillow playwright`.
