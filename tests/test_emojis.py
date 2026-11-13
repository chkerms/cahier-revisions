"""Les émojis de l'appli doivent s'afficher sur la tablette (Android ancien) : rien au-delà d'Emoji 1.0 (Unicode 8, 2015).
Usage : python3 -I tests/test_emojis.py (depuis la racine du dépôt) ; pip install emoji"""
import sys
from pathlib import Path

import emoji

ROOT = Path(__file__).resolve().parent.parent
MAX = 1.0  # version Emoji maximale ; 🧮 ou 🧪 (Emoji 11) s'affichaient en carré vide sur la Galaxy Tab
ko = []
for f in ["app.js", "index.html", "generateurs.js", "manifest.webmanifest"]:
    s = (ROOT / f).read_text(encoding="utf-8")
    for m in emoji.emoji_list(s):
        e = m["emoji"]
        d = emoji.EMOJI_DATA.get(e) or emoji.EMOJI_DATA.get(e.replace("️", "")) or {}
        if d.get("E", 0) > MAX:
            ko.append(f"{f} : {e} {d.get('en')} (Emoji {d.get('E')})")
for k in sorted(set(ko)):
    print("  FAIL " + k)
print("\nRÉSULTAT :", "PASS" if not ko else f"{len(set(ko))} ÉCHEC(S)")
sys.exit(1 if ko else 0)
