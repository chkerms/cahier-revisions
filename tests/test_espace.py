"""Test de bout en bout de la rubrique « Questionner l'espace » (cartes et animations), au format tablette Android.

Usage : python3 tests/test_espace.py http://localhost:8765/ MOT_DE_PASSE [dossier_captures]
Prérequis : une copie jetable avec tests/fixtures/essai_espace_monde.json et tests/fixtures/essai_espace_lieux.json publiées.
Vérifie : rubrique sur l'accueil, animations (mouvement, pause), cartes de leçon (monde, France, fond local),
étape « Sur la carte » (toucher une zone, un point, avec tolérance ; erreur nommée ; lieu montré après 3 erreurs ; nommer),
étoiles, journal et bilan, carte du programme dans la Zone parent, aucune erreur JavaScript.
"""
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL, PW = sys.argv[1], sys.argv[2]
SHOTS = Path(sys.argv[3]) if len(sys.argv) > 3 else None
FIX = Path(__file__).resolve().parent / "fixtures"
MONDE = json.loads((FIX / "essai_espace_monde.json").read_text(encoding="utf-8"))
LIEUX = json.loads((FIX / "essai_espace_lieux.json").read_text(encoding="utf-8"))
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


def shot(p, n):
    if SHOTS:
        SHOTS.mkdir(exist_ok=True)
        p.screenshot(path=str(SHOTS / n))


