import os
from flask import Flask, jsonify, redirect, render_template, request, url_for
from pymongo import MongoClient

app = Flask(__name__)

# Mengambil URI dari Environment Variable (atau masukkan langsung string URI Anda jika untuk testing lokal)
# Contoh: mongodb+srv://username:password@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
MONGO_URI = os.environ.get("MONGODB_URI")

# Inisialisasi koneksi MongoClient
client = MongoClient(MONGO_URI)

# Pilih database dan collection (tabel)
db = client["beyond_code"]  # Nama database
pendaftar_collection = db["pendaftar"]  # Nama collection


@app.route("/", methods=["GET", "POST"])
def index():
  if request.method == "POST":
    # Ambil data dari form HTML
    data_pendaftar = {
        "nama": request.form.get("nama"),
        "email": request.form.get("email"),
        "universitas": request.form.get("universitas"),
        "jurusan": request.form.get("jurusan"),
        "semester": request.form.get("semester"),
        "mengapa_tertarik": request.form.get("mengapa_tertarik"),
        "harapan": request.form.get("harapan"),
    }

    # Simpan data ke MongoDB Atlas
    pendaftar_collection.insert_one(data_pendaftar)

    return redirect(url_for("index"))

  return render_template("index.html")


@app.route("/admin")
def admin_page():
  # Ambil seluruh data pendaftar dari MongoDB Atlas
  # Kita ubah cursor menjadi list agar bisa dibaca oleh template HTML
  pendaftar_list = list(pendaftar_collection.find())

  # Jika template admin.html Anda menggunakan ObjectId, kita bisa biarkan atau ubah formatnya.
  # Di sini data dikirim langsung ke template.
  return render_template("admin.html", pendaftar=pendaftar_list)


if __name__ == "__main__":
  app.run(debug=True, port=8080)