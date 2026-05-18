#!/usr/bin/env node
/**
 * Trial REST + Storage against values in .env (strips CR/BOM like the app).
 * Usage: node scripts/verify-supabase.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) {
    console.warn("No .env file — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in env.");
    return out;
  }
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    v = v.replace(/^\uFEFF/, "").replace(/\r/g, "").trim();
    out[k] = v;
  }
  return out;
}

function normUrl(u) {
  return u.replace(/\r/g, "").replace(/^\uFEFF/, "").trim().replace(/\/+$/, "");
}

const env = { ...process.env, ...parseEnv(envPath) };
const URL = normUrl(env.VITE_SUPABASE_URL || "");
const KEY = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "")
  .replace(/\r/g, "")
  .replace(/^\uFEFF/, "")
  .trim();

if (!URL || !KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

async function main() {
  console.log("URL:", URL);
  console.log("Key prefix:", KEY.slice(0, 20) + "…");

  const g = await fetch(`${URL}/rest/v1/watermark_audio?select=id&limit=1`, { headers });
  console.log("\nGET watermark_audio:", g.status, g.ok ? "OK" : await g.text());

  const trialPath = `watermarks/_verify_${Date.now()}.bin`;
  const put = await fetch(`${URL}/storage/v1/object/audio/${trialPath}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/octet-stream" },
    body: new Uint8Array([1, 2, 3]),
  });
  const putText = put.ok ? await put.json().catch(() => ({})) : await put.text();
  console.log("POST storage object:", put.status, putText);

  if (put.ok) {
    const del = await fetch(`${URL}/storage/v1/object/audio/${trialPath}`, {
      method: "DELETE",
      headers,
    });
    console.log("DELETE trial object:", del.status, del.ok ? "OK" : await del.text());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
