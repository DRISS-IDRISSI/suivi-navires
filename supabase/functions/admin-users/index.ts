// Edge Function "admin-users" : gestion des comptes (réservée aux administrateurs de l'application).
// Créer : Edge Functions > Deploy a new function > nom exact : admin-users > coller ce code > Deploy.
// « Verify JWT » : LAISSER ACTIVÉ (la fonction vérifie en plus que l'appelant est administrateur).
// Envoi automatique des accès par e-mail via Brevo (facultatif) : Edge Functions > Secrets, ajouter
//   BREVO_API_KEY = clé API Brevo (SMTP & API > API Keys)   ·   BREVO_SENDER_EMAIL = expéditeur validé dans Brevo
//   BREVO_SENDER_NAME (facultatif, ex. « Suivi des escales »)  ·   APP_URL (facultatif, adresse de l'application)
// Sans ces secrets, les comptes se créent normalement et l'application propose l'envoi manuel.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const ROLES = ["admin", "responsable", "lecture"], TERMS = ["TCE", "TC3"];
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const okTerms = (t: unknown) => Array.isArray(t) && t.length > 0 && t.every((x) => TERMS.includes(x));
const DOMAINE = "suivi-tc3.invalid";                       // e-mail technique : identifiant@suivi-tc3.invalid (aucun e-mail n'est jamais envoyé)
const normId = (x: unknown) => String(x ?? "").trim().toLowerCase();
const okId = (x: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(x);
const okPwd = (p: unknown) => typeof p === "string" && p.length >= 6 && p.length <= 72;   // mot de passe simple autorisé (min. 6 = minimum Supabase par défaut)
const normMail = (x: unknown) => String(x ?? "").trim().toLowerCase();
const okMail = (x: string) => x === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);

const ROLE_LAB: Record<string, string> = { admin: "Administrateur", responsable: "Responsable", lecture: "Lecture" };
const esc = (x: unknown) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const okUrl = (x: unknown) => typeof x === "string" && /^https:\/\/[^\s]+$/.test(x);

