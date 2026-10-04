// Edge Function "ingest-report" : reçoit le rapport Excel horaire (base64) et l'enregistre.
// Corps attendu : { "fileName": "REP_MM_END_SHIFT_....xlsx", "contentBase64": "..." }
// En-tête obligatoire : x-api-key = secret INGEST_KEY
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const num = (v: any): number | null => {
  if (typeof v === "number") return v;
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[\s  ]/g, "").replace(",", "."));
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

export function parseWorkbook(wb: any) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const R: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST uniquement", { status: 405 });
  if (req.headers.get("x-api-key") !== Deno.env.get("INGEST_KEY")) return new Response("Non autorisé", { status: 401 });
  try {
    const { contentBase64 } = await req.json();
    const bytes = Uint8Array.from(atob(String(contentBase64).replace(/\s/g, "")), (c) => c.charCodeAt(0));
    const snap = parseWorkbook(XLSX.read(bytes, { type: "array" }));
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await sb.from("snapshots").upsert({ id: snap.id, ts: new Date(snap.ts).toISOString(), shift: snap.shift, data: snap });
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ ok: true, id: snap.id, navires: snap.vessels.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message) }), { status: 400, headers: { "content-type": "application/json" } });
  }
});
