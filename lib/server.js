import "server-only";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "alusaf_session";
const MAX_AGE = 60 * 60 * 24 * 7;
let client;

export function db() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Vercel: Supabase URL yoki server secret key yetishmayapti");
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return client;
}

function jwtSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET kamida 32 belgi bo'lishi kerak");
  return new TextEncoder().encode(value);
}

export function usernameOf(value) {
  return String(value || "").trim().toLowerCase();
}

export async function ensureFirstAdmin() {
  const { data: admins, error } = await db().from("crm_users")
    .select("id").eq("role", "admin").limit(1);
  if (error) throw error;
  if (admins.length) return;
  const username = usernameOf(process.env.ADMIN_INITIAL_USERNAME);
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!username || !password) throw new Error("Vercel: ADMIN_INITIAL_USERNAME / PASSWORD yetishmayapti");
  const { data: reserved, error: lookupError } = await db().from("crm_users")
    .select("id").eq("username", username).maybeSingle();
  if (lookupError) throw lookupError;
  if (reserved) throw new Error("Admin nomi band. Supabase crm_users jadvalini tekshiring");
  const password_hash = await bcrypt.hash(password, 12);
  const { error: insertError } = await db().from("crm_users").insert({
    username, full_name: "Asosiy administrator", password_hash, role: "admin"
  });
  if (insertError && insertError.code !== "23505") throw insertError;
}

export async function setSession(user) {
  const token = await new SignJWT({ role: user.role, version: user.session_version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/", maxAge: MAX_AGE
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    const { data, error } = await db().from("crm_users")
      .select("id,username,full_name,phone,role,active,session_version")
      .eq("id", payload.sub).maybeSingle();
    if (error || !data || !data.active || data.session_version !== payload.version) return null;
    return data;
  } catch { return null; }
}

export function isBoss(user) { return user && ["admin", "boss"].includes(user.role); }
export function requireNumber(v, name, allowZero = false) {
  const n = Number(v);
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0))
    throw new Error(name + ": musbat son kiriting");
  return n;
}
export function result(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
