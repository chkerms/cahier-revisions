"""Test de bout en bout du mode quiz (lot 3), au format tablette Android (Chrome headless).

Usage : python3 tests/test_quiz.py http://localhost:8765/ MOT_DE_PASSE
Prérequis : servir une copie jetable du dépôt où sont publiées les 3 leçons d'exemple
ET tests/fixtures/essai_quiz_tables.json (maths, avec générateurs et une image « img1 »,
comme la leçon de fractions : sert à vérifier que les images ne se mélangent pas).
"""
import json
import re
import sys

from playwright.sync_api import sync_playwright

URL, PW = sys.argv[1], sys.argv[2]
fails = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


ANDROID_UA = "Mozilla/5.0 (Linux; Android 10; SM-T510) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 800, "height": 1280}, device_scale_factor=1, has_touch=True, user_agent=ANDROID_UA)
    p = ctx.new_page()
    errs = []
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)

    def zone_parent():
        b = p.locator("#btn-parent").bounding_box()
        p.mouse.move(b["x"] + 10, b["y"] + 10); p.mouse.down(); p.wait_for_timeout(2100); p.mouse.up()
        p.wait_for_selector("#mode-quiz")

    def accueil():
        p.click("#next-btn"); p.wait_for_selector(".theme-tile")

    def quiz_affiches():
        return p.eval_on_selector_all("[data-quiz]", "els => els.map(e => e.dataset.quiz)")

    p.goto(URL); p.wait_for_selector("#mdp")
    p.fill("#mdp", PW); p.click("#btn-ouvrir"); p.wait_for_selector(".theme-tile", timeout=20000)

    print("== Désactivé par défaut")
    check(quiz_affiches() == [], "accueil : aucun quiz tant que le parent ne l'active pas")
    zone_parent()
    check(p.eval_on_selector_all("[data-quiz-type]", "els => els.every(e => e.getAttribute('aria-pressed') === 'false')"), "zone parent : les trois quiz désactivés")
    dispo = p.inner_text("#quiz-dispo")
    check("Quiz français : 5 questions" in dispo and "Quiz maths : 10 questions + calculs" in dispo, f"questions disponibles ({dispo})")

    print("== Activation")
    for t in ["francais", "maths", "surprise"]:
        p.click(f"[data-quiz-type={t}]")
    check(p.get_attribute("[data-quiz-type=maths]", "aria-pressed") == "true", "quiz maths activé")
    accueil()
    check(quiz_affiches() == ["francais", "maths", "surprise"], f"accueil : trois raccourcis quiz ({quiz_affiches()})")
    tailles = p.eval_on_selector_all("[data-quiz] .sous", "els => els.map(e => e.textContent)")
    check(tailles == ["5 questions", "10 questions", "10 questions"], f"nombre de questions annoncé ({tailles})")

    print("== Réglage par profil")
    zone_parent(); p.click("[data-profil=test]"); p.wait_for_selector("#bandeau-test")
    check(p.eval_on_selector_all("[data-quiz-type]", "els => els.every(e => e.getAttribute('aria-pressed') === 'false')"), "profil test : mode quiz désactivé")
    accueil()
    check(quiz_affiches() == [], "profil test : aucun quiz à l'accueil")
    p.reload(); p.wait_for_selector(".theme-tile", timeout=20000)
    check(quiz_affiches() == ["francais", "maths", "surprise"], "retour au profil enfant : quiz présents")

    print("== Réservoir « leçons déjà ouvertes »")
    zone_parent(); p.click("[data-reservoir=ouvertes]")
    check("Quiz français : 0 question" in p.inner_text("#quiz-dispo"), "aucune leçon ouverte : 0 question")
    accueil()
    check(quiz_affiches() == [], "réservoir vide : raccourcis masqués")
    p.click(".theme-tile[data-theme=grammaire]"); p.click(".lecon-card[data-id=grammaire-le-nom]"); p.wait_for_selector("[data-step]")
    p.click("#btn-home"); p.wait_for_selector(".theme-tile, .lecon-card")
    if p.locator("#btn-themes").count():
        p.click("#btn-themes"); p.wait_for_selector(".theme-tile")
    check(quiz_affiches() == ["francais", "surprise"], f"leçon de grammaire ouverte : quiz français et surprise seulement ({quiz_affiches()})")
    zone_parent(); p.click("[data-reservoir=toutes]"); accueil()

    print("== Tirage (fonction tirer)")
    res = p.evaluate("""() => {
      const T = window.__cahier.tirer, items = [];
      for (let l = 0; l < 5; l++) for (let i = 0; i < 5; i++) items.push({ _src: { meta: { id: 'L' + l } }, i });
      const out = T(items, 10, () => 1), par = {};
      out.forEach(it => par[it._src.meta.id] = (par[it._src.meta.id] || 0) + 1);
      const big = T(items.slice(0, 5), 4, () => 1);
      let lourds = 0;
      for (let k = 0; k < 3000; k++) if (T([{ _src: { meta: { id: 'A' } }, w: 2 }, { _src: { meta: { id: 'B' } }, w: 1 }], 1, it => it.w)[0].w === 2) lourds++;
      return { n: out.length, max: Math.max(...Object.values(par)), relache: big.length, ratio: lourds / 3000 };
    }""")
    check(res["n"] == 10 and res["max"] == 2, f"10 questions, au plus 2 par leçon ({res})")
    check(res["relache"] == 4, "une seule leçon : la limite par leçon est relâchée")
    check(0.62 < res["ratio"] < 0.72, f"question ratée tirée 2 fois plus souvent ({res['ratio']:.2f}, attendu ≈ 0,67)")

    print("== Quiz maths : 7 questions puis 3 calculs")
    p.click("[data-quiz=maths]"); p.wait_for_selector(".choices")
    check(p.eval_on_selector_all("nav.steps [data-step]", "els => els.map(e => e.dataset.step)") == ["quiz", "calculs"], "étapes : quiz puis calculs")
    check("Question 1 sur 7" in p.inner_text(".counter"), "7 questions à choix")
    rate = False
    images = {}
    for qi in range(7):
        q = p.inner_text(".qzone .q")
        img = p.locator(".qzone .card img.qimg")
        if img.count():
            images[q] = img.get_attribute("src")
        for i in range(3):
            p.locator(".choices .btn").nth(i).click()
            if p.locator(".feedback.good").count():
                break
            rate = True
            if qi == 0 and i == 0:
                check(p.locator(".hintbox").count() == 1, "erreur : indice tiré de la leçon d'origine")
        p.click("#next-btn")
    for q, src in images.items():
        if "points" in q:
            check("0A7F5A" in src, "question « points » : image de la leçon d'essai")
        if "pizza" in q:
            check("5a3a1a" in src, "question « pizza » : image de la leçon de fractions")
    imgs = p.evaluate("""() => { const r = { vues: 0, ok: 0, ids: {} };
      for (let k = 0; k < 30; k++) { const Q = window.__cahier.assemblerQuiz('maths', {});
        Q.quiz.filter(q => q.image).forEach(q => { r.vues++; r.ids[q.image] = 1;
          const im = Q.images.filter(i => i.id === q.image)[0];
          const attendu = q._src.meta.id === 'essai-quiz-tables' ? '#0A7F5A' : '#5a3a1a';
          if (q.image === q._src.meta.id + '/img1' && im && im.svg.indexOf(attendu) >= 0) r.ok++; }); }
      return { vues: r.vues, ok: r.ok, ids: Object.keys(r.ids).sort() }; }""")
    check(imgs["vues"] > 0 and imgs["ok"] == imgs["vues"] and imgs["ids"] == ["essai-quiz-tables/img1", "maths-les-fractions/img1"],
          f"30 tirages : chaque « img1 » préfixée par sa leçon, avec le bon dessin ({imgs})")
    check("du premier coup sur 7" in p.inner_text(".qzone"), "bilan du quiz sur 7")
    p.click("#next-btn"); p.wait_for_selector("#saisie")
    check("Calcul 1 sur 3" in p.inner_text(".czone"), "3 calculs générés")
    p.click(".padkey[data-k='0']"); p.click("#btn-valider")
    check(p.locator('.hintbox span[style*="--c-vert"]').count() >= 1, "indice du calcul : style de la leçon d'origine (vert)")
    for _ in range(3):  # 0 n'est jamais la réponse : chaque calcul est raté
        while not (p.locator(".czone .feedback.good").count() or "La bonne réponse" in p.inner_text(".czone")):
            p.click(".padkey[data-k='0']"); p.click("#btn-valider")
        p.click("#next-btn")
    check("0 calcul réussi du premier coup sur 3" in p.inner_text(".czone"), "bilan des calculs du quiz")
    p.click("#next-btn"); p.wait_for_selector("#fin")
    revoir = p.eval_on_selector_all("[data-revoir]", "els => els.map(e => e.dataset.revoir)")
    check("essai-quiz-tables" in revoir, f"fin : leçon des calculs ratés proposée ({revoir})")
    check(set(revoir) <= {"essai-quiz-tables", "maths-les-fractions"}, "fin : seulement des leçons du quiz")
    check(p.evaluate("() => Object.keys(localStorage).filter(k => k.includes('quiz-')).length") == 0, "aucune progression de leçon écrite pour le quiz")

    print("== Revoir la leçon")
    p.click("[data-revoir=essai-quiz-tables]"); p.wait_for_selector("[data-step=lecon]")
    check(p.get_attribute("[data-step=lecon]", "aria-current") == "step" and "tables" in p.inner_text("header h1"), "la leçon s'ouvre sur l'étape Leçon")
    p.click("#btn-home"); p.wait_for_selector(".theme-tile, .lecon-card")

    print("== Bilan : erreurs rangées sous la leçon d'origine")
    p.goto(URL); p.wait_for_selector(".theme-tile", timeout=20000)
    zone_parent(); p.wait_for_function("window.__bilan !== undefined")
    b = p.evaluate("window.__bilan")
    check("Dont 1 quiz transverse (maths)" in b, "bilan : quiz transverse compté")
    bloc = b.split("[essai-quiz-tables]")[1].split("\n- ")[0] if "[essai-quiz-tables]" in b else ""
    check("calcul (table)" in bloc, "bilan : calcul raté rangé sous la leçon d'essai")
    check("[quiz-maths]" not in b, "bilan : pas de pseudo-leçon « quiz-maths »")
    if rate:
        check("raté du premier coup" in b, "bilan : question ratée du quiz présente")
    brut = json.loads(re.search(r"--- DONNÉES BRUTES \(JSON\) ---\n(.*)\n--- FIN ---", b, re.S).group(1))
    qs = [x for x in brut["seances"] if x["type"] == "quiz_transverse"]
    check(len(qs) == 1 and all(e.get("lecon") for e in qs[0]["ev"]), "journal : chaque réponse porte sa leçon d'origine")

    print("== Quiz surprise et français")
    accueil(); p.click("[data-quiz=surprise]"); p.wait_for_selector(".choices")
    check("Question 1 sur 7" in p.inner_text(".counter") and p.locator("[data-step=calculs]").count() == 1, "surprise : 7 questions + calculs")
    p.click("#btn-home"); p.wait_for_selector(".theme-tile")
    p.click("[data-quiz=francais]"); p.wait_for_selector(".choices")
    check("Question 1 sur 5" in p.inner_text(".counter") and p.locator("[data-step=calculs]").count() == 0, "français : les 5 questions disponibles, pas de calcul")

    check(not errs, f"aucune erreur JS/console {errs}")
    br.close()

print("\nRÉSULTAT :", "PASS" if not fails else f"{len(fails)} ÉCHEC(S)")
sys.exit(1 if fails else 0)
