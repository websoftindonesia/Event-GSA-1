#!/usr/bin/env python3
"""Web app Beyond Code: pendaftaran (SQLite), dashboard admin, dan chatbot Gemini. Tanpa dependensi."""
from __future__ import annotations

import base64, csv, hmac, io, json, os, re, secrets, sqlite3, threading, time, urllib.error, urllib.request
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "beyond_code.db"
MAX_BODY = 20_000
EMAIL_PATTERN = re.compile(r"^[^\s@]+@gmail\.com$", re.IGNORECASE)


def load_env() -> None:
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(9)
ADMIN_GENERATED = "ADMIN_PASSWORD" not in os.environ and not os.environ.get("ADMIN_PASSWORD")

SYSTEM_PROMPT = (
    "Kamu adalah asisten AI untuk situs pendaftaran Beyond Code, bertenaga Gemini. Jawab dalam bahasa Indonesia, "
    "ramah, singkat (maksimal 4 kalimat), dan jelas. Fakta formulir: data diri (nama lengkap min. 3 karakter, "
    "Gmail @gmail.com, universitas, jurusan, semester 1-14) dan dua esai (alasan tertarik mengikuti Beyond Code, "
    "harapan satu tahun ke depan), masing-masing 20-500 karakter. Satu email hanya bisa mendaftar sekali. "
    "Data hanya dipakai untuk proses pendaftaran. Jika ditanya jadwal, biaya, atau hal lain yang tidak kamu ketahui, "
    "katakan terus terang bahwa kamu belum punya informasinya dan sarankan menghubungi penyelenggara. Jangan mengarang."
)


def db() -> sqlite3.Connection:
    return sqlite3.connect(DB_PATH, timeout=10)


