// Edge Function "admin-users" : gestion des comptes (réservée aux administrateurs de l'application).
// Créer : Edge Functions > Deploy a new function > nom exact : admin-users > coller ce code > Deploy.
// « Verify JWT » : LAISSER ACTIVÉ (la fonction vérifie en plus que l'appelant est administrateur).
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
      const mail = normMail(b.email_contact);
      if (!okMail(mail)) return json({ error: "Adresse e-mail invalide" }, 400);
      const { data: ex } = await sb.from("profiles").select("user_id").eq("identifiant", ident).maybeSingle();
      if (ex) return json({ error: "Cet identifiant existe déjà" }, 400);
      if (!ROLES.includes(b.role)) return json({ error: "Rôle invalide" }, 400);
      if (!okTerms(b.terminaux)) return json({ error: "Choisir au moins un terminal (TCE, TC3)" }, 400);
      if (!okPwd(b.password)) return json({ error: "Mot de passe provisoire : 6 caractères minimum" }, 400);
      const { data: c, error } = await sb.auth.admin.createUser({ email, password: b.password, email_confirm: true });
      if (error || !c?.user) return json({ error: error?.message ?? "Création impossible" }, 400);
      const { error: e2 } = await sb.from("profiles").insert({ user_id: c.user.id, email, identifiant: ident, nom: String(b.nom || "").trim() || null, email_contact: mail || null, role: b.role, terminaux: b.terminaux, doit_changer_mdp: true });
      if (e2) { await sb.auth.admin.deleteUser(c.user.id); return json({ error: e2.message }, 400); }
      return json({ ok: true, user_id: c.user.id });
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
      return json({ ok: true });
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
