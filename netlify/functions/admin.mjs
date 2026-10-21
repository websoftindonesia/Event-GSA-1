import { getStore } from "@netlify/blobs";
import { json, isAdmin } from "../lib/shared.mjs";

export default async (req) => {
  if (!process.env.ADMIN_PASSWORD) return json(503, { error: "ADMIN_PASSWORD belum diatur di environment Netlify." });
  if (!isAdmin(req)) return new Response("Login diperlukan.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Beyond Code Admin", charset="UTF-8"' } });
  const store = getStore("registrations");
  const { blobs } = await store.list();
  const rows = (await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })))).filter(Boolean)
    .sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r, i) => ({ id: i + 1, full_name: r.fullName, ...r }));
  const { pathname } = new URL(req.url);
  if (pathname.endsWith(".csv")) {
    const safe = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replaceAll('"', '""')}"`; };
    const head = ["id", "nama", "email", "universitas", "jurusan", "semester", "motivasi", "harapan", "waktu_daftar_utc"];
    const lines = rows.map((r) => [r.id, r.fullName, r.email, r.university, r.major, r.semester, r.motivation, r.expectation, r.created_at].map(safe).join(","));
    return new Response("\ufeff" + [head.join(","), ...lines].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="pendaftar-beyond-code.csv"', "Cache-Control": "no-store" } });
  }
  return json(200, { items: rows.reverse().map((r) => ({ id: r.id, full_name: r.fullName, email: r.email, university: r.university, major: r.major, semester: r.semester, motivation: r.motivation, expectation: r.expectation, created_at: r.created_at })) });
};

export const config = { path: ["/api/admin/registrations", "/admin/export.csv"] };