ANDROID_UA = "Mozilla/5.0 (Linux; Android 10; SM-T510) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 800, "height": 1280}, device_scale_factor=1, has_touch=True, user_agent=ANDROID_UA)
    p = ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    def accueil():
        p.goto(URL); p.wait_for_selector(".theme-tile", timeout=20000)

    def ouvrir(theme, lid):
        accueil()
        p.click(f".theme-tile[data-theme={theme}]"); p.click(f".lecon-card[data-id={lid}]"); p.wait_for_selector("[data-step=carte]")

    print("== Accueil : rubrique Questionner l'espace")
    p.goto(URL); p.wait_for_selector("#mdp"); p.fill("#mdp", PW); p.click("#btn-ouvrir"); p.wait_for_selector(".theme-tile", timeout=20000)
    rub = [t.strip() for t in p.locator("h2.matiere").all_inner_texts()]
    check("Questionner l'espace" in rub, f"rubrique « Questionner l'espace » ({rub})")
    tuiles = p.eval_on_selector_all(".theme-tile", "els => els.map(e => e.dataset.theme)")
    check("monde" in tuiles and "lieux" in tuiles, f"thèmes Continents et océans, Villes et lieux ({tuiles})")
    shot(p, "e1_accueil.png")

    print("== Animations")
    ouvrir("monde", "essai-espace-monde")
    check(p.locator("svg.anim").count() == 4, "4 animations dessinées")
    for m in ("systeme_solaire", "jour_nuit", "annee", "lune"):
        check(p.locator(f"svg.anim.{m}").count() == 1, f"animation {m}")
    cap = lambda m: p.eval_on_selector(f"svg.anim.{m}", "s => s.nextElementSibling.textContent")
    c0 = cap("jour_nuit"); p.wait_for_timeout(1500); c1 = cap("jour_nuit")
    check(c0 != c1 and "h chez toi" in c1, f"jour/nuit : l'heure avance ({c0[:22]} → {c1[:22]})")
    pos = lambda: p.eval_on_selector("svg.anim.annee", "s => s.querySelector('g:last-of-type').getAttribute('transform')")
    a0 = pos(); p.wait_for_timeout(400)
    check(a0 != pos(), "année : la Terre se déplace")
    d0 = p.eval_on_selector("svg.anim.lune", "s => s.querySelectorAll('.lune-claire')[1].getAttribute('d')"); p.wait_for_timeout(600)
    check(d0 != p.eval_on_selector("svg.anim.lune", "s => s.querySelectorAll('.lune-claire')[1].getAttribute('d')"), "Lune : la forme vue de la Terre change")
    p.click("[data-anim=jour_nuit]"); p.wait_for_timeout(200)
    c2 = cap("jour_nuit"); p.wait_for_timeout(1200)
    check(cap("jour_nuit") == c2 and "Lecture" in p.inner_text("[data-anim=jour_nuit]"), "pause : l'animation s'arrête")
    shot(p, "e2_animations.png")

    print("== Carte de la leçon (monde)")
    labels = p.eval_on_selector_all(".geo-bloc text.geo-label", "els => els.map(e => e.textContent)")
    check({"Afrique", "Amérique", "Asie", "Europe", "Océan Atlantique"} <= set(labels), f"repères nommés ({labels})")
    remplis = p.eval_on_selector_all(".geo-bloc [data-part]", "els => els.filter(e => e.style.fill).length")
    check(remplis == 6, f"zones colorées : 4 continents (Amérique en 2 parties) + 1 océan ({remplis})")

    print("== Sur la carte (monde) : toucher les zones")
    p.click("[data-step=carte]"); p.wait_for_selector(".geo-q")
    noms = {c["nom"]: c["id"] for c in MONDE["carte"]["cibles"]}
    n_trouver = len(noms)
    check(p.inner_text(".gzone .counter").endswith("sur " + str(n_trouver + 4)), "4 lieux à toucher, puis 4 à nommer")
    # 1re question : une zone fausse, puis un océan qui n'est pas une cible, puis la bonne
    nom = p.inner_text(".geo-q strong"); bon = noms[nom]
    faux = [i for i in noms.values() if i != bon][0]
    p.locator(f".jeu [data-cible={faux}]").first.dispatch_event("click")
    check("Non, ça, c'est « " in p.inner_text(".geo-fb"), "erreur : le lieu touché est nommé")
    p.locator(".jeu [data-part=oc_pacifique]").dispatch_event("click")
    check("l'océan Pacifique" in p.inner_text(".geo-fb"), "erreur sur une zone hors cible : nommée avec son article")
    p.locator(f".jeu [data-cible={bon}]").first.dispatch_event("click")
    check("Bravo, tu as trouvé" in p.inner_text(".geo-fb") and p.locator(f".jeu [data-cible={bon}].geo-ok").count() >= 1, "bonne zone : validée en vert")
    check(nom in p.eval_on_selector_all(".jeu text.geo-label", "els => els.map(e => e.textContent)"), "étiquette affichée après la réussite")
    shot(p, "e3_trouver.png")
    p.click("#next-btn")
    # 2e question : 3 erreurs, le lieu est montré
    nom = p.inner_text(".geo-q strong"); bon = noms[nom]
    faux = [i for i in noms.values() if i != bon]
    for f in faux[:3]:
        p.locator(f".jeu [data-cible={f}]").first.dispatch_event("click")
    check(p.locator(f".jeu [data-cible={bon}].geo-montre").count() >= 1 and "est ici" in p.inner_text(".geo-fb"), "3 erreurs : le lieu est montré")
    p.click("#next-btn")
    etoiles0 = int(p.inner_text(".stars").replace("⭐", ""))
    for _ in range(n_trouver - 2):
        nom = p.inner_text(".geo-q strong")
        p.locator(f".jeu [data-cible={noms[nom]}]").first.dispatch_event("click")
        p.click("#next-btn")
    check(int(p.inner_text(".stars").replace("⭐", "")) == etoiles0 + n_trouver - 2, "une étoile par lieu trouvé du premier coup")
    print("== Sur la carte (monde) : nommer")
    check(p.locator(".geo-q strong").count() == 0 and p.locator(".jeu .geo-montre").count() >= 1, "mode nommer : un lieu clignote")
    check(p.locator(".jeu text.geo-label").count() == 0, "mode nommer : aucune étiquette (pas de réponse affichée)")
    q = p.inner_text(".geo-q .q")
    check(q in ("Quel est ce continent ?", "Quel est cet océan ?"), f"question adaptée au lieu ({q})")
    for i in range(4):
        cid = p.eval_on_selector(".jeu .geo-montre", "e => e.getAttribute('data-cible')")
        if i == 0:
            mauvais = p.eval_on_selector_all(".choices [data-nom]", "(els, c) => els.map(e => e.dataset.nom).filter(x => x !== c)", cid)[0]
            p.click(f".choices [data-nom={mauvais}]")
            check("Ce n'est pas" in p.inner_text(".geo-fb"), "nommer : mauvaise réponse signalée")
        p.click(f".choices [data-nom={cid}]")
        p.click("#next-btn")
    check("du premier coup" in p.inner_text(".gzone .card.end"), "fin de l'étape : score affiché")
    shot(p, "e4_fin_carte.png")

    print("== Carte de France et fond local")
    ouvrir("lieux", "essai-espace-lieux")
    pts = p.eval_on_selector_all(".geo-bloc svg.france .geo-point", "els => els.map(e => [+e.getAttribute('cx'), +e.getAttribute('cy')])")
    check(len(pts) == 3, "3 villes placées sur la France")
    if len(pts) == 3:
        (px, py), (lx, ly), (bx, by) = pts
        check(bx < px < lx and py < ly and abs(py - by) < 60, "positions cohérentes : Brest à l'ouest, Lyon au sud-est de Paris")
    check(p.locator(".geo-bloc svg.france .geo-rose").count() == 1, "rose des vents")
    check(p.locator(".geo-bloc svg.local").count() == 1 and p.locator(".geo-bloc svg.local text.geo-label").count() == 4, "fond local : 4 repères nommés")
    check(p.locator(".geo-bloc svg.local script").count() == 0, "fond local : SVG nettoyé")
    shot(p, "e5_lecon_lieux.png")
    p.click("[data-step=carte]"); p.wait_for_selector(".geo-q")
    noms = {c["nom"]: c["id"] for c in LIEUX["carte"]["cibles"]}
    for i in range(len(noms)):
        nom = p.inner_text(".geo-q strong")
        if nom == "Le phare":
            # le doigt tombe à côté du point : tolérance
            box = p.locator(".jeu .geo-point").bounding_box()
            p.mouse.click(box["x"] + box["width"] / 2 + 18, box["y"] + box["height"] / 2 + 12)
            check("Bravo" in p.inner_text(".geo-fb") and "Il éclaire la mer." in p.inner_text(".geo-fb"), "point touché à côté : accepté, phrase « info » affichée")
        else:
            p.locator(f".jeu [data-cible={noms[nom]}]").first.dispatch_event("click")
        p.click("#next-btn")
    check(p.inner_text(".geo-q .q") == "Quel est ce lieu ?", "nommer sur un fond local : « Quel est ce lieu ? »")
    shot(p, "e6_nommer_local.png")

    print("== Journal, bilan et Zone parent")
    accueil()
    b = p.locator("#btn-parent").bounding_box()
    p.mouse.move(b["x"] + 10, b["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
    p.wait_for_function("window.__bilan !== undefined")
    bilan = p.evaluate("window.__bilan")
    m = re.search(r"--- DONNÉES BRUTES \(JSON\) ---\n(.*)\n--- FIN ---", bilan, re.S)
    brut = json.loads(m.group(1)) if m else {"seances": []}
    evs = [e for s in brut["seances"] for e in s["ev"] if e.get("k") == "geo"]
    check(len(evs) >= 12, f"journal : un événement par lieu ({len(evs)})")
    check(any(e["erreurs"] >= 3 and not e["resolu"] for e in evs), "journal : lieu montré après 3 erreurs (non résolu)")
    check(any("l'océan Pacifique" in e["faux"] for e in evs), "journal : zones touchées par erreur")
    check("(le toucher) : raté du premier coup" in bilan and "confondu avec" in bilan, "bilan : lieux ratés, avec les confusions")
    check("(le nommer)" in bilan, "bilan : mode nommer distingué")
    prog = p.inner_text("#programme")
    check("questionner l'espace" in prog.lower() and "Continents et océans : 1 leçon" in prog and "La Terre et les astres : pas encore de leçon" in prog,
          f"Zone parent : programme avec la rubrique Questionner l'espace ({prog[-160:]!r})")
    print("\n".join("     | " + l for l in bilan.split("--- DONNÉES")[0].splitlines() if "carte" in l))

    check(not errs, f"aucune erreur JavaScript ({errs[:3]})")
    br.close()

print("\nRÉSULTAT :", "PASS" if not fails else f"{len(fails)} ÉCHEC(S)")
sys.exit(1 if fails else 0)
