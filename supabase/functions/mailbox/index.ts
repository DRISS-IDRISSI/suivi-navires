// Edge Function "mailbox" (v4.1) : lit la boite Outlook (Microsoft Graph) et envoie les rapports a ingest-report.
// Secrets requis : MS_CLIENT_ID (ID de l'application Microsoft) et INGEST_KEY (deja cree).
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const DEVICE_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const SCOPE = "offline_access Mail.Read";
// Rapports reconnus : fin de shift (.xlsx) et horaire (.xls ou .xlsx)
const NOM_OK = /^(REP_MM_END_SHIFT|REP_QUAY_CRANE_DELAYS|REP_RTG_MOVES|REP_LATESTSHIFTRTGSCECDRIVERMOVES).*\.xlsx?$/i;
const MAX_PAR_PASSAGE = 10; // messages traites par appel (le reste au passage suivant, 5 min plus tard) : limite basse pour ne pas depasser le quota d'appels de fonctions de Supabase
const PAUSE_MS = 1500;       // pause entre deux envois a ingest-report

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CLIENT_ID = Deno.env.get("MS_CLIENT_ID") ?? "";
const KEY = Deno.env.get("INGEST_KEY") ?? "";

const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

async function form(url: string, data: Record<string, string>) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data),
  });
  return await r.json();
}

async function accessToken(): Promise<string> {
  const { data } = await sb.from("ms_auth").select("refresh_token").eq("id", 1).maybeSingle();
  if (!data?.refresh_token) throw new Error("Aucune connexion Microsoft : lancer action=start puis action=finish");
  const t = await form(TOKEN_URL, {
    client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: data.refresh_token, scope: SCOPE,
  });
  if (!t.access_token) throw new Error("Refresh impossible : " + (t.error_description || t.error));
  if (t.refresh_token) {
    await sb.from("ms_auth").upsert({ id: 1, refresh_token: t.refresh_token, updated_at: new Date().toISOString() });
  }
  return t.access_token;
}

async function graph(token: string, path: string) {
  const r = await fetch("https://graph.microsoft.com/v1.0" + path, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("Graph " + r.status + " : " + (await r.text()).slice(0, 300));
  return await r.json();
}

async function poll() {
  const token = await accessToken();
  const depuis = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  let url: string | null =
    "/me/messages?$filter=" + encodeURIComponent(`receivedDateTime ge ${depuis} and hasAttachments eq true`) +
    "&$orderby=" + encodeURIComponent("receivedDateTime desc") + "&$select=id,subject,receivedDateTime&$top=100";
  const messages: any[] = [];
  for (let page = 0; url && page < 5; page++) {
    const l: any = await graph(token, url);
    messages.push(...(l.value ?? []));
    url = l["@odata.nextLink"] ? String(l["@odata.nextLink"]).replace("https://graph.microsoft.com/v1.0", "") : null;
  }
  const dejaSet = new Set<string>();
  for (let i = 0; i < messages.length; i += 15) { // par lots : les identifiants Graph sont tres longs
    const { data: faits } = await sb.from("mail_processed").select("message_id").in("message_id", messages.slice(i, i + 15).map((m) => m.id));
    (faits ?? []).forEach((x: any) => dejaSet.add(x.message_id));
  }
  const aTraiter = messages.filter((m) => !dejaSet.has(m.id));
  let envoyes = 0;
  const erreurs: string[] = [];
  let limite = false;
  for (const m of aTraiter.slice(0, MAX_PAR_PASSAGE)) {
    if (limite) break;
    const pjs = await graph(token, `/me/messages/${m.id}/attachments`);
    let ok = true, trouves = 0;
    for (const pj of pjs.value ?? []) {
      const nom: string = pj.name ?? "";
      if (!NOM_OK.test(nom) || !pj.contentBytes) continue;
      trouves++;
      await new Promise((res) => setTimeout(res, PAUSE_MS));
      const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/ingest-report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": KEY },
        body: JSON.stringify({ contentBase64: pj.contentBytes }),
      });
      if (r.ok) envoyes++;
      else {
        const txt = (await r.text()).slice(0, 200); ok = false;
        if (r.status === 429 || /rate limit/i.test(txt)) { limite = true; break; } // quota atteint : on s'arrete, le message sera relu au passage suivant
        erreurs.push(nom + " : " + r.status + " " + txt);
      }
    }
    // un mail récent sans pièce jointe reconnue n'est pas marqué traité (pièces jointes parfois pas encore prêtes) : on le relira ; au-delà d'1 h on l'ignore
    const recent = Date.now() - Date.parse(m.receivedDateTime) < 3600 * 1000;
    if (ok && (trouves > 0 || !recent)) await sb.from("mail_processed").upsert({ message_id: m.id });
  }
  return {
    ok: erreurs.length === 0, envoyes, deja_traites: dejaSet.size, limite_atteinte: limite,
    restants: Math.max(0, aTraiter.length - MAX_PAR_PASSAGE), erreurs,
  };
}

Deno.serve(async (req) => {
  if (!KEY || req.headers.get("x-api-key") !== KEY) return json({ error: "unauthorized" }, 401);
  if (!CLIENT_ID) return json({ error: "Secret MS_CLIENT_ID manquant" }, 500);
  const action = new URL(req.url).searchParams.get("action") ?? "poll";
  try {
    if (action === "start") {
      const d = await form(DEVICE_URL, { client_id: CLIENT_ID, scope: SCOPE });
      if (!d.device_code) return json({ error: d.error_description || d.error }, 400);
      await sb.from("ms_auth").upsert({ id: 1, device_code: d.device_code, updated_at: new Date().toISOString() });
      return json({ etape: "Ouvrez " + d.verification_uri + " , saisissez le code " + d.user_code + " et connectez-vous avec marsamaroc.CES@outlook.fr, puis lancez action=finish", verification_uri: d.verification_uri, user_code: d.user_code });
    }
    if (action === "finish") {
      const { data } = await sb.from("ms_auth").select("device_code").eq("id", 1).maybeSingle();
      if (!data?.device_code) return json({ error: "Lancez d'abord action=start" }, 400);
      const t = await form(TOKEN_URL, {
        client_id: CLIENT_ID, grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: data.device_code,
      });
      if (!t.refresh_token) return json({ pending: t.error === "authorization_pending", error: t.error_description || t.error }, 400);
      await sb.from("ms_auth").upsert({ id: 1, refresh_token: t.refresh_token, device_code: null, updated_at: new Date().toISOString() });
      return json({ ok: true, connecte: true });
    }
    return json(await poll());
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
