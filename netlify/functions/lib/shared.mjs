export const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

const EMAIL = /^[^\s@]+@gmail\.com$/i;

export function validate(p) {
  if (!p || typeof p !== "object") return [null, "Format data tidak valid."];
  const keys = ["fullName", "email", "university", "major", "semester", "motivation", "expectation"];
  if (keys.some((k) => !["string", "number"].includes(typeof p[k]))) return [null, "Lengkapi semua bagian formulir."];
  const d = Object.fromEntries(keys.map((k) => [k, String(p[k]).trim()]));
  const max = { fullName: 100, email: 254, university: 150, major: 120, motivation: 500, expectation: 500 };
  if (Object.entries(max).some(([k, n]) => d[k].length > n)) return [null, "Ada jawaban yang melebihi batas karakter."];
  if (d.fullName.length < 3) return [null, "Nama lengkap minimal 3 karakter."];
  if (!EMAIL.test(d.email)) return [null, "Gunakan alamat email dengan domain @gmail.com."];
  if (d.university.length < 2 || d.major.length < 2) return [null, "Universitas dan jurusan wajib diisi dengan benar."];
  const s = Number(d.semester);
  if (!Number.isInteger(s) || s < 1 || s > 14 || String(s) !== d.semester) return [null, "Pilih semester yang tersedia."];
  if (d.motivation.length < 20 || d.expectation.length < 20) return [null, "Jawaban esai minimal 20 karakter."];
  return [{ ...d, email: d.email.toLowerCase(), semester: s }, null];
}

export function isAdmin(req) {
  const pw = process.env.ADMIN_PASSWORD;
  const h = req.headers.get("authorization") || "";
  if (!pw || !h.startsWith("Basic ")) return false;
  const [user, ...rest] = Buffer.from(h.slice(6), "base64").toString().split(":");
  const given = rest.join(":");
  return user === "admin" && given.length === pw.length && [...pw].every((c, i) => c === given[i]);
}

export const SYSTEM_PROMPT =
  "Kamu adalah asisten AI untuk situs pendaftaran Beyond Code, bertenaga Gemini. Jawab dalam bahasa Indonesia, ramah, singkat (maksimal 4 kalimat), dan jelas. " +
  "Fakta formulir: data diri (nama lengkap min. 3 karakter, Gmail @gmail.com, universitas, jurusan, semester 1-14) dan dua esai (alasan tertarik mengikuti Beyond Code, harapan satu tahun ke depan), masing-masing 20-500 karakter. " +
  "Satu email hanya bisa mendaftar sekali. Setelah mengirim, peserta diarahkan bergabung ke grup WhatsApp. Data hanya dipakai untuk proses pendaftaran. " +
  "Jika ditanya jadwal, biaya, atau hal lain yang tidak kamu ketahui, katakan terus terang bahwa kamu belum punya informasinya dan sarankan menghubungi penyelenggara. Jangan mengarang.";
