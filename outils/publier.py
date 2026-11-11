#!/usr/bin/env python3
"""Valide, chiffre et range une leçon dans le cahier (sans connaître le mot de passe).

  python3 outils/publier.py lecon.json [--photo p1=photo.jpg]   # publie ou remplace (même meta.id)
  python3 outils/publier.py --supprimer <meta.id>
  python3 outils/publier.py --lister                              # nombre de leçons publiées
  python3 outils/publier.py --lire <meta.id> --mot-de-passe XXX   # relire une leçon publiée (correction)
Le commit et le push restent à faire ensuite (git add lecons && git commit && git push).
"""
import argparse
import base64
import hashlib
import io
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crypto_cahier as C  # noqa: E402
from validate import validate  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
LECONS = ROOT / "lecons"
INDEX = LECONS / "index.json"
MAX_W = 1000


def fname(lesson_id):
    # nom opaque : l'index public ne révèle pas les sujets
    return hashlib.sha256(("cahier:" + lesson_id).encode()).hexdigest()[:16] + ".json"


def load_index():
    if INDEX.exists():
        return json.loads(INDEX.read_text())
    return {"v": 1, "lecons": []}


def save_index(idx):
    idx["lecons"].sort(key=lambda e: e["f"])
    idx["maj"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    INDEX.write_text(json.dumps(idx, indent=1) + "\n")


def embed_photos(d, photos):
    from PIL import Image, ImageOps
    for im in d.get("images", []):
        if "cadrage" not in im:
            continue
        src = photos.get(im["source"])
        if not src:
            sys.exit(f"ERREUR image {im['id']} : --photo {im['source']}=fichier manquant")
        with Image.open(src) as raw:
            img = ImageOps.exif_transpose(raw).convert("RGB")
        W, H = img.size
        c = im["cadrage"]
        part = img.crop((round(c["x"] * W), round(c["y"] * H), round((c["x"] + c["l"]) * W), round((c["y"] + c["h"]) * H)))
        if part.width > MAX_W:
            part = part.resize((MAX_W, round(part.height * MAX_W / part.width)), Image.LANCZOS)
        buf = io.BytesIO()
        part.save(buf, "JPEG", quality=82, optimize=True)
        im["data"] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lecon", nargs="?")
    ap.add_argument("--photo", action="append", default=[])
    ap.add_argument("--supprimer")
    ap.add_argument("--lister", action="store_true")
    ap.add_argument("--lire")
    ap.add_argument("--mot-de-passe")
    a = ap.parse_args()
    idx = load_index()

    if a.lister:
        print(f"{len(idx['lecons'])} leçon(s) publiée(s) (titres chiffrés ; --lire pour en relire une).")
        return
    if a.lire:
        if not a.mot_de_passe:
            sys.exit("--lire demande --mot-de-passe")
        f = LECONS / fname(a.lire)
        if not f.exists():
            sys.exit(f"Aucune leçon publiée avec l'id « {a.lire} ».")
        try:
            k = C.open_private(json.loads(C.PRIV.read_text()), a.mot_de_passe)
        except Exception:
            sys.exit("Mot de passe incorrect.")
        print(json.dumps(C.decrypt_lesson(json.loads(f.read_text()), k), ensure_ascii=False, indent=2))
        return
    if a.supprimer:
        f = fname(a.supprimer)
        before = len(idx["lecons"])
        idx["lecons"] = [e for e in idx["lecons"] if e["f"] != f]
        (LECONS / f).unlink(missing_ok=True)
        save_index(idx)
        print("Supprimée." if len(idx["lecons"]) < before else "Aucune leçon avec cet id.")
        return
    if not a.lecon:
        ap.error("fichier de leçon attendu")

    d = json.loads(Path(a.lecon).read_text(encoding="utf-8"))
    errors, warnings = validate(d)
    if errors:
        print("Publication refusée :")
        for e in errors:
            print("  ERREUR", e)
        sys.exit(1)
    for w in warnings:
        print("  AVERTISSEMENT", w)
    if d["meta"]["statut"] != "pret":
        sys.exit("Publication refusée : alerte(s) bloquante(s) à faire trancher par le parent (statut en_attente_validation).")
    if not C.PUB.exists():
        sys.exit("Clé publique absente : lancer d'abord outils/cles.py init")

    embed_photos(d, dict(p.split("=", 1) for p in a.photo))
    f = fname(d["meta"]["id"])
    LECONS.mkdir(exist_ok=True)
    (LECONS / f).write_text(json.dumps(C.encrypt_lesson(d)) + "\n")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    idx["lecons"] = [e for e in idx["lecons"] if e["f"] != f] + [{"f": f, "maj": now}]
    save_index(idx)
    print(f"OK leçon « {d['meta']['id']} » chiffrée dans lecons/{f} ({len(idx['lecons'])} leçon(s) au total)")


if __name__ == "__main__":
    main()