def initialize_database() -> None:
    with closing(db()) as con, con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute(
            """CREATE TABLE IF NOT EXISTS registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE UNIQUE,
                university TEXT NOT NULL,
                major TEXT NOT NULL,
                semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 14),
                motivation TEXT NOT NULL,
                expectation TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )


def validate(payload: object) -> tuple[dict[str, object] | None, str | None]:
    if not isinstance(payload, dict):
        return None, "Format data tidak valid."
    required = ("fullName", "email", "university", "major", "semester", "motivation", "expectation")
    if any(not isinstance(payload.get(key), (str, int)) for key in required):
        return None, "Lengkapi semua bagian formulir."
    data = {key: str(payload[key]).strip() for key in required}
    limits = {"fullName": 100, "email": 254, "university": 150, "major": 120, "motivation": 500, "expectation": 500}
    if any(len(data[key]) > limit for key, limit in limits.items()):
        return None, "Ada jawaban yang melebihi batas karakter."
    if len(data["fullName"]) < 3:
        return None, "Nama lengkap minimal 3 karakter."
    if not EMAIL_PATTERN.fullmatch(data["email"]):
        return None, "Gunakan alamat email dengan domain @gmail.com."
    if len(data["university"]) < 2 or len(data["major"]) < 2:
        return None, "Universitas dan jurusan wajib diisi dengan benar."
    try:
        semester = int(data["semester"])
    except ValueError:
        return None, "Pilih semester yang tersedia."
    if not 1 <= semester <= 14 or str(semester) != data["semester"]:
        return None, "Pilih semester yang tersedia."
    if len(data["motivation"]) < 20 or len(data["expectation"]) < 20:
        return None, "Jawaban esai minimal 20 karakter."
    data["semester"] = semester
    return data, None


_hits: dict[str, list[float]] = {}
_hits_lock = threading.Lock()


def rate_limited(ip: str, limit: int = 20, window: int = 60) -> bool:
    now = time.time()
    with _hits_lock:
        recent = [t for t in _hits.get(ip, []) if now - t < window]
        recent.append(now)
        _hits[ip] = recent
        return len(recent) > limit


def ask_gemini(history: object) -> str:
    if not isinstance(history, list):
        raise ValueError("Format percakapan tidak valid.")
    contents = []
    for item in history[-12:]:
        if isinstance(item, dict) and isinstance(item.get("text"), str) and item.get("role") in ("user", "assistant"):
            contents.append({"role": "user" if item["role"] == "user" else "model", "parts": [{"text": item["text"][:1000]}]})
    if not contents or contents[-1]["role"] != "user":
        raise ValueError("Pesan kosong.")
    body = json.dumps({"systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]}, "contents": contents,
                       "generationConfig": {"maxOutputTokens": 600, "temperature": 0.6}}).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent", data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY}, method="POST")
    with urllib.request.urlopen(req, timeout=25) as res:
        result = json.loads(res.read())
    parts = result.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    text = "".join(p.get("text", "") for p in parts).strip()
    return text or "Maaf, saya belum bisa menjawab itu. Coba tanyakan dengan cara lain."


STATIC = {"/styles.css": "text/css; charset=utf-8", "/app.js": "text/javascript; charset=utf-8", "/fx.js": "text/javascript; charset=utf-8",
          "/gemini-mark.svg": "image/svg+xml", "/admin": "text/html; charset=utf-8", "/": "text/html; charset=utf-8"}
STATIC_FILES = {"/": "index.html", "/admin": "admin.html"}
PHOTO_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


class Handler(BaseHTTPRequestHandler):
    server_version = "BeyondCode/2.0"

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")

    def send_bytes(self, status: int, body: bytes, ctype: str, extra: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status: int, result: dict) -> None:
        self.send_bytes(status, json.dumps(result, ensure_ascii=False).encode(), "application/json; charset=utf-8", {"Cache-Control": "no-store"})

    def is_admin(self) -> bool:
        header = self.headers.get("Authorization", "")
        if header.startswith("Basic "):
            try:
                user, _, pw = base64.b64decode(header[6:]).decode().partition(":")
                return hmac.compare_digest(user, "admin") and hmac.compare_digest(pw, ADMIN_PASSWORD)
            except Exception:
                return False
        return False

    def require_admin(self) -> bool:
        if self.is_admin():
            return True
        self.send_bytes(401, "Login diperlukan.".encode(), "text/plain; charset=utf-8",
                        {"WWW-Authenticate": 'Basic realm="Beyond Code Admin", charset="UTF-8"'})
        return False

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path in ("/admin", "/api/admin/registrations", "/admin/export.csv") and not self.require_admin():
            return
        if path == "/api/admin/registrations":
            with closing(db()) as con:
                con.row_factory = sqlite3.Row
                rows = [dict(r) for r in con.execute("SELECT * FROM registrations ORDER BY id DESC")]
            return self.send_json(200, {"items": rows})
        if path == "/admin/export.csv":
            with closing(db()) as con:
                rows = con.execute("SELECT id,full_name,email,university,major,semester,motivation,expectation,created_at FROM registrations ORDER BY id").fetchall()
            out = io.StringIO()
            writer = csv.writer(out)
            writer.writerow(["id", "nama", "email", "universitas", "jurusan", "semester", "motivasi", "harapan", "waktu_daftar_utc"])
            for row in rows:  # cegah CSV injection
                writer.writerow([("'" + c) if isinstance(c, str) and c[:1] in "=+-@" else c for c in row])
            return self.send_bytes(200, ("\ufeff" + out.getvalue()).encode("utf-8"), "text/csv; charset=utf-8",
                                   {"Content-Disposition": 'attachment; filename="pendaftar-beyond-code.csv"', "Cache-Control": "no-store"})
        if path.startswith("/foto-saya") and path.rsplit(".", 1)[-1].lower() in ("jpg", "jpeg", "png", "webp") or path == "/foto-saya":
            for ext, ctype in PHOTO_TYPES.items():
                photo = ROOT / f"foto-saya.{ext}"
                if photo.is_file():
                    return self.send_bytes(200, photo.read_bytes(), ctype, {"Cache-Control": "no-cache"})
            return self.send_error(404)
        if path == "/index.html":
            path = "/"
        if path not in STATIC:
            return self.send_error(404)
        try:
            content = (ROOT / STATIC_FILES.get(path, path.lstrip("/"))).read_bytes()
        except OSError:
            return self.send_error(404)
        self.send_bytes(200, content, STATIC[path], {"Referrer-Policy": "strict-origin-when-cross-origin"})

    def do_POST(self) -> None:
        route = urlparse(self.path).path
        if route not in ("/api/registrations", "/api/chat"):
            return self.send_json(404, {"error": "Alamat tidak ditemukan."})
        if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
            return self.send_json(415, {"error": "Format pengiriman tidak didukung."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            return self.send_json(413, {"error": "Ukuran data tidak valid."})
        try:
            payload = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self.send_json(400, {"error": "Data yang dikirim tidak valid."})

        if route == "/api/chat":
            if not GEMINI_KEY:
                return self.send_json(503, {"error": "Chatbot belum aktif. Isi GEMINI_API_KEY di file .env lalu jalankan ulang server."})
            if rate_limited(self.client_address[0]):
                return self.send_json(429, {"error": "Terlalu banyak pesan. Tunggu sebentar."})
            try:
                return self.send_json(200, {"reply": ask_gemini(payload.get("messages") if isinstance(payload, dict) else None)})
            except ValueError as exc:
                return self.send_json(400, {"error": str(exc)})
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                print(f"Gemini error: {exc}")
                return self.send_json(502, {"error": "Chatbot sedang tidak dapat dihubungi. Coba lagi nanti."})

        data, error = validate(payload)
        if error:
            return self.send_json(400, {"error": error})
        assert data is not None
        try:
            with closing(db()) as con, con:
                con.execute(
                    "INSERT INTO registrations (full_name,email,university,major,semester,motivation,expectation,created_at) VALUES (?,?,?,?,?,?,?,?)",
                    (data["fullName"], str(data["email"]).lower(), data["university"], data["major"], data["semester"],
                     data["motivation"], data["expectation"], datetime.now(timezone.utc).isoformat(timespec="seconds")))
        except sqlite3.IntegrityError:
            return self.send_json(409, {"error": "Email ini sudah pernah digunakan untuk mendaftar."})
        self.send_json(201, {"message": "Pendaftaran berhasil disimpan."})


if __name__ == "__main__":
    initialize_database()
    host, port = "127.0.0.1", 8000
    print(f"Beyond Code   : http://{host}:{port}")
    print(f"Dashboard data: http://{host}:{port}/admin  (user: admin | password: {ADMIN_PASSWORD})")
    if ADMIN_GENERATED:
        print("  ! ADMIN_PASSWORD belum diatur di .env, password acak ini berubah tiap server dijalankan.")
    print("Chatbot Gemini: " + ("aktif" if GEMINI_KEY else "NONAKTIF (isi GEMINI_API_KEY di .env)"))
    try:
        ThreadingHTTPServer((host, port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\nServer dihentikan.")