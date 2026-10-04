// Edge Function "ingest-report" (v2) : reçoit un rapport Excel (base64) et l'enregistre.
//  - REP_MM_END_SHIFT (fin de shift, .xlsx)      -> table "snapshots"
//  - REP_QUAY_CRANE_DELAYS (horaire, .xls/.xlsx) -> table "hourly"
// Le type est reconnu d'après le CONTENU du fichier (pas le nom).
// Corps : { "contentBase64": "..." } ; en-tête obligatoire : x-api-key = secret INGEST_KEY
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const num = (v: any): number | null => {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[\s  ]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
};

// Heure du rapport (Casablanca) -> instant UTC exact, quel que soit le fuseau du serveur
function casaToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Casablanca", hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric" });
  const off = (t: number) => {
    const p = fmt.formatToParts(new Date(t));
    const v = (k: string) => +p.find((x) => x.type === k)!.value;
    return Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute")) - t;
  };
  const g = Date.UTC(y, mo, d, h, mi);
  let t = g - off(g);
  t = g - off(t);
  return t;
}

const rowsOf = (wb: any): any[][] =>
  XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });

// ---------- Rapport de fin de shift (REP_MM_END_SHIFT) ----------
export function parseShift(R: any[][]) {
  const row = (i: number, c: number) => (R[i] || [])[c];
  const m = String(row(1, 18) || "").match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) throw new Error("Date du rapport introuvable (cellule S2).");
  const ts = casaToUtc(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  const id = `${m[3]}${m[2]}${m[1]}${m[4]}${m[5]}`;
  const shift = String(row(1, 0) || "").trim(), win = String(row(1, 6) || "");
  const vessels: any[] = [];
  for (let r = 0; r < R.length; r++) {
    if (String(row(r, 0)).trim() !== "WORKING VESSEL") continue;
    const v: any = {
      visit: String(row(r + 2, 0)).trim(), name: String(row(r + 2, 2)).trim(), phase: String(row(r + 2, 11)).trim(),
      imp: num(row(r + 4, 0)), expF: num(row(r + 4, 1)), expE: num(row(r + 4, 4)), restow: num(row(r + 4, 7)),
      shiftTotal: num(row(r + 4, 10)), acc: num(row(r + 4, 14)),
      remImp: num(row(r + 6, 0)), remF: num(row(r + 6, 2)), remE: num(row(r + 6, 5)), rem: num(row(r + 6, 9)),
      gmph: num(row(r + 6, 13)), cranes: [],
    };
    for (let k = r + 8; k < R.length; k++) {
      const a = String(row(k, 0)).trim();
      if (a === "" || a === "WORKING VESSEL" || a.startsWith("Definitions")) break;
      v.cranes.push({ id: a, moves: num(row(k, 3)), hours: num(row(k, 8)), gmph: num(row(k, 12)), src: String(row(k, 17)).trim() });
    }
    if (v.visit) vessels.push(v);
  }
  if (!vessels.length) throw new Error("Aucun navire WORKING trouvé.");
  return { id, ts, shift, window: win, vessels };
}

// ---------- Rapport horaire (REP_QUAY_CRANE_DELAYS) ----------
// Les heures de la fenêtre sont des numéros de série Excel en heure locale Casablanca.
const serialToParts = (s: number) => {
  const d = new Date(Math.round((s - 25569) * 1440) * 60000); // minute entière, lecture en "UTC" = heure locale
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
};
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (p: any) => `${pad(p.h)}:${pad(p.mi)}`;

export function parseHourly(R: any[][]) {
  let wr = -1, hr = -1, tr = -1, gen = "";
  for (let r = 0; r < R.length; r++) {
    const line = R[r].map((x) => String(x).trim());
    if (wr < 0 && line.some((x) => /^Rolling window/i.test(x))) wr = r;
    if (tr < 0 && line.some((x) => /^TOTAL VESSEL MOVES/i.test(x))) tr = r;
    if (hr < 0 && line.includes("CRANE") && line.includes("MOVES")) hr = r;
    const g = line.find((x) => /^Generated\s/i.test(x));
    if (g) gen = g;
  }
  if (wr < 0 || hr < 0) throw new Error("Structure du rapport horaire non reconnue.");
  const nums = R[wr].filter((x) => typeof x === "number") as number[];
  if (nums.length < 2) throw new Error("Fenêtre horaire introuvable.");
  const a = serialToParts(nums[0]), b = serialToParts(nums[1]);
  const ts = casaToUtc(b.y, b.mo, b.d, b.h, b.mi);
  const id = `${b.y}${pad(b.mo + 1)}${pad(b.d)}${pad(b.h)}${pad(b.mi)}`;
  const idx = (name: string) => R[hr].findIndex((x) => String(x).trim() === name);
  const cC = idx("CRANE"), cM = idx("MOVES"), cS = idx("STATUS");
  // totaux : la ligne de valeurs est juste sous les intitulés
  let total = null, load = null, disch = null, other = null;
  if (tr >= 0) {
    const labels = R[tr], vals = R[tr + 1] || [];
    const at = (re: RegExp) => { const c = labels.findIndex((x: any) => re.test(String(x))); return c < 0 ? null : num(vals[c]); };
    total = at(/^TOTAL VESSEL MOVES/i); load = at(/^LOAD MOVES/i); disch = at(/^DISCHARGE MOVES/i); other = at(/^MISSING/i);
  }
  const text = R.flat().map((x) => String(x)).find((x) => /Minimum:\s*\d+/i.test(x)) || "";
  const min = +(text.match(/Minimum:\s*(\d+)/i)?.[1] ?? 20);
  const cranes: any[] = [];
  for (let k = hr + 1; k < R.length; k++) {
    const c = String(R[k][cC] ?? "").trim();
    if (!c || /\s/.test(c)) break;          // fin du tableau (ligne de notes)
    cranes.push({ id: c, moves: num(R[k][cM]) ?? 0, status: String(R[k][cS] ?? "").trim() });
  }
  if (!cranes.length) throw new Error("Aucune grue dans le rapport horaire.");
  return { id, ts, from: hhmm(a), to: hhmm(b), min, total, load, disch, other, generated: gen.replace(/^Generated\s*/i, ""), cranes };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST uniquement", { status: 405 });
  if (req.headers.get("x-api-key") !== Deno.env.get("INGEST_KEY")) return new Response("Non autorisé", { status: 401 });
  try {
    const { contentBase64 } = await req.json();
    const bytes = Uint8Array.from(atob(String(contentBase64).replace(/\s/g, "")), (c) => c.charCodeAt(0));
    const R = rowsOf(XLSX.read(bytes, { type: "array" }));
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const isHourly = R.some((l) => l.some((x: any) => /Hourly Quay-Crane/i.test(String(x))));
    if (isHourly) {
      const h = parseHourly(R);
      const { error } = await sb.from("hourly").upsert({ id: h.id, ts: new Date(h.ts).toISOString(), data: h });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true, type: "horaire", id: h.id, grues: h.cranes.length }), { headers: { "content-type": "application/json" } });
    }
    const snap = parseShift(R);
    const { error } = await sb.from("snapshots").upsert({ id: snap.id, ts: new Date(snap.ts).toISOString(), shift: snap.shift, data: snap });
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ ok: true, type: "shift", id: snap.id, navires: snap.vessels.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), { status: 400, headers: { "content-type": "application/json" } });
  }
});
