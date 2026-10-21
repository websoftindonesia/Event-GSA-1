import { json, SYSTEM_PROMPT } from "../lib/shared.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Metode tidak didukung." });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return json(503, { error: "Chatbot belum aktif. Isi GEMINI_API_KEY di pengaturan environment Netlify." });
  }

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return json(400, { error: "Data yang dikirim tidak valid." });
  }

  const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
  const contents = rawMessages
    .slice(-12)
    .filter((m) => m && typeof m.text === "string" && ["user", "assistant"].includes(m.role))
    .map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: String(m.text).slice(0, 1000) }]
    }));

  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return json(400, { error: "Pesan kosong." });
  }

  const model = "gemini-1.5-flash";

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT || "Kamu adalah asisten pendaftaran." }]
        },
        contents: contents
      })
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);
      return json(502, { error: "Gagal terhubung ke layanan Gemini." });
    }

    const data = await geminiRes.json();
    const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya belum bisa menjawab itu.";
    
    return json(200, { reply: replyText });
  } catch (e) {
    console.error("Chat exception:", e);
    return json(500, { error: "Terjadi kesalahan pada server." });
  }
};
