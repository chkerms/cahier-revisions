# Cahier de révisions

Petite application web de révision pour l'école primaire : leçon lue à voix haute, cartes mémo, quiz, calculs au pavé numérique, récitation, interro orale. Elle fonctionne hors ligne et s'installe sur l'écran d'accueil d'une tablette Android.

L'accueil range les leçons par matière, puis par thème du programme de CE2 (grammaire, conjugaison, dictée… ; nombres, fractions, géométrie…), avec deux raccourcis : « Nouvelles leçons » et « À revoir ». La Zone parent montre les leçons de chaque thème, y compris les thèmes encore vides.

Deux profils sur le même appareil : « Enfant » et « Test parent », chacun avec sa progression et son prénom. On change de profil dans la Zone parent ; un bandeau signale le profil test, et l'appli revient au profil Enfant à chaque lancement.

Chaque séance est notée sur l'appareil (étapes faites ou sautées, erreurs de quiz et de calcul, cartes à revoir, oral). La Zone parent en tire un bilan texte, par profil et par période, à envoyer depuis le menu de partage Android (Gmail, appli Claude…), par email ou à télécharger. Le bilan contient le prénom et les titres des leçons : il ne se commite jamais dans ce dépôt.

Mode quiz, activé par le parent dans la Zone parent (par profil) : « Quiz français », « Quiz maths », « Quiz surprise ». 10 questions tirées dans toutes les leçons publiées ou seulement celles déjà ouvertes, au plus 2 par leçon, les questions ratées depuis 30 jours revenant deux fois plus souvent ; en maths, 7 questions puis 3 calculs générés. À la fin, un bouton ouvre la leçon de chaque question ratée.

Le contenu des leçons est chiffré (RSA-OAEP + AES-GCM). Le code est public, les leçons ne le sont pas : elles ne s'ouvrent qu'avec le mot de passe du cahier.

- `index.html`, `app.js`, `sw.js` : l'application (sans dépendance externe)
- `generateurs.js` : exercices de maths tirés au hasard à chaque séance
- `outils/` : validation, chiffrement et publication des leçons (Python)
- `schema/` : format des leçons ; `exemples/` : leçons d'exemple en clair
- `tests/` : tests du validateur, des générateurs et de l'application (Chrome headless au format tablette)
- `CLAUDE.md` : méthode de rédaction et de publication suivie par Claude
