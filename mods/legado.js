/* =====================================================================
   LEGADO — mod de progresión para Sol Cesto (no oficial)
   por Glasius.Mods
   Sistemas: Maestría de héroes · El Taller · Juramentos · Afinidad de dientes
             Récords · Resumen de partida
   Tecla: F7 abre/cierra el panel.
   ===================================================================== */
(function () {
  "use strict";
  if (window.top !== window || window.__legadoLoaded) return;
  window.__legadoLoaded = true;

  const VERSION = "1.0.0";
  const HOTKEY = "F7";
  const SAVE_KEY = "legado_save_v1";

  // Enlaces del proyecto (se usan para buscar actualizaciones y en Opciones)
  const CONFIG = {
    repo: "GlasiusExe/Legado-SolCesto",   // usuario/repositorio en GitHub
    youtube: "",                           // enlace del canal (opcional)
  };

  /* ------------------------------------------------------------------ */
  /* Diseño (balance)                                                    */
  /* ------------------------------------------------------------------ */
  const XP_LEVELS = [0, 8, 20, 36, 56, 80, 110, 145, 185, 230]; // XP acumulada para Nv1..Nv10
  const MAX_LEVEL = XP_LEVELS.length;
  const XP_PER_FLOOR = 1;
  const XP_PER_BIOME = 4;

  const PERKS = {
    2: "+1 vida máxima",
    3: "El poder recarga 1 acción antes",
    4: "Objeto inicial del héroe",
    5: "+1 mano de inventario",
    6: "+10% de oro en partida",
    7: "+1 vida máxima",
    8: "Empieza con una poción extra",
    9: "+1 mano de inventario",
    10: "Veterano: medallón y marco dorados",
  };
  // Objeto inicial temático (Nv4) por número de héroe
  const HERO_ITEM = { 1: "bouclier", 2: "bombe", 3: "bombe", 4: "potion", 5: "potion", 6: "arc", 7: "bouclier" };
  const ITEM_NAME = { bouclier: "escudo", bombe: "bomba", potion: "poción", arc: "arco" };
  const MAX_HANDS = 6;

  const UPGRADES = {
    vida: { name: "Vida máxima +1", desc: "Todos los héroes empiezan con +1 de vida máxima.", costs: [300, 1500] },
    oro: { name: "Oro de partida +10%", desc: "Multiplicador de monedas recogidas.", costs: [250, 600] },
    curacion: { name: "Curación ×2", desc: "Fresas y pociones curan el doble.", costs: [500] },
  };

  const OATHS = {
    furia: { name: "Furia salvaje", desc: "Monstruos físicos con +1 de fuerza.", gold: 0.25 },
    arcano: { name: "Arcano furioso", desc: "Monstruos mágicos con +1 de magia.", gold: 0.25 },
    fragil: { name: "Corazón frágil", desc: "Empiezas con 1 de vida máxima menos.", gold: 0.25 },
    agotado: { name: "Poder agotado", desc: "Tu poder tarda 1 acción más en recargar.", gold: 0.2 },
    mercado: { name: "Mercado maldito", desc: "Los precios de la tienda se duplican.", gold: 0.4 },
  };

  const AFFINITY_RANKS = [1, 3, 6, 10]; // elecciones para rango I..IV
  const AFFINITY_MULT = [1, 1.1, 1.2, 1.35, 1.5];

  /* ------------------------------------------------------------------ */
  /* Guardado                                                            */
  /* ------------------------------------------------------------------ */
  const defaults = () => ({
    v: 2,
    mastery: {}, // heroNumero -> { xp }
    upgrades: { vida: 0, oro: 0, curacion: 0 },
    oaths: { furia: false, arcano: false, fragil: false, agotado: false, mercado: false },
    affinity: {}, // "z:y" -> elecciones
    settings: { maestria: true, taller: true, juramentos: true, afinidad: true, splash: true },
    records: {}, // heroNumero -> { runs, wins, bestBiome, bestFloor, bestGold }
    history: [], // últimas partidas
    stats: { runs: 0 },
  });
  function loadSave(raw) {
    const d = defaults();
    const s = Object.assign(d, raw || {});
    s.upgrades = Object.assign(defaults().upgrades, s.upgrades);
    s.oaths = Object.assign(defaults().oaths, s.oaths);
    s.settings = Object.assign(defaults().settings, s.settings);
    s.v = 2;
    return s;
  }
  let S = defaults();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) S = loadSave(JSON.parse(raw));
  } catch (e) {}
  const save = () => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  };

  /* ------------------------------------------------------------------ */
  /* Log a archivo (para depurar)                                        */
  /* ------------------------------------------------------------------ */
  let logFile = null;
  try {
    const fs = require("fs");
    const path = require("path");
    logFile = path.join(path.dirname(process.execPath), "legado_log.txt");
    fs.writeFileSync(logFile, `Legado ${VERSION} — ${new Date().toISOString()}\n`);
  } catch (e) { logFile = null; }
  function log(...a) {
    const line = `[${(performance.now() / 1000).toFixed(1)}s] ` + a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
    console.log("[Legado]", line);
    if (logFile) { try { require("fs").appendFileSync(logFile, line + "\n"); } catch (e) {} }
  }

  /* ------------------------------------------------------------------ */
  /* Cálculos                                                            */
  /* ------------------------------------------------------------------ */
  const num = (v) => (typeof v === "number" ? v : parseFloat(String(v).replace(",", "."))) || 0;
  function levelFromXp(xp) {
    let l = 1;
    for (let i = 1; i < XP_LEVELS.length; i++) if (xp >= XP_LEVELS[i]) l = i + 1;
    return l;
  }
  const heroXp = (n) => (S.mastery[n] && S.mastery[n].xp) || 0;
  const heroLevel = (n) => levelFromXp(heroXp(n));
  const effLevel = (n) => (S.settings.maestria ? heroLevel(n) : 1);
  const oathOn = (k) => S.settings.juramentos && !!S.oaths[k];
  function affinityRank(key) {
    const p = S.affinity[key] || 0;
    let r = 0;
    AFFINITY_RANKS.forEach((t, i) => { if (p >= t) r = i + 1; });
    return r;
  }
  // Bonus de oro: Taller + Juramentos (+ Maestría Nv6 si se indica héroe)
  function goldBonus(hero) {
    let g = S.settings.taller ? 0.1 * S.upgrades.oro : 0;
    for (const k in OATHS) if (oathOn(k)) g += OATHS[k].gold;
    if (hero && effLevel(hero) >= 6) g += 0.1;
    return Math.round(g * 100) / 100;
  }

  /* ------------------------------------------------------------------ */
  /* Runtime de Construct                                                */
  /* ------------------------------------------------------------------ */
  const rt = () => { try { return self.c3_runtimeInterface && self.c3_runtimeInterface._GetLocalRuntime(); } catch (e) { return null; } };
  const irt = () => { const r = rt(); return r && r.GetIRuntime(); };
  function first(objName) {
    const r = rt(); if (!r) return null;
    const oc = r.GetObjectClassByName(objName); if (!oc) return null;
    const a = oc.GetInstances(); return a && a.length ? a[0] : null;
  }
  function all(objName) {
    const r = rt(); if (!r) return [];
    const oc = r.GetObjectClassByName(objName); return oc ? oc.GetInstances() : [];
  }
  const iv = (inst, name) => { const i = inst.GetObjectClass().GetInstanceVariableIndexByName(name); return i < 0 ? undefined : inst.GetInstanceVariableValue(i); };
  const setIv = (inst, name, v) => { const i = inst.GetObjectClass().GetInstanceVariableIndexByName(name); if (i >= 0) inst.SetInstanceVariableValue(i, v); };
  function gvar(name) { try { return irt().globalVars[name]; } catch (e) { return undefined; } }
  function layoutName() { try { return rt().GetMainRunningLayout().GetName(); } catch (e) { return ""; } }

  /* ------------------------------------------------------------------ */
  /* Transformación de tablas (Array_personnages / monstresStats / dents)*/
  /* ------------------------------------------------------------------ */
  const touched = { Array_personnages: new Map(), Array_monstresStats: new Map(), Array_dents: new Map() };
  const arrInst = {};

  const cellKey = (x, y, z) => x + "," + y + "," + z;
  function setCell(name, data, x, y, z, fn) {
    if (!data[x] || !data[x][y] || data[x][y].length <= z) return;
    const k = cellKey(x, y, z);
    const t = touched[name];
    let rec = t.get(k);
    const cur = data[x][y][z];
    if (!rec || cur !== rec.applied) rec = { base: cur, applied: cur };
    const nv = fn(rec.base);
    data[x][y][z] = nv;
    rec.applied = nv;
    t.set(k, rec);
  }
  function restoreAll(name, data) {
    for (const [k, rec] of touched[name]) {
      const [x, y, z] = k.split(",").map(Number);
      if (data[x] && data[x][y] && data[x][y][z] === rec.applied) data[x][y][z] = rec.base;
    }
    touched[name].clear();
  }
  function transform(name, data) {
    if (!data) return;
    try {
      if (name === "Array_personnages") transformHeroes(data);
      else if (name === "Array_monstresStats") transformMonsters(data);
      else if (name === "Array_dents") transformTeeth(data);
    } catch (e) { log("ERROR transform", name, String(e)); }
  }

  function transformHeroes(data) {
    if (data.length < 2 || !data[1][10]) return;
    for (let x = 1; x < data.length; x++) {
      if (!(data[x][2] && data[x][2][0])) continue;
      const lvl = effLevel(x);
      const P = "Array_personnages";
      // Vida máxima
      const vida = (lvl >= 2 ? 1 : 0) + (lvl >= 7 ? 1 : 0) + (S.settings.taller ? S.upgrades.vida : 0) - (oathOn("fragil") ? 1 : 0);
      if (vida) setCell(P, data, x, 7, 0, (b) => Math.max(1, num(b) + vida));
      // Recarga del poder
      const reload = num(data[x][6][0]);
      const hasPower = reload > 0;
      let dReload = 0, extraHands = 0;
      if (lvl >= 3) { if (reload > 1) dReload -= 1; else extraHands += 1; }
      if (oathOn("agotado") && hasPower) dReload += 1;
      if (dReload) setCell(P, data, x, 6, 0, (b) => Math.max(1, num(b) + dReload));
      // Manos de inventario
      if (lvl >= 5) extraHands += 1;
      if (lvl >= 9) extraHands += 1;
      const baseHands = num(data[x][10][0]);
      if (extraHands) setCell(P, data, x, 10, 0, (b) => Math.min(MAX_HANDS, num(b) + extraHands));
      // Objetos iniciales
      const items = [];
      if (lvl >= 4) items.push(HERO_ITEM[x] || "potion");
      if (lvl >= 8) items.push("potion");
      const hands = Math.min(MAX_HANDS, baseHands + extraHands);
      for (const it of items) {
        for (let y = 11; y < 11 + hands; y++) {
          if (data[x][y] && data[x][y][0] === "") { setCell(P, data, x, y, 0, () => it); break; }
        }
      }
    }
    log("héroes ajustados", heroSummary(data));
  }
  function heroSummary(data) {
    const o = [];
    for (let x = 1; x < data.length; x++) {
      const n = data[x][2] && data[x][2][0];
      if (n) o.push(`${n}:Nv${effLevel(x)} vida=${data[x][7][0]} recarga=${data[x][6][0]} manos=${data[x][10][0]} obj=${data.slice ? [11, 12, 13, 14, 15, 16].map((y) => data[x][y][0]).filter(Boolean).join("/") : ""}`);
    }
    return o.join(" | ");
  }

  function transformMonsters(data) {
    if (data.length < 5 || !data[4][15]) return;
    const H = data[0].length, D = data[0][0].length, M = "Array_monstresStats";
    for (let y = 1; y < H; y++) {
      if (y === 15) continue; // cofre
      for (let z = 0; z < D; z++) {
        if (oathOn("furia") && typeof data[1][y][z] === "number" && data[1][y][z] > 0) setCell(M, data, 1, y, z, (b) => num(b) + 1);
        if (oathOn("arcano") && typeof data[2][y][z] === "number" && data[2][y][z] > 0) setCell(M, data, 2, y, z, (b) => num(b) + 1);
      }
    }
    if (oathOn("mercado")) {
      for (let z = 0; z < D; z++) {
        const p = data[4][15][z];
        if (p !== "" && p !== undefined) setCell(M, data, 4, 15, z, (b) => num(b) * 2);
      }
    }
    log("monstruos ajustados", { furia: oathOn("furia"), arcano: oathOn("arcano"), mercado: oathOn("mercado"), rata: data[1][1][0], blob: data[2][6][0] });
  }

  function transformTeeth(data) {
    if (data.length < 4 || data[0].length < 2 || !S.settings.afinidad) return;
    const H = data[0].length, D = data[0][0].length;
    let n = 0;
    for (let y = 1; y < H; y++)
      for (let z = 0; z < D; z++) {
        const r = affinityRank(z + ":" + y);
        if (r > 0 && data[3] && data[3][y] && data[3][y][z] !== "") {
          setCell("Array_dents", data, 3, y, z, (b) => +(num(b) * AFFINITY_MULT[r]).toFixed(3));
          n++;
        }
      }
    log("dientes ajustados por afinidad:", n);
  }

  function reapply(name) {
    const sdk = arrInst[name];
    if (!sdk || !sdk.__legadoArr) return;
    restoreAll(name, sdk.__legadoArr);
    transform(name, sdk.__legadoArr);
  }
  const reapplyAll = () => Object.keys(touched).forEach(reapply);

  let arrHooked = false;
  function hookArrays() {
    if (arrHooked) return true;
    const C3 = self.C3;
    if (!C3 || !C3.Plugins || !C3.Plugins.Arr || !C3.Plugins.Arr.Instance) return false;
    const P = C3.Plugins.Arr.Instance.prototype;
    Object.defineProperty(P, "_arr", {
      configurable: true,
      get() { return this.__legadoArr; },
      set(v) {
        this.__legadoArr = v;
        let name = null;
        try { name = this.GetObjectClass().GetName(); } catch (e) {}
        if (name && touched[name] && v) {
          arrInst[name] = this;
          touched[name].clear();
          transform(name, v);
        }
      },
    });
    try {
      const r = rt();
      if (r) for (const name of Object.keys(touched)) {
        const oc = r.GetObjectClassByName(name); if (!oc) continue;
        for (const inst of oc.GetInstances()) {
          const sdk = inst.GetSdkInstance();
          if (Object.prototype.hasOwnProperty.call(sdk, "_arr")) { const v = sdk._arr; delete sdk._arr; sdk._arr = v; }
        }
      }
    } catch (e) { log("ERROR migración", String(e)); }
    arrHooked = true;
    log("hook de arrays instalado");
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Partida: inicio, XP, afinidad, récords y resumen                    */
  /* ------------------------------------------------------------------ */
  let run = null;
  let pendingSummary = null;
  const seenTeeth = new Set();

  function tick() {
    const lay = layoutName();
    const h = lay === "jeu_scene" ? first("heros") : null;
    if (!h) {
      if (run) endRun(lay);
      if (pendingSummary && /titre/i.test(lay)) { showSummary(pendingSummary); pendingSummary = null; }
      hud();
      return;
    }
    if (!run || run.heroUid !== h.GetUID()) startRun(h);
    if (!run.applied && performance.now() - run.startedAt > 1500) applyRunBonuses(h);

    // progreso de la partida
    const et = num(gvar("EtageActuel")), bi = num(gvar("BiomeActuel"));
    if (bi > run.biome) { gainXp(XP_PER_BIOME, "bioma " + bi); run.biome = bi; run.floor = et; }
    else if (et > run.floor) { gainXp(XP_PER_FLOOR * (et - run.floor), "piso " + et); run.floor = et; }
    run.gold = num(iv(h, "or"));
    if (gvar("mort")) run.dead = true;

    // Afinidad: dientes elegidos
    if (S.settings.afinidad) {
      for (const d of all("demon_dents")) {
        const uid = d.GetUID();
        if (seenTeeth.has(uid) || !iv(d, "choisie")) continue;
        seenTeeth.add(uid);
        const key = (iv(d, "dentMalediction") ? 1 : 0) + ":" + num(iv(d, "tableauNumero"));
        const before = affinityRank(key);
        S.affinity[key] = (S.affinity[key] || 0) + 1;
        save();
        log("diente elegido", key, "elecciones", S.affinity[key]);
        if (affinityRank(key) > before) toast(`Afinidad ${roman(affinityRank(key))} con un diente`, "Aparecerá un poco más seguido");
      }
    }
    hud();
  }

  function startRun(h) {
    run = {
      heroUid: h.GetUID(),
      hero: num(gvar("heros_numero")) || 1,
      floor: num(gvar("EtageActuel")),
      biome: num(gvar("BiomeActuel")),
      startedAt: performance.now(),
      applied: false,
      xp: 0,
      levelStart: heroLevel(num(gvar("heros_numero")) || 1),
      gold: 0,
      dead: false,
      mult: 1,
      oaths: Object.keys(OATHS).filter(oathOn),
    };
    seenTeeth.clear();
    S.stats.runs++;
    save();
    log("inicio de partida", { hero: run.hero, nombre: gvar("heros_nom"), nivel: run.levelStart, vida: iv(h, "vie"), vieMax: iv(h, "vieMax"), manos: iv(h, "inventaireMax"), recarga: iv(h, "capacite_seuilMax"), objetos: [1, 2, 3, 4, 5, 6].map((i) => iv(h, "inventaire" + i)) });
  }

  function applyRunBonuses(h) {
    run.applied = true;
    const g = goldBonus(run.hero);
    if (g) setIv(h, "or_multiplicateur", num(iv(h, "or_multiplicateur")) + g);
    if (S.settings.taller && S.upgrades.curacion) setIv(h, "soinMult", num(iv(h, "soinMult")) + S.upgrades.curacion);
    run.mult = num(iv(h, "or_multiplicateur"));
    log("bonos de partida", { or_multiplicateur: run.mult, soinMult: iv(h, "soinMult"), vida: iv(h, "vie") + "/" + iv(h, "vieMax") });
    const lvl = effLevel(run.hero);
    toast(`${heroName(run.hero)} · Maestría Nv ${lvl}${lvl >= MAX_LEVEL ? " · Veterano" : ""}`, g ? `Oro ×${(1 + g).toFixed(2)}` : "Buena suerte");
  }

  function endRun(lay) {
    const r = run;
    run = null;
    const result = lay === "fin" ? "victoria" : r.dead ? "muerte" : "abandono";
    const rec = S.records[r.hero] || (S.records[r.hero] = { runs: 0, wins: 0, bestBiome: 0, bestFloor: 0, bestGold: 0 });
    rec.runs++;
    if (result === "victoria") rec.wins++;
    const newBest = r.biome > rec.bestBiome || (r.biome === rec.bestBiome && r.floor > rec.bestFloor);
    if (newBest) { rec.bestBiome = r.biome; rec.bestFloor = r.floor; }
    const goldRecord = r.gold > rec.bestGold;
    if (goldRecord) rec.bestGold = r.gold;
    const entry = { t: Date.now(), hero: r.hero, result, biome: r.biome, floor: r.floor, gold: r.gold, xp: r.xp, lvl: heroLevel(r.hero), oaths: r.oaths.length };
    S.history.unshift(entry);
    S.history = S.history.slice(0, 15);
    save();
    log("fin de partida", entry);
    if (r.xp > 0 || result !== "abandono") pendingSummary = Object.assign({}, entry, { levelStart: r.levelStart, newBest, goldRecord, mult: r.mult, oathNames: r.oaths.map((k) => OATHS[k].name) });
    hud();
  }

  function gainXp(n, why) {
    if (!S.settings.maestria) return;
    const k = run.hero;
    if (!S.mastery[k]) S.mastery[k] = { xp: 0 };
    const before = heroLevel(k);
    S.mastery[k].xp += n;
    run.xp += n;
    save();
    const after = heroLevel(k);
    log("XP", "+" + n, why, "total", S.mastery[k].xp, "nivel", after);
    if (after > before) toast(`¡${heroName(k)} sube a Nv ${after}!`, perkText(k, after) + " · desde la próxima partida");
  }

  function perkText(hero, L) {
    if (L === 4) return `Empieza con ${ITEM_NAME[HERO_ITEM[hero]] || "un objeto"}`;
    if (L === 3 && hero === 2) return "+1 mano de inventario";
    return PERKS[L];
  }
  function heroName(n) {
    try {
      const sdk = arrInst.Array_personnages; const v = sdk && sdk.__legadoArr && sdk.__legadoArr[n][2][0];
      if (v) return v;
    } catch (e) {}
    return ["", "Chevalier", "Paysan", "Guerrière", "Magicien", "Lézard", "Chasseuse", "Vampire"][n] || "Héroe " + n;
  }
  const roman = (n) => ["", "I", "II", "III", "IV", "V"][n] || n;

  /* ------------------------------------------------------------------ */
  /* Oro permanente, compras y opciones                                  */
  /* ------------------------------------------------------------------ */
  function metaGold() { const m = first("metaProgression"); return m ? num(iv(m, "or")) : null; }
  async function spendMeta(cost) {
    const m = first("metaProgression");
    if (!m) return false;
    const g = num(iv(m, "or"));
    if (g < cost) return false;
    setIv(m, "or", g - cost);
    setIv(m, "or_ancien", Math.max(0, num(iv(m, "or_ancien")) - cost));
    try { await irt().storage.setItem("or", g - cost); } catch (e) { log("ERROR guardando oro", String(e)); }
    log("oro permanente gastado", cost, "queda", g - cost);
    return true;
  }
  const inRun = () => layoutName() === "jeu_scene";

  async function buy(key) {
    const u = UPGRADES[key], lvl = S.upgrades[key];
    if (lvl >= u.costs.length) return;
    if (inRun()) return toast("El Taller está cerrado durante la partida", "Vuelve al menú principal");
    if (!(await spendMeta(u.costs[lvl]))) return toast("No tienes suficiente oro permanente", `Necesitas ${u.costs[lvl]}`);
    S.upgrades[key]++;
    save();
    if (key === "vida") reapply("Array_personnages");
    toast("Comprado: " + u.name, "Se aplica desde la próxima partida");
    render();
  }
  function toggleOath(key) {
    if (inRun()) return toast("Los juramentos se eligen antes de la partida", "Vuelve al menú principal");
    S.oaths[key] = !S.oaths[key];
    save(); reapplyAll(); render();
  }
  function toggleSetting(key) {
    if (inRun() && key !== "splash") return toast("Cambia las opciones desde el menú principal", "");
    S.settings[key] = !S.settings[key];
    save(); reapplyAll(); render();
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `legado_respaldo_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("Respaldo exportado", "Guárdalo en un lugar seguro");
  }
  function importSave() {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      f.text().then((t) => {
        try { S = loadSave(JSON.parse(t)); save(); reapplyAll(); render(); toast("Progreso importado", ""); }
        catch (e) { toast("Ese archivo no es un respaldo válido", ""); }
      });
    };
    inp.click();
  }
  let resetArmed = 0;
  function resetProgress() {
    if (inRun()) return toast("Reinicia el progreso desde el menú principal", "");
    if (Date.now() - resetArmed > 4000) { resetArmed = Date.now(); return toast("¿Seguro?", "Pulsa otra vez para borrar el progreso del mod (no afecta al juego)"); }
    const keep = S.settings;
    S = defaults(); S.settings = keep; save(); reapplyAll(); render();
    toast("Progreso de Legado reiniciado", "");
  }

  /* Buscar actualizaciones en GitHub */
  let update = null; // { tag, url }
  const verNum = (v) => String(v).replace(/^v/i, "").split(".").map((n) => parseInt(n) || 0);
  function newer(a, b) { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }
  async function checkUpdate() {
    if (!CONFIG.repo) return;
    try {
      const r = await fetch(`https://api.github.com/repos/${CONFIG.repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) return;
      const j = await r.json();
      if (j.tag_name && newer(j.tag_name, VERSION)) {
        update = { tag: j.tag_name, url: j.html_url };
        log("actualización disponible", update);
        setTimeout(() => toast(`Legado ${update.tag} disponible`, "Descárgalo desde GitHub · Opciones (F7)"), 4000);
        hud();
      }
    } catch (e) {}
  }
  function openUrl(u) {
    try { nw.Shell.openExternal(u); } catch (e) { try { window.open(u, "_blank"); } catch (e2) {} }
  }

  /* ------------------------------------------------------------------ */
  /* Interfaz                                                            */
  /* ------------------------------------------------------------------ */
  const FONT_T = "'Basteleur-Bold','Basteleur-Moonlight','Avara-Bold',Georgia,serif";
  const FONT_B = "'Avara-Bold',Georgia,serif";
  const GOLD = "#e8c56a";

  const ICON = {
    sun: (s = 40, c = GOLD) => `<svg width="${s}" height="${s}" viewBox="-100 -100 200 200">${Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, L = i % 2 === 0; return `<line x1="${Math.cos(a) * 52}" y1="${Math.sin(a) * 52}" x2="${Math.cos(a) * (L ? 94 : 78)}" y2="${Math.sin(a) * (L ? 94 : 78)}" stroke="${c}" stroke-width="${L ? 7 : 5}" stroke-linecap="round"/>`; }).join("")}<circle r="40" fill="none" stroke="${c}" stroke-width="7"/><circle r="22" fill="${c}"/></svg>`,
    shield: (s = 40, c = GOLD) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M32 6 L54 14 C54 34 46 50 32 58 C18 50 10 34 10 14Z" fill="none" stroke="${c}" stroke-width="4"/><path d="M32 18 L32 46 M20 28 L44 28" stroke="${c}" stroke-width="4" stroke-linecap="round"/></svg>`,
    hammer: (s = 40, c = GOLD) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><g transform="rotate(-40 32 32)"><rect x="29" y="22" width="6" height="36" rx="2.5" fill="${c}" opacity=".75"/><path d="M14 12 L44 12 L50 18 L50 24 L44 26 L14 26 L10 22 L10 16Z" fill="${c}"/></g></svg>`,
    skull: (s = 40, c = "#f3e9d2") => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M32 6 C16 6 8 18 8 30 C8 38 12 42 18 44 L18 54 L46 54 L46 44 C52 42 56 38 56 30 C56 18 48 6 32 6Z" fill="${c}"/><circle cx="22" cy="30" r="7" fill="#0d0913"/><circle cx="42" cy="30" r="7" fill="#0d0913"/><path d="M32 38 L28 45 L36 45Z" fill="#0d0913"/></svg>`,
    tooth: (s = 40, c = "#f3e9d2") => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M14 16 C14 8 22 6 32 10 C42 6 50 8 50 16 C50 26 46 30 44 40 C42 50 40 58 36 58 C33 58 33 46 32 42 C31 46 31 58 28 58 C24 58 22 50 20 40 C18 30 14 26 14 16Z" fill="${c}"/></svg>`,
    heart: (s = 40) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M32 56 C10 40 4 28 8 18 C12 8 26 6 32 18 C38 6 52 8 56 18 C60 28 54 40 32 56Z" fill="#c4543f"/></svg>`,
    coin: (s = 40) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="${GOLD}"/><circle cx="32" cy="32" r="19" fill="none" stroke="#7a5a1f" stroke-width="3"/><path d="M32 20 L36 30 L46 32 L36 34 L32 44 L28 34 L18 32 L28 30Z" fill="#7a5a1f"/></svg>`,
    flask: (s = 40) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><rect x="25" y="6" width="14" height="6" rx="2" fill="#a8833a"/><path d="M27 12 L37 12 L37 24 C46 27 52 34 52 43 C52 53 43 59 32 59 C21 59 12 53 12 43 C12 34 18 27 27 24Z" fill="none" stroke="#f3e9d2" stroke-width="3"/><path d="M15 42 C22 38 42 46 49 42 C49 52 42 56 32 56 C22 56 15 52 15 42Z" fill="#c4543f"/></svg>`,
    star: (s = 40, c = GOLD) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><path d="M32 4 L39 24 L60 24 L43 37 L49 58 L32 45 L15 58 L21 37 L4 24 L25 24Z" fill="${c}"/></svg>`,
    gear: (s = 40, c = GOLD) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64"><g fill="${c}">${Array.from({ length: 8 }, (_, i) => `<rect x="28" y="4" width="8" height="14" rx="2" transform="rotate(${i * 45} 32 32)"/>`).join("")}</g><circle cx="32" cy="32" r="17" fill="none" stroke="${c}" stroke-width="7"/></svg>`,
  };
  const CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 L12.5 26 L16 24.5 L12 15.8 L19.5 15.5 Z" fill="#e8c56a" stroke="#2a1d10" stroke-width="2" stroke-linejoin="round"/></svg>')}") 3 2, default`;

  let panel, body, hudEl, toastEl, medal, goldEl, veil, mini, brand, sumEl, tab = "maestria", selHero = 1;

  function css() {
    const s = document.createElement("style");
    s.textContent = `
#lg-panel,#lg-panel *,#lg-medal,#lg-medal *,#lg-mini,#lg-mini *,#lg-sum,#lg-sum *,#lg-splash{cursor:${CURSOR}!important;box-sizing:border-box}
#lg-veil{position:fixed;inset:0;z-index:2147483645;background:rgba(5,3,9,.55);display:none}
#lg-panel{position:fixed;left:50%;top:50%;translate:-50% -50%;z-index:2147483646;display:none;flex-direction:column;
 width:min(1180px,92vw);max-height:88vh;
 background:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(232,197,106,.14),transparent 70%),linear-gradient(180deg,#171024,#0d0913);
 border:2px solid rgba(232,197,106,.55);border-radius:18px;color:#f3e9d2;font:17px/1.35 ${FONT_B};
 box-shadow:0 0 0 6px rgba(13,9,19,.85),0 30px 90px rgba(0,0,0,.8);user-select:none;overflow:hidden}
#lg-panel header{display:flex;align-items:center;gap:16px;padding:20px 28px 10px}
#lg-panel header .ttl{font:34px ${FONT_T};color:${GOLD};letter-spacing:5px;line-height:1}
#lg-panel header .sub{color:#a99a7f;font-size:14px;letter-spacing:1px}
#lg-upd{font:13px ${FONT_B};color:#0d0913;background:${GOLD};border-radius:999px;padding:3px 10px;display:none}
#lg-gold{margin-left:auto;display:flex;align-items:center;gap:10px;padding:8px 18px;border-radius:999px;border:1px solid rgba(232,197,106,.4);background:rgba(30,22,44,.8);font:24px ${FONT_T};color:${GOLD}}
#lg-x{width:40px;height:40px;border-radius:50%;border:1px solid rgba(232,197,106,.4);background:transparent;color:#a99a7f;font:20px ${FONT_T}}
#lg-x:hover{color:${GOLD};border-color:${GOLD}}
#lg-tabs{display:flex;gap:8px;padding:8px 28px 16px;border-bottom:1px solid rgba(232,197,106,.18);flex-wrap:wrap}
#lg-tabs button{display:flex;align-items:center;gap:9px;background:rgba(30,22,44,.6);color:#a99a7f;border:1px solid rgba(232,197,106,.15);border-radius:12px;padding:9px 15px;font:17px ${FONT_T}}
#lg-tabs button:hover{color:#f3e9d2;border-color:rgba(232,197,106,.4)}
#lg-tabs button.on{color:#f3e9d2;border-color:${GOLD};background:rgba(232,197,106,.12);box-shadow:0 0 18px rgba(232,197,106,.15)}
#lg-body{flex:1;overflow:auto;padding:22px 28px 26px}
.lg-sub{color:#a99a7f;font-style:italic;margin:0 0 18px;font-size:16px}
.lg-split{display:grid;grid-template-columns:320px 1fr;gap:22px;height:min(560px,62vh)}
.lg-list{display:flex;flex-direction:column;gap:8px;overflow:auto}
.lg-hero{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:rgba(30,22,44,.7);border:1px solid rgba(232,197,106,.15)}
.lg-hero:hover{border-color:rgba(232,197,106,.45)}
.lg-hero.on{border-color:${GOLD};background:rgba(232,197,106,.1)}
.lg-hero .nm{flex:1;font:19px ${FONT_T}}
.lg-hero .chip{font:14px ${FONT_T};color:${GOLD};border:1px solid rgba(232,197,106,.4);border-radius:999px;padding:1px 9px}
.lg-hero .chip.vet{background:${GOLD};color:#0d0913}
.lg-hero .mini{height:5px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:6px;overflow:hidden}
.lg-hero .mini i{display:block;height:100%;background:${GOLD}}
.lg-detail{position:relative;border-radius:16px;border:1px solid rgba(232,197,106,.25);background:radial-gradient(ellipse at 30% 20%,rgba(232,197,106,.1),transparent 60%),rgba(20,14,30,.85);padding:22px 28px;display:flex;flex-direction:column;overflow:auto}
.lg-detail.vet{border:2px solid ${GOLD};box-shadow:inset 0 0 40px rgba(232,197,106,.15)}
.lg-detail .top{display:flex;align-items:center;gap:20px}
.lg-medalbig{width:92px;height:92px;border-radius:50%;border:3px solid ${GOLD};display:flex;align-items:center;justify-content:center;background:rgba(232,197,106,.08);box-shadow:0 0 30px rgba(232,197,106,.2);flex:none}
.lg-detail h2{margin:0;font:36px ${FONT_T}}
.lg-detail .lvl{margin-left:auto;text-align:center}.lg-detail .lvl small{display:block;color:#a99a7f;letter-spacing:3px;font-size:13px}.lg-detail .lvl b{font:58px ${FONT_T};color:${GOLD};line-height:1}
.lg-xp{height:12px;border-radius:6px;background:rgba(255,255,255,.08);overflow:hidden;margin:16px 0 6px}
.lg-xp i{display:block;height:100%;background:linear-gradient(90deg,#a8833a,${GOLD});box-shadow:0 0 14px ${GOLD}}
.lg-xptxt{color:#a99a7f;font-size:15px}
.lg-ladder{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,auto);grid-auto-flow:column;gap:14px 26px;margin-top:20px}
.lg-step{display:flex;align-items:center;gap:12px}
.lg-step .node{flex:none;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font:15px ${FONT_T};border-radius:50%;background:#1b1328;border:2px solid #4a4236;color:#6f6556}
.lg-step.on .node{border-color:${GOLD};color:#0d0913;background:${GOLD};box-shadow:0 0 14px rgba(232,197,106,.55)}
.lg-step.next .node{border-color:${GOLD};color:${GOLD}}
.lg-step .tx{font-size:17px;color:#6f6556;line-height:1.2}.lg-step.on .tx{color:#f3e9d2}.lg-step.next .tx{color:#c9bb9c}
.lg-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.lg-cards.five{grid-template-columns:repeat(5,1fr);gap:12px}
.lg-card{position:relative;border-radius:16px;border:1px solid rgba(232,197,106,.25);background:rgba(30,22,44,.82);padding:24px 20px 20px;display:flex;flex-direction:column;align-items:center;text-align:center;min-height:300px}
.lg-cards.five .lg-card{padding:18px 12px 14px;min-height:280px}
.lg-card .ic{width:90px;height:90px;border-radius:22px;background:rgba(232,197,106,.08);display:flex;align-items:center;justify-content:center;margin-bottom:12px}
.lg-card h3{margin:0;font:22px ${FONT_T};color:#f3e9d2}
.lg-cards.five .lg-card h3{font-size:18px}
.lg-card p{margin:8px 0 0;color:#a99a7f;font-size:15px}
.lg-card .foot{margin-top:auto;width:100%;display:flex;flex-direction:column;align-items:center;gap:12px;padding-top:14px}
.lg-pips{display:flex;gap:10px}.lg-pips i{width:16px;height:16px;transform:rotate(45deg);border:2px solid ${GOLD}}.lg-pips i.f{background:${GOLD};box-shadow:0 0 10px ${GOLD}}
.lg-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(232,197,106,.14);color:${GOLD};border:1px solid #a8833a;border-radius:12px;padding:10px 12px;font:18px ${FONT_T}}
.lg-btn:hover{background:rgba(232,197,106,.26);box-shadow:0 0 16px rgba(232,197,106,.25)}
.lg-btn.done{color:#7cc08a;border-color:#7cc08a;background:rgba(124,192,138,.12)}
.lg-btn.poor{opacity:.5}
.lg-card.oath.on{border-color:#c4543f;background:linear-gradient(180deg,rgba(90,26,24,.9),rgba(40,14,18,.9));box-shadow:0 0 30px rgba(196,84,63,.35)}
.lg-card.oath .gold{font:21px ${FONT_T};color:rgba(232,197,106,.5)}.lg-card.oath.on .gold{color:${GOLD}}
.lg-btn.oath-on{color:#f0c9b8;border-color:#c4543f;background:rgba(196,84,63,.3)}
.lg-mult{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:20px;font:21px ${FONT_B};color:#a99a7f}
.lg-mult b{font:48px ${FONT_T};color:${GOLD};text-shadow:0 0 24px rgba(232,197,106,.5)}
.lg-note{color:#7d715c;font-size:14px;margin-top:14px;text-align:center}
.lg-teeth{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:18px}
.lg-tooth{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:16px 12px;border-radius:16px;background:rgba(30,22,44,.7);border:1px solid rgba(232,197,106,.15)}
.lg-tooth .rk{font:15px ${FONT_T};color:${GOLD};letter-spacing:2px}
.lg-tooth p{margin:0;color:#a99a7f;font-size:14px;min-height:38px}
.lg-empty{min-height:380px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#a99a7f;text-align:center}
.lg-empty h3{margin:0;font:26px ${FONT_T};color:#f3e9d2}
.lg-ghost{display:flex;gap:22px;opacity:.35;margin-top:8px}
.lg-table{width:100%;border-collapse:separate;border-spacing:0 6px}
.lg-table th{font:14px ${FONT_T};color:#a99a7f;letter-spacing:2px;text-align:left;padding:0 12px;font-weight:normal}
.lg-table td{background:rgba(30,22,44,.75);padding:10px 12px;font-size:16px}
.lg-table td:first-child{border-radius:10px 0 0 10px;font:18px ${FONT_T}}.lg-table td:last-child{border-radius:0 10px 10px 0}
.lg-cols{display:grid;grid-template-columns:1.25fr 1fr;gap:22px}
.lg-h4{font:16px ${FONT_T};color:${GOLD};letter-spacing:3px;margin:0 0 10px}
.lg-run{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;background:rgba(30,22,44,.6);margin-bottom:6px;font-size:15px}
.lg-run .r{font:13px ${FONT_T};letter-spacing:1px;padding:2px 8px;border-radius:999px;border:1px solid}
.lg-run .r.victoria{color:#7cc08a;border-color:#7cc08a}.lg-run .r.muerte{color:#e08a76;border-color:#c4543f}.lg-run .r.abandono{color:#a99a7f;border-color:#6f6556}
.lg-opt{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;background:rgba(30,22,44,.75);border:1px solid rgba(232,197,106,.15);margin-bottom:8px}
.lg-opt .t{flex:1}.lg-opt b{font:18px ${FONT_T};font-weight:normal}.lg-opt small{display:block;color:#a99a7f;font-size:14px}
.lg-sw{width:54px;height:28px;border-radius:14px;background:#2b2236;border:1px solid #6f6556;position:relative;flex:none}
.lg-sw:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#6f6556;transition:left .15s}
.lg-sw.on{background:rgba(232,197,106,.3);border-color:${GOLD}}.lg-sw.on:after{left:29px;background:${GOLD}}
.lg-row3{display:flex;gap:10px;margin-top:6px}.lg-row3 .lg-btn{font-size:16px}
#lg-medal{position:fixed;left:0;top:0;translate:-50% 0;z-index:2147483644;display:none;flex-direction:column;align-items:center;gap:4px}
#lg-medal .ring{width:86px;height:86px;border-radius:50%;display:flex;align-items:center;justify-content:center;
 background:radial-gradient(circle at 50% 40%,#2a1c33,#120c19 70%);border:3px solid #b5473a;box-shadow:0 0 0 3px rgba(13,9,19,.9),0 0 22px rgba(232,197,106,.25);transition:transform .15s,box-shadow .15s}
#lg-medal .ring svg{transition:transform 6s linear}
#lg-medal:hover .ring{transform:scale(1.08);box-shadow:0 0 0 3px rgba(13,9,19,.9),0 0 34px rgba(232,197,106,.6)}
#lg-medal:hover .ring svg{transform:rotate(90deg)}
#lg-medal .lbl{font:16px ${FONT_T};color:${GOLD};letter-spacing:3px;text-shadow:0 2px 6px #000}
#lg-medal .key{font:12px ${FONT_B};color:#a99a7f}
#lg-medal .dot{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#c4543f;border:2px solid #0d0913;display:none}
#lg-brand{position:fixed;left:0;top:0;translate:-100% -100%;z-index:2147483643;display:none;opacity:.9;pointer-events:none;filter:drop-shadow(0 2px 8px rgba(0,0,0,.8))}
#lg-mini{position:fixed;left:0;top:0;translate:-50% -50%;z-index:2147483644;display:none;width:48px;height:48px;border-radius:50%;
 align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#2a1c33,#120c19 70%);border:2px solid #b5473a;
 box-shadow:0 0 0 2px rgba(13,9,19,.9),0 0 14px rgba(232,197,106,.3);transition:transform .15s,box-shadow .15s}
#lg-mini.vet{border-color:${GOLD};box-shadow:0 0 0 2px rgba(13,9,19,.9),0 0 22px rgba(232,197,106,.8)}
#lg-mini:hover{transform:scale(1.15);box-shadow:0 0 0 2px rgba(13,9,19,.9),0 0 24px rgba(232,197,106,.7)}
#lg-mini .lv{position:absolute;right:-6px;bottom:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:${GOLD};color:#0d0913;font:13px/20px ${FONT_T};text-align:center;border:2px solid #0d0913}
#lg-mini .tip{position:absolute;right:56px;top:50%;translate:0 -50%;white-space:nowrap;font:14px ${FONT_B};color:${GOLD};background:rgba(13,9,19,.92);border:1px solid rgba(232,197,106,.4);border-radius:8px;padding:5px 10px;opacity:0;transition:opacity .15s;pointer-events:none}
#lg-mini:hover .tip{opacity:1}
#lg-splash{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#07050b;opacity:1;transition:opacity .8s}
#lg-splash .lg-logo{opacity:0;scale:.92;transition:opacity 1s,scale 1.6s cubic-bezier(.16,1,.3,1)}
#lg-splash.in .lg-logo{opacity:1;scale:1}
#lg-splash.out{opacity:0;pointer-events:none}
#lg-sum{position:fixed;left:50%;top:50%;translate:-50% -50%;z-index:2147483646;display:none;width:min(620px,90vw);text-align:center;
 background:radial-gradient(ellipse 90% 60% at 50% 0%,rgba(232,197,106,.18),transparent 70%),linear-gradient(180deg,#171024,#0d0913);
 border:2px solid rgba(232,197,106,.6);border-radius:20px;padding:30px 34px 26px;color:#f3e9d2;font:17px/1.35 ${FONT_B};box-shadow:0 0 0 6px rgba(13,9,19,.85),0 30px 90px rgba(0,0,0,.8)}
#lg-sum .res{font:16px ${FONT_T};letter-spacing:6px;color:#a99a7f}
#lg-sum h2{margin:6px 0 2px;font:40px ${FONT_T};color:${GOLD}}
#lg-sum .where{color:#c9bb9c;font-size:18px}
#lg-sum .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0 16px}
#lg-sum .stats div{background:rgba(30,22,44,.8);border:1px solid rgba(232,197,106,.2);border-radius:14px;padding:12px 6px}
#lg-sum .stats b{display:block;font:30px ${FONT_T};color:${GOLD}}#lg-sum .stats small{color:#a99a7f;font-size:13px;letter-spacing:1px}
#lg-sum .lvup{display:inline-block;margin:4px 0 12px;padding:6px 16px;border-radius:999px;background:${GOLD};color:#0d0913;font:17px ${FONT_T}}
#lg-sum .tags{color:#7d715c;font-size:14px;margin-bottom:16px}
#lg-sum .badge{display:inline-block;margin:0 4px 10px;padding:3px 10px;border-radius:999px;border:1px solid ${GOLD};color:${GOLD};font:13px ${FONT_T};letter-spacing:1px}
#lg-hud{display:none}
#lg-toast{position:fixed;left:50%;top:9%;translate:-50% 0;z-index:2147483647;background:rgba(13,9,19,.95);border:1px solid ${GOLD};
 border-radius:12px;padding:14px 26px;text-align:center;color:#f3e9d2;font:20px ${FONT_T};opacity:0;transition:opacity .35s;pointer-events:none}
#lg-toast small{display:block;font:15px ${FONT_B};color:#a99a7f;margin-top:4px}`;
    document.head.appendChild(s);
  }

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  const stop = (e) => e.stopPropagation();
  function shield(node) {
    ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "mousemove", "click", "dblclick", "wheel", "touchstart", "touchend", "contextmenu", "keydown", "keyup"].forEach((t) => node.addEventListener(t, stop));
  }

  /* Logo Glasius.Mods */
  function brandLogo(scale = 1) {
    const ticks = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2, L = i % 3 === 0, r1 = 50, r2 = L ? 60 : 55;
      return `<line x1="${(Math.cos(a) * r1).toFixed(1)}" y1="${(Math.sin(a) * r1).toFixed(1)}" x2="${(Math.cos(a) * r2).toFixed(1)}" y2="${(Math.sin(a) * r2).toFixed(1)}" stroke="${GOLD}" stroke-width="${L ? 3 : 1.6}" stroke-linecap="round"/>`;
    }).join("");
    const w = 540 * scale, h = 140 * scale;
    return `<svg class="lg-logo" width="${w}" height="${h}" viewBox="0 0 540 140" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(70 70)">
        <circle r="64" fill="#120c19" stroke="#b5473a" stroke-width="3"/>${ticks}
        <circle r="44" fill="none" stroke="${GOLD}" stroke-width="2.5"/>
        <circle r="38" fill="none" stroke="rgba(232,197,106,.35)" stroke-width="1" stroke-dasharray="2 4"/>
        <text x="0" y="17" text-anchor="middle" font-family="${FONT_T}" font-size="52" fill="#f3e9d2">G</text>
        <path d="M24 -26 l4 -9 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4z" fill="${GOLD}"/>
      </g>
      <text x="150" y="76" font-family="${FONT_T}" font-size="54" letter-spacing="4" fill="#f3e9d2">GLASIUS</text>
      <line x1="152" y1="92" x2="510" y2="92" stroke="${GOLD}" stroke-width="1.5" opacity=".6"/>
      <circle cx="152" cy="92" r="3" fill="${GOLD}"/>
      <text x="164" y="122" font-family="${FONT_B}" font-size="22" letter-spacing="13" fill="${GOLD}">.MODS</text>
    </svg>`;
  }
  function splash() {
    if (!S.settings.splash) return;
    const sp = el("div"); sp.id = "lg-splash";
    sp.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:18px">${brandLogo(1.25)}<div class="lg-logo" style="font:15px ${FONT_B};letter-spacing:6px;color:#7d715c">PRESENTA · LEGADO</div></div>`;
    shield(sp);
    const close = () => { sp.classList.add("out"); setTimeout(() => sp.remove(), 900); };
    sp.addEventListener("click", close);
    document.body.appendChild(sp);
    requestAnimationFrame(() => requestAnimationFrame(() => sp.classList.add("in")));
    setTimeout(close, 2800);
  }
  function placeOnCanvas(node, fx, fy) {
    const c = document.querySelector("canvas");
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    node.style.left = Math.round(r.left + r.width * fx) + "px";
    node.style.top = Math.round(r.top + r.height * fy) + "px";
  }

  function buildUI() {
    css();
    veil = el("div"); veil.id = "lg-veil"; shield(veil);
    veil.addEventListener("click", () => { toggle(false); closeSummary(); });
    document.body.appendChild(veil);

    panel = el("div"); panel.id = "lg-panel";
    const head = el("header");
    head.appendChild(el("div", "", ICON.sun(46)));
    const t = el("div"); t.appendChild(el("div", "ttl", "LEGADO")); t.appendChild(el("div", "sub", `Progresión para Sol Cesto · v${VERSION} · Glasius.Mods`)); head.appendChild(t);
    const up = el("div", "", ""); up.id = "lg-upd"; up.addEventListener("click", () => { if (update) openUrl(update.url); }); head.appendChild(up);
    goldEl = el("div"); goldEl.id = "lg-gold"; head.appendChild(goldEl);
    const x = el("button", "", "✕"); x.id = "lg-x"; x.title = `Cerrar (${HOTKEY})`; x.addEventListener("click", () => toggle(false)); head.appendChild(x);
    panel.appendChild(head);
    const tabs = el("div"); tabs.id = "lg-tabs";
    [["maestria", "Maestría", ICON.shield(20)], ["taller", "El Taller", ICON.hammer(20)], ["juramentos", "Juramentos", ICON.skull(20)], ["afinidad", "Afinidad", ICON.tooth(20)], ["records", "Récords", ICON.star(20)], ["opciones", "Opciones", ICON.gear(20)]].forEach(([k, label, ic]) => {
      const b = el("button", "", `${ic}<span>${label}</span>`); b.dataset.k = k;
      b.addEventListener("click", () => { tab = k; render(); });
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);
    body = el("div"); body.id = "lg-body"; panel.appendChild(body);
    shield(panel);
    document.body.appendChild(panel);

    medal = el("div"); medal.id = "lg-medal"; medal.title = `Legado (${HOTKEY})`;
    medal.innerHTML = `<div class="ring">${ICON.sun(58)}</div><div class="lbl">LEGADO</div><div class="key">${HOTKEY}</div><div class="dot"></div>`;
    medal.addEventListener("click", () => toggle(true));
    shield(medal); document.body.appendChild(medal);

    brand = el("div"); brand.id = "lg-brand"; brand.innerHTML = brandLogo(0.5); document.body.appendChild(brand);

    mini = el("div"); mini.id = "lg-mini";
    mini.innerHTML = `${ICON.sun(32)}<div class="lv">1</div><div class="tip"></div>`;
    mini.addEventListener("click", () => toggle(true));
    shield(mini); document.body.appendChild(mini);

    sumEl = el("div"); sumEl.id = "lg-sum"; shield(sumEl); document.body.appendChild(sumEl);
    hudEl = el("div"); hudEl.id = "lg-hud"; document.body.appendChild(hudEl);
    toastEl = el("div"); toastEl.id = "lg-toast"; document.body.appendChild(toastEl);
  }

  function toggle(force) {
    if (!panel) return;
    const open = typeof force === "boolean" ? force : panel.style.display !== "flex";
    panel.style.display = open ? "flex" : "none";
    veil.style.display = open || sumEl.style.display === "block" ? "block" : "none";
    if (open) { closeSummary(); if (run) selHero = run.hero; render(); }
  }

  function render() {
    if (!panel || panel.style.display !== "flex") return;
    const mg = metaGold();
    goldEl.innerHTML = `${ICON.coin(28)}<span>${mg === null ? "—" : mg}</span>`;
    const up = panel.querySelector("#lg-upd");
    up.style.display = update ? "block" : "none";
    if (update) up.textContent = `Nueva versión ${update.tag}`;
    panel.querySelectorAll("#lg-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.k === tab));
    body.innerHTML = "";
    ({ maestria: renderMastery, taller: () => renderForge(mg), juramentos: renderOaths, afinidad: renderAffinity, records: renderRecords, opciones: renderOptions }[tab] || renderMastery)();
  }
  function disabledNote(key, what) {
    if (S.settings[key]) return false;
    body.appendChild(el("div", "lg-empty", `<h3>${what} está desactivado</h3><div>Actívalo en la pestaña Opciones.</div>`));
    return true;
  }

  function xpInfo(n) {
    const xp = heroXp(n), lvl = levelFromXp(xp);
    const next = XP_LEVELS[lvl], prev = XP_LEVELS[lvl - 1];
    const pct = next === undefined ? 100 : Math.round(((xp - prev) / (next - prev)) * 100);
    return { xp, lvl, next, pct };
  }

  function renderMastery() {
    if (disabledNote("maestria", "La Maestría")) return;
    const wrap = el("div", "lg-split");
    const list = el("div", "lg-list");
    for (let n = 1; n <= 7; n++) {
      const { lvl, pct } = xpInfo(n);
      const r = el("div", "lg-hero" + (n === selHero ? " on" : ""));
      r.innerHTML = `<div style="flex:1"><div style="display:flex;align-items:center;gap:10px"><span class="nm">${heroName(n)}</span><span class="chip${lvl >= MAX_LEVEL ? " vet" : ""}">Nv ${lvl}</span></div><div class="mini"><i style="width:${pct}%"></i></div></div>`;
      r.addEventListener("click", () => { selHero = n; render(); });
      list.appendChild(r);
    }
    wrap.appendChild(list);

    const n = selHero, { xp, lvl, next, pct } = xpInfo(n);
    const d = el("div", "lg-detail" + (lvl >= MAX_LEVEL ? " vet" : ""));
    const steps = [];
    for (let L = 2; L <= MAX_LEVEL; L++) steps.push(`<div class="lg-step${lvl >= L ? " on" : L === lvl + 1 ? " next" : ""}"><div class="node">${L}</div><div class="tx">${perkText(n, L)}</div></div>`);
    d.innerHTML = `
      <div class="top"><div class="lg-medalbig">${lvl >= MAX_LEVEL ? ICON.star(54) : ICON.shield(56)}</div>
        <div><h2>${heroName(n)}</h2><div class="lg-xptxt">${lvl >= MAX_LEVEL ? "Veterano · maestría completa" : `Siguiente: ${perkText(n, lvl + 1)}`}</div></div>
        <div class="lvl"><small>NIVEL</small><b>${lvl}</b></div></div>
      <div class="lg-xp"><i style="width:${pct}%"></i></div>
      <div class="lg-xptxt">${next === undefined ? `${xp} XP` : `${xp} / ${next} XP`} · +${XP_PER_FLOOR} por piso, +${XP_PER_BIOME} por bioma</div>
      <div class="lg-ladder">${steps.join("")}</div>
      <div class="lg-note" style="margin-top:auto;padding-top:14px;text-align:left">Las ventajas se aplican desde la siguiente partida.</div>`;
    wrap.appendChild(d);
    body.appendChild(wrap);
  }

  function renderForge(mg) {
    if (disabledNote("taller", "El Taller")) return;
    body.appendChild(el("p", "lg-sub", "Mejoras permanentes para todos los héroes, pagadas con tu oro permanente."));
    const icons = { vida: ICON.heart(58), oro: ICON.coin(58), curacion: ICON.flask(58) };
    const g = el("div", "lg-cards");
    for (const k of Object.keys(UPGRADES)) {
      const u = UPGRADES[k], lvl = S.upgrades[k], max = u.costs.length, done = lvl >= max, cost = u.costs[lvl];
      const c = el("div", "lg-card");
      c.innerHTML = `<div class="ic">${icons[k]}</div><h3>${u.name}</h3><p>${u.desc}</p>`;
      const f = el("div", "foot");
      f.appendChild(el("div", "lg-pips", Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? "f" : ""}"></i>`).join("")));
      const poor = !done && mg !== null && mg < cost;
      const b = el("button", "lg-btn" + (done ? " done" : poor ? " poor" : ""), done ? "COMPLETO" : `${ICON.coin(22)} ${cost}`);
      if (!done) b.addEventListener("click", () => buy(k));
      f.appendChild(b); c.appendChild(f); g.appendChild(c);
    }
    body.appendChild(g);
    body.appendChild(el("p", "lg-note", "Solo se puede comprar desde el menú principal. Se aplica desde la siguiente partida."));
  }

  function renderOaths() {
    if (disabledNote("juramentos", "Juramentos")) return;
    body.appendChild(el("p", "lg-sub", "Desventajas opcionales: más reto, más oro. Tú decides cuánto."));
    const g = el("div", "lg-cards five");
    for (const k of Object.keys(OATHS)) {
      const o = OATHS[k], on = S.oaths[k];
      const c = el("div", "lg-card oath" + (on ? " on" : ""));
      c.innerHTML = `<div class="ic" style="background:transparent;width:70px;height:70px">${ICON.skull(62, on ? "#f0c9b8" : "#8a7d68")}</div><h3>${o.name}</h3><p>${o.desc}</p>`;
      const f = el("div", "foot");
      f.appendChild(el("div", "gold", `+${Math.round(o.gold * 100)}% oro`));
      const b = el("button", "lg-btn" + (on ? " oath-on" : ""), on ? "JURADO" : "Jurar");
      b.addEventListener("click", () => toggleOath(k));
      f.appendChild(b); c.appendChild(f); g.appendChild(c);
    }
    body.appendChild(g);
    body.appendChild(el("div", "lg-mult", `${ICON.coin(40)}<span>Recompensa de oro</span><b>×${(1 + goldBonus()).toFixed(2)}</b>`));
    body.appendChild(el("p", "lg-note", "Incluye el bonus del Taller (la Maestría Nv6 suma +10% por héroe). Se aplica al empezar la siguiente partida."));
  }

  function toothLabel(z, y) {
    try {
      const d = arrInst.Array_dents.__legadoArr;
      if (z === 1) { const t = d[1][y][1]; if (t) return String(t).slice(0, 80); }
      const bonus = d[6][y][z], bp = d[7][y][z], malus = d[8][y][z], mp = d[9][y][z];
      if (bonus) return `${bonus} ${bp > 0 ? "+" : ""}${bp}% · ${malus} ${mp > 0 ? "+" : ""}${mp}%`;
    } catch (e) {}
    return `Diente ${y}`;
  }
  function ring(pct, inner) {
    const R = 52, C = 2 * Math.PI * R;
    return `<div style="position:relative;width:128px;height:128px"><svg width="128" height="128" viewBox="0 0 128 128" style="position:absolute;inset:0">
      <circle cx="64" cy="64" r="${R}" fill="rgba(13,9,19,.8)" stroke="rgba(232,197,106,.15)" stroke-width="8"/>
      <circle cx="64" cy="64" r="${R}" fill="none" stroke="${GOLD}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * Math.min(1, pct)} ${C}" transform="rotate(-90 64 64)" style="filter:drop-shadow(0 0 6px ${GOLD})"/></svg>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${inner}</div></div>`;
  }
  function renderAffinity() {
    if (disabledNote("afinidad", "La Afinidad")) return;
    const keys = Object.keys(S.affinity).sort((a, b) => S.affinity[b] - S.affinity[a]);
    if (!keys.length) {
      body.appendChild(el("div", "lg-empty", `<div class="lg-ghost">${ring(0.15, ICON.tooth(54))}${ring(0.45, ICON.tooth(54))}${ring(0.8, ICON.tooth(54))}</div>
        <h3>Tu estilo de juego deja huella</h3>
        <div>Cada diente que eliges con el demonio gana afinidad.<br>Con más afinidad aparece más seguido, sin volverse más fuerte.</div>`));
      return;
    }
    body.appendChild(el("p", "lg-sub", "Los dientes que más eliges aparecen más seguido, sin volverse más fuertes."));
    const g = el("div", "lg-teeth");
    for (const k of keys) {
      const [z, y] = k.split(":").map(Number);
      const r = affinityRank(k), picks = S.affinity[k], next = AFFINITY_RANKS[r];
      const c = el("div", "lg-tooth");
      c.innerHTML = `${ring(next ? picks / next : 1, ICON.tooth(54))}<div class="rk">${r ? "AFINIDAD " + roman(r) : "SIN RANGO"}</div><p>${toothLabel(z, y)}</p><div style="color:#7d715c;font-size:13px">${picks} elecciones · ×${AFFINITY_MULT[r]}${next ? ` · siguiente en ${next}` : ""}</div>`;
      g.appendChild(c);
    }
    body.appendChild(g);
  }

  const RES = { victoria: "Victoria", muerte: "Muerte", abandono: "Abandono" };
  const where = (b, f) => (b ? `Bioma ${b} · Piso ${f}` : "—");
  function renderRecords() {
    const cols = el("div", "lg-cols");
    const left = el("div");
    left.appendChild(el("div", "lg-h4", "RÉCORDS POR HÉROE"));
    let rows = "";
    for (let n = 1; n <= 7; n++) {
      const r = S.records[n] || { runs: 0, wins: 0, bestBiome: 0, bestFloor: 0, bestGold: 0 };
      rows += `<tr><td>${heroName(n)}</td><td>${r.runs}</td><td>${r.wins}</td><td style="white-space:nowrap">${r.bestBiome ? `B${r.bestBiome} · P${r.bestFloor}` : "—"}</td><td>${r.bestGold || "—"}</td></tr>`;
    }
    left.appendChild(el("table", "lg-table", `<tr><th>HÉROE</th><th>PARTIDAS</th><th>VICTORIAS</th><th>MEJOR</th><th>ORO</th></tr>${rows}`));
    cols.appendChild(left);
    const right = el("div");
    right.appendChild(el("div", "lg-h4", "ÚLTIMAS PARTIDAS"));
    if (!S.history.length) right.appendChild(el("p", "lg-note", "Aún no hay partidas registradas."));
    for (const h of S.history.slice(0, 8)) {
      const d = new Date(h.t);
      right.appendChild(el("div", "lg-run", `<span class="r ${h.result}">${RES[h.result]}</span><span style="flex:1">${heroName(h.hero)} · ${where(h.biome, h.floor)}</span><span style="color:${GOLD}">${h.gold}</span><span style="color:#7d715c;font-size:13px">${d.toLocaleDateString()}</span>`));
    }
    cols.appendChild(right);
    body.appendChild(cols);
  }

  function renderOptions() {
    const cols = el("div", "lg-cols");
    const left = el("div");
    left.appendChild(el("div", "lg-h4", "SISTEMAS"));
    const opts = [
      ["maestria", "Maestría de héroes", "Experiencia y ventajas por héroe."],
      ["taller", "El Taller", "Mejoras compradas con oro permanente."],
      ["juramentos", "Juramentos", "Desventajas opcionales con más oro."],
      ["afinidad", "Afinidad de dientes", "Los dientes que eliges aparecen más."],
      ["splash", "Logo al iniciar", "Animación de Glasius.Mods al abrir el juego."],
    ];
    for (const [k, t, d] of opts) {
      const o = el("div", "lg-opt", `<div class="t"><b>${t}</b><small>${d}</small></div><div class="lg-sw${S.settings[k] ? " on" : ""}"></div>`);
      o.addEventListener("click", () => toggleSetting(k));
      left.appendChild(o);
    }
    left.appendChild(el("p", "lg-note", "Desactivar un sistema no borra su progreso. Con todo apagado el juego queda como el original."));
    cols.appendChild(left);
    const right = el("div");
    right.appendChild(el("div", "lg-h4", "PROGRESO"));
    const row = el("div", "lg-row3");
    const bE = el("button", "lg-btn", "Exportar"); bE.addEventListener("click", exportSave);
    const bI = el("button", "lg-btn", "Importar"); bI.addEventListener("click", importSave);
    const bR = el("button", "lg-btn oath-on", "Reiniciar"); bR.addEventListener("click", resetProgress);
    row.append(bE, bI, bR); right.appendChild(row);
    right.appendChild(el("p", "lg-note", "El respaldo incluye maestría, mejoras, juramentos, afinidad y récords."));
    right.appendChild(el("div", "lg-h4", "ACERCA DE"));
    const about = el("div", "lg-opt", `<div class="t" style="text-align:center">${brandLogo(0.55)}<small>Legado v${VERSION} · mod no oficial para Sol Cesto.<br>Sol Cesto es de Tambouille y Goblinz Publishing.</small></div>`);
    right.appendChild(about);
    const links = el("div", "lg-row3");
    if (CONFIG.repo) { const b = el("button", "lg-btn", update ? `Descargar ${update.tag}` : "GitHub"); b.addEventListener("click", () => openUrl(update ? update.url : `https://github.com/${CONFIG.repo}`)); links.appendChild(b); }
    if (CONFIG.youtube) { const b = el("button", "lg-btn", "YouTube"); b.addEventListener("click", () => openUrl(CONFIG.youtube)); links.appendChild(b); }
    right.appendChild(links);
    cols.appendChild(right);
    body.appendChild(cols);
  }

  /* Resumen al terminar la partida */
  function showSummary(s) {
    const lvlUp = s.lvl > s.levelStart;
    const title = s.result === "victoria" ? "¡Victoria!" : s.result === "muerte" ? "Fin del descenso" : "Partida terminada";
    sumEl.innerHTML = `
      <div class="res">${RES[s.result].toUpperCase()} · LEGADO</div>
      <h2>${title}</h2>
      <div class="where">${heroName(s.hero)} · ${where(s.biome, s.floor)}</div>
      ${s.newBest ? '<div style="margin-top:10px"><span class="badge">NUEVO RÉCORD DE PROFUNDIDAD</span></div>' : ""}
      <div class="stats">
        <div><b>+${s.xp}</b><small>XP DE MAESTRÍA</small></div>
        <div><b>Nv ${s.lvl}</b><small>${heroName(s.hero).toUpperCase()}</small></div>
        <div><b>${s.gold}</b><small>ORO ${s.mult > 1 ? `(×${s.mult.toFixed(2)})` : ""}</small></div>
      </div>
      ${lvlUp ? `<div class="lvup">¡Subió a nivel ${s.lvl}! ${perkText(s.hero, s.lvl)}</div>` : ""}
      <div class="tags">${s.oathNames.length ? "Juramentos: " + s.oathNames.join(" · ") : "Sin juramentos"}</div>`;
    const b = el("button", "lg-btn", "Continuar");
    b.style.maxWidth = "260px"; b.style.margin = "0 auto";
    b.addEventListener("click", closeSummary);
    sumEl.appendChild(b);
    sumEl.style.display = "block";
    veil.style.display = "block";
  }
  function closeSummary() {
    if (!sumEl || sumEl.style.display !== "block") return;
    sumEl.style.display = "none";
    if (panel.style.display !== "flex") veil.style.display = "none";
  }

  function anyAffordable() {
    const mg = metaGold();
    if (mg === null || !S.settings.taller) return false;
    return Object.keys(UPGRADES).some((k) => S.upgrades[k] < UPGRADES[k].costs.length && mg >= UPGRADES[k].costs[S.upgrades[k]]);
  }

  // Posiciones (fracción del lienzo del juego)
  const POS_TITLE = [0.955, 0.035];   // cielo, esquina superior derecha del menú
  const POS_RUN = [0.957, 0.30];      // pantalones del héroe, panel derecho en partida
  const POS_BRAND = [0.985, 0.975];   // firma Glasius.Mods, esquina inferior derecha del menú
  function hud() {
    if (!medal) return;
    const onTitle = /titre/i.test(layoutName());
    medal.style.display = onTitle ? "flex" : "none";
    brand.style.display = onTitle ? "block" : "none";
    if (onTitle) {
      placeOnCanvas(brand, POS_BRAND[0], POS_BRAND[1]);
      placeOnCanvas(medal, POS_TITLE[0], POS_TITLE[1]);
      medal.querySelector(".dot").style.display = anyAffordable() || update ? "block" : "none";
    }
    if (!run) { mini.style.display = "none"; return; }
    const lvl = effLevel(run.hero);
    const g = goldBonus(run.hero);
    mini.style.display = "flex";
    mini.classList.toggle("vet", lvl >= MAX_LEVEL);
    placeOnCanvas(mini, POS_RUN[0], POS_RUN[1]);
    mini.querySelector(".lv").textContent = lvl;
    mini.querySelector(".tip").textContent = `${heroName(run.hero)} · Nv ${lvl}${lvl >= MAX_LEVEL ? " · Veterano" : ""}${g ? ` · Oro ×${(1 + g).toFixed(2)}` : ""} · ${HOTKEY}`;
  }

  let toastTimer;
  function toast(t, sub) {
    if (!toastEl) return;
    toastEl.innerHTML = `${t}${sub ? `<small>${sub}</small>` : ""}`;
    toastEl.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.opacity = "0"; }, 3200);
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === HOTKEY || e.code === HOTKEY) { e.preventDefault(); e.stopPropagation(); toggle(); }
    else if (e.key === "Escape" && panel && (panel.style.display === "flex" || sumEl.style.display === "block")) { e.preventDefault(); e.stopPropagation(); toggle(false); closeSummary(); }
  }, true);

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */
  log("cargado", { version: VERSION, save: { mastery: S.mastery, upgrades: S.upgrades, oaths: S.oaths, settings: S.settings } });
  (function bootHooks() { if (!hookArrays()) setTimeout(bootHooks, 10); })();
  (function bootUI() {
    if (!document.body) return setTimeout(bootUI, 50);
    buildUI();
    splash();
    setInterval(() => { try { tick(); } catch (e) { log("ERROR tick", String((e && e.stack) || e)); } }, 250);
    setTimeout(checkUpdate, 6000);
  })();

  // API mínima para pruebas
  window.Legado = {
    version: VERSION, state: () => S, reapplyAll, log,
    _transform: transform, _set: (s) => { S = loadSave(s); },
    _summary: (s) => showSummary(s),
  };
})();
