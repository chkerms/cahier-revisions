# Cahier de révisions

Petite application web de révision pour l'école primaire : leçon lue à voix haute, cartes mémo, quiz, calculs au pavé numérique, récitation, interro orale. Elle fonctionne hors ligne et s'installe sur l'écran d'accueil d'une tablette Android.

Le contenu des leçons est chiffré (RSA-OAEP + AES-GCM). Le code est public, les leçons ne le sont pas : elles ne s'ouvrent qu'avec le mot de passe du cahier.

- `index.html`, `app.js`, `sw.js` : l'application (sans dépendance externe)
- `outils/` : validation, chiffrement et publication des leçons (Python)
- `schema/` : format des leçons ; `exemples/` : leçons d'exemple en clair
- `CLAUDE.md` : méthode de rédaction et de publication suivie par Claude
