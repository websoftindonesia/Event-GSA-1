import { getStore } from "@netlify/blobs";
import { json, validate } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Metode tidak didukung." });
  let payload;
  try { payload = await req.json(); } catch { return json(400, { error: "Data yang dikirim tidak valid." }); }
  const [data, error] = validate(payload);
  if (error) return json(400, { error });
  const store = getStore("registrations");
  if (await store.get(data.email)) return json(409, { error: "Email ini sudah pernah digunakan untuk mendaftar." });
  await store.setJSON(data.email, { ...data, created_at: new Date().toISOString() });
  return json(201, { message: "Pendaftaran berhasil disimpan." });
};

export const config = { path: "/api/registrations" };