// Envoie le message d'accès. Renvoie "envoye" | "non_configure" | "pas_adresse" | "erreur : ..."
async function envoyerAcces(p: { to: string; nom: string; ident: string; pwd: string; role: string; terminaux: string[]; appUrl: string }): Promise<string> {
  const key = Deno.env.get("BREVO_API_KEY"), from = Deno.env.get("BREVO_SENDER_EMAIL");
  if (!key || !from) return "non_configure";
  if (!p.to) return "pas_adresse";
  const url = (Deno.env.get("APP_URL") || p.appUrl || "").replace(/\/?$/, "/");
  const drv = p.role === "admin" || p.role === "responsable", T = (p.terminaux || []).join(" + ");
  const intro = `Votre accès à l'application « Suivi des escales » (suivi de l'avancement des navires, rendement des grues${drv ? " et des conducteurs" : ""}) est créé.`;
  const text = `Bonjour${p.nom ? " " + p.nom : ""},

${intro}

Adresse : ${url}
Guide d'utilisation (PDF) : ${url}guide-utilisateur.pdf
Identifiant : ${p.ident.toUpperCase()}
Mot de passe provisoire : ${p.pwd}
Profil : ${ROLE_LAB[p.role] ?? p.role} · Terminaux : ${T}

À la première connexion, l'application vous demande de choisir votre propre mot de passe (6 caractères minimum). Merci de ne pas le partager.

DEUX VERSIONS, MÊME ADRESSE
- Téléphone : version simplifiée, affichée automatiquement. Liste des escales, avancement, vue « Par shift » (date + S1 / S2 / S3), rendement et mouvements par portique. Le bouton en haut (TCE / TC3) change de terminal.
- Ordinateur : version complète avec tableaux détaillés, analyse${drv ? ", conducteurs" : ""} et exports Excel / PDF. Depuis le téléphone, menu ☰ > « Version complète » ; « Vue mobile » pour revenir.

INSTALLATION (facultative, comme une application)
- Android (Chrome) : menu ⋮ > « Installer l'application » ou « Ajouter à l'écran d'accueil ».
- iPhone (Safari) : bouton Partager > « Sur l'écran d'accueil ».
- Ordinateur (Chrome / Edge) : icône « Installer » à droite de la barre d'adresse.

Les données se mettent à jour automatiquement à chaque rapport horaire et de fin de shift.

Cordialement,
Driss FELLAH IDRISSI
Chef de la Division Exploitation – Terminal TC3`;
  const li = (t: string) => `<li style="margin:3px 0">${t}</li>`;
  const html = `<div style="font:15px/1.5 Arial,sans-serif;color:#17303f;max-width:620px">
<p>Bonjour${p.nom ? " " + esc(p.nom) : ""},</p><p>${esc(intro)}</p>
<table style="border-collapse:collapse;background:#eef6f8;border-left:4px solid #0f4c5c;width:100%" cellpadding="8"><tr><td>
Adresse : <a href="${esc(url)}">${esc(url)}</a><br>Guide (PDF) : <a href="${esc(url)}guide-utilisateur.pdf">guide-utilisateur.pdf</a><br>
Identifiant : <b>${esc(p.ident.toUpperCase())}</b><br>Mot de passe provisoire : <b style="font-family:monospace;font-size:17px">${esc(p.pwd)}</b><br>
Profil : ${esc(ROLE_LAB[p.role] ?? p.role)} · Terminaux : ${esc(T)}</td></tr></table>
<p>À la première connexion, l'application vous demande de choisir votre propre mot de passe (6 caractères minimum). Merci de ne pas le partager.</p>
<p><b>Deux versions, même adresse</b></p><ul>${li("<b>Téléphone</b> : version simplifiée, affichée automatiquement. Liste des escales, avancement, vue « Par shift » (date + S1 / S2 / S3), rendement et mouvements par portique. Le bouton en haut (TCE / TC3) change de terminal.")}${li("<b>Ordinateur</b> : version complète avec tableaux détaillés, analyse" + (drv ? ", conducteurs" : "") + " et exports Excel / PDF. Depuis le téléphone, menu ☰ &gt; « Version complète » ; « Vue mobile » pour revenir.")}</ul>
<p><b>Installation (facultative, comme une application)</b></p><ul>${li("Android (Chrome) : menu ⋮ &gt; « Installer l'application » ou « Ajouter à l'écran d'accueil ».")}${li("iPhone (Safari) : bouton Partager &gt; « Sur l'écran d'accueil ».")}${li("Ordinateur (Chrome / Edge) : icône « Installer » à droite de la barre d'adresse.")}</ul>
<p>Les données se mettent à jour automatiquement à chaque rapport horaire et de fin de shift.</p>
<p>Cordialement,<br><b>Driss FELLAH IDRISSI</b><br>Chef de la Division Exploitation – Terminal TC3</p></div>`;
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { email: from, name: Deno.env.get("BREVO_SENDER_NAME") || "Suivi des escales" }, to: [{ email: p.to, name: p.nom || undefined }],
        subject: "Accès à l'application Suivi des escales (TCE / TC3)", htmlContent: html, textContent: text }),
    });
    if (r.ok) return "envoye";
    const j = await r.json().catch(() => ({}));
    return "erreur : " + (j.message || r.status);
  } catch (e) { return "erreur : " + String((e as Error).message ?? e); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST uniquement" }, 405);
  try {
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    if (!u?.user) return json({ error: "Non connecté" }, 401);
    const { data: me } = await sb.from("profiles").select("role,actif").eq("user_id", u.user.id).maybeSingle();
    if (!me || !me.actif || me.role !== "admin") return json({ error: "Réservé aux administrateurs" }, 403);
    const b = await req.json();
    const self = u.user.id;

    if (b.action === "list") {
      const { data, error } = await sb.from("profiles").select("*").order("created_at");
      if (error) return json({ error: error.message }, 400);
      const { data: l } = await sb.auth.admin.listUsers({ perPage: 1000 });
      const last = new Map((l?.users ?? []).map((x: any) => [x.id, x.last_sign_in_at]));
      return json({ users: (data ?? []).map((p: any) => ({ ...p, derniere_connexion: last.get(p.user_id) ?? null, moi: p.user_id === self })) });
    }

    if (b.action === "create") {
      const ident = normId(b.identifiant);
      if (!okId(ident)) return json({ error: "Identifiant invalide : 3 à 30 caractères (lettres, chiffres, point, tiret), ex. fellah" }, 400);
      const email = `${ident}@${DOMAINE}`;
      const mail0 = normMail(b.email_contact);
      if (!okMail(mail0)) return json({ error: "Adresse e-mail invalide" }, 400);
      const { data: ex } = await sb.from("profiles").select("user_id").eq("identifiant", ident).maybeSingle();
      if (ex) return json({ error: "Cet identifiant existe déjà" }, 400);
      if (!ROLES.includes(b.role)) return json({ error: "Rôle invalide" }, 400);
      if (!okTerms(b.terminaux)) return json({ error: "Choisir au moins un terminal (TCE, TC3)" }, 400);
      if (!okPwd(b.password)) return json({ error: "Mot de passe provisoire : 6 caractères minimum" }, 400);
      const { data: c, error } = await sb.auth.admin.createUser({ email, password: b.password, email_confirm: true });
      if (error || !c?.user) return json({ error: error?.message ?? "Création impossible" }, 400);
      const { error: e2 } = await sb.from("profiles").insert({ user_id: c.user.id, email, identifiant: ident, nom: String(b.nom || "").trim() || null, email_contact: mail0 || null, role: b.role, terminaux: b.terminaux, doit_changer_mdp: true });
      if (e2) { await sb.auth.admin.deleteUser(c.user.id); return json({ error: e2.message }, 400); }
      const mail = b.envoyer === false ? "non_demande" : await envoyerAcces({ to: mail0, nom: String(b.nom || "").trim(), ident, pwd: b.password, role: b.role, terminaux: b.terminaux, appUrl: okUrl(b.app_url) ? b.app_url : "" });
      return json({ ok: true, user_id: c.user.id, mail });
    }

    const id = String(b.user_id || "");
    if (!id) return json({ error: "Compte non précisé" }, 400);

    if (b.action === "update") {
      const patch: Record<string, unknown> = {};
      if (b.nom !== undefined) patch.nom = String(b.nom).trim() || null;
      if (b.role !== undefined) { if (!ROLES.includes(b.role)) return json({ error: "Rôle invalide" }, 400); patch.role = b.role; }
      if (b.terminaux !== undefined) { if (!okTerms(b.terminaux)) return json({ error: "Au moins un terminal" }, 400); patch.terminaux = b.terminaux; }
      if (b.actif !== undefined) patch.actif = !!b.actif;
      if (b.email_contact !== undefined) { const m = normMail(b.email_contact); if (!okMail(m)) return json({ error: "Adresse e-mail invalide" }, 400); patch.email_contact = m || null; }
      if (b.identifiant !== undefined) {
        const ident = normId(b.identifiant);
        if (!okId(ident)) return json({ error: "Identifiant invalide : 3 à 30 caractères (lettres, chiffres, point, tiret)" }, 400);
        const { data: ex } = await sb.from("profiles").select("user_id").eq("identifiant", ident).neq("user_id", id).maybeSingle();
        if (ex) return json({ error: "Cet identifiant existe déjà" }, 400);
        const email = `${ident}@${DOMAINE}`;
        const { error: e0 } = await sb.auth.admin.updateUserById(id, { email, email_confirm: true });
        if (e0) return json({ error: e0.message }, 400);
        patch.identifiant = ident; patch.email = email;
      }
      if (id === self && ((patch.role && patch.role !== "admin") || patch.actif === false)) return json({ error: "Vous ne pouvez pas retirer vos propres droits d'administrateur ni désactiver votre compte." }, 400);
      const { error } = await sb.from("profiles").update(patch).eq("user_id", id);
      if (error) return json({ error: error.message }, 400);
      if (b.actif !== undefined) await sb.auth.admin.updateUserById(id, { ban_duration: b.actif ? "none" : "876000h" });
      return json({ ok: true });
    }

    if (b.action === "reset") {
      if (!okPwd(b.password)) return json({ error: "Mot de passe provisoire : 6 caractères minimum" }, 400);
      const { error } = await sb.auth.admin.updateUserById(id, { password: b.password });
      if (error) return json({ error: error.message }, 400);
      await sb.from("profiles").update({ doit_changer_mdp: true }).eq("user_id", id);
      const { data: pr } = await sb.from("profiles").select("*").eq("user_id", id).maybeSingle();
      const mail = b.envoyer === false || !pr ? "non_demande" : await envoyerAcces({ to: pr.email_contact || "", nom: pr.nom || "", ident: pr.identifiant || String(pr.email).split("@")[0], pwd: b.password, role: pr.role, terminaux: pr.terminaux, appUrl: okUrl(b.app_url) ? b.app_url : "" });
      return json({ ok: true, mail });
    }

    if (b.action === "delete") {
      if (id === self) return json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, 400);
      const { error } = await sb.auth.admin.deleteUser(id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
