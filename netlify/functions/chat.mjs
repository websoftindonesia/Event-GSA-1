import { json, SYSTEM_PROMPT } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Metode tidak didukung." });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return json(503, { error: "Chatbot belum aktif. Isi GEMINI_API_KEY di pengaturan environment Netlify." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Data yang dikirim tidak valid." }); }

  const contents = (Array.isArray(body?.messages) ? body.messages : []).slice(-12)
    .filter((m) => m && typeof m.text === "string" && ["user", "assistant"].includes(m.role))
    .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text.slice(0, 1000) }] }));

  if (!contents.length || contents.at(-1).role !== "user") return json(400, { error: "Pesan kosong." });

  // Menggunakan model standar gemini-1.5-flash dengan endpoint resmi
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: contents
      }),
      signal: AbortSignal.timeout(25000)
    });

    if (!res.ok) {
      console.error("Gemini error status:", res.status, await res.text());
      return json(502, { error: "Chatbot sedang tidak dapat dihubungi. Coba lagi nanti." });
    }

    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
    return json(200, { reply: text || "Maaf, saya belum bisa menjawab itu. Coba tanyakan dengan cara lain." });
  } catch (e) {
    console.error("Gemini fetch exception:", e);
    return json(502, { error: "Chatbot sedang tidak dapat dihubungi. Coba lagi nanti." });
  }
};
