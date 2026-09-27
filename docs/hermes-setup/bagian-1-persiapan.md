# Bagian 1: Persiapan (manual, di terminal)

[Daftar bagian](../hermes-setup-guide.md) · Berikutnya: [Bagian 2](bagian-2-fondasi.md)

**Tujuan:** Menyiapkan akun luar, profile Hermes `qudamah`, nomor WhatsApp bot, repo dan rahasia. Bagian ini **tidak lewat chat**: scan QR, isi rahasia dan restart gateway harus Anda lakukan sendiri.

**Syarat mulai:** Akses SSH ke VPS.

---

## A. Siapkan dulu (di luar VPS)

- [ ] **Nomor WhatsApp khusus bot** di HP kedua (WhatsApp atau WhatsApp Business
      sudah aktif di nomor itu). Jangan pakai nomor pribadi atau nomor bot yang sudah ada.
- [ ] **HP tes** dengan nomor **6287720742631**.
- [ ] **API key OpenCode** (boleh sama dengan yang dipakai profile Hermes Anda sekarang).
- [ ] **Google service account** untuk membaca Google Sheets:
  1. Google Cloud Console → buat atau pilih project → aktifkan **Google Sheets API**.
  2. IAM & Admin → Service Accounts → buat service account → tab Keys → Add key → JSON.
     Simpan file JSON-nya (nanti diberi nama `google-sa.json`).
  3. Buka kedua spreadsheet (sheet VS dan META ADS) → Share → tambahkan email service
     account (`...@...iam.gserviceaccount.com`) sebagai **Viewer**.
  4. Catat ID atau URL spreadsheet yang sedang dipakai.
- [ ] **Accurate Online**:
  1. Buka credential Accurate di n8n dan catat: Client ID, Client Secret, **Scope**,
     Authorization URL, Access Token URL, dan cara autentikasinya (header/body).
  2. Di portal developer Accurate, pada aplikasi OAuth yang sama, **tambahkan redirect
     URI** `http://localhost:8765/callback`.
- [ ] **n8n**: Settings → n8n API → buat API key. Catat juga URL n8n Anda dan ID
      workflow (angka/kode di URL saat workflow dibuka).

Tidak perlu memasang Node.js atau Chromium sendiri: keduanya dipasang oleh Hermes
(`hermes pm`).

---

## B. Persiapan Hermes [MANUAL]

### B1. Cek versi dan backup

```bash
hermes --version                                   # harus v0.21.5
hermes backup -o ~/hermes-backup-sebelum-qudamah.zip
hermes gateway status
```

### B2. Buat profile baru dan pilih model

```bash
hermes profile create qudamah      # JANGAN pakai --clone (supaya memory profile lain tidak ikut)
qudamah model                      # pilih OpenCode (Go atau Zen), masukkan API key, pilih model DeepSeek
```

### B3. Pengaturan dasar (WAJIB sebelum pairing WhatsApp)

```bash
qudamah config set timezone Asia/Jakarta
qudamah config set whatsapp.bridge_port 3001
qudamah config set whatsapp.unauthorized_dm_behavior ignore
qudamah config set platform_toolsets.whatsapp '["skills", "clarify"]'
qudamah config set agent.disabled_toolsets '["memory"]'
qudamah config set auxiliary.background_review.enabled false

qudamah config get whatsapp.bridge_port            # harus 3001
ss -ltn | grep ':3001' || echo "port 3001 bebas"
```

Kenapa:

- **Port 3001**: bridge WhatsApp Hermes memakai port 3000 secara default. Kalau profile
  lama Anda sudah memakai WhatsApp di port 3000, profile baru bisa "menumpang" ke
  bridge itu dan mengirim laporan dari nomor yang salah.
- **Toolset WhatsApp dibatasi**: owner dan tim akan chat dengan bot ini. Tanpa batasan
  ini, siapa pun yang diizinkan chat bisa menyuruh bot menjalankan perintah di VPS atau
  membaca file rahasia.
- **Memory jangka panjang dimatikan**: catatan dari sesi build (lokasi file, konfigurasi)
  tidak ikut terbawa ke chat WhatsApp, dan isi chat satu anggota tim tidak muncul di chat
  anggota lain. Pertanyaan lanjutan tetap nyambung karena memakai riwayat percakapan.
- **Background review dimatikan**: fitur otomatis Hermes yang, setelah tiap percakapan,
  bisa menyimpan memory dan membuat atau mengubah skill. Untuk bot tim ini, skill hanya
  boleh diubah lewat tahap build. Bonus: hemat token.

Kalau perintah `qudamah` tidak ditemukan, pakai bentuk panjangnya: `hermes -p qudamah ...`.

### B4. Pairing nomor bot

```bash
qudamah whatsapp
```

- Mode: pilih **bot**.
- Allowed users: isi `6287720742631` (kode negara, tanpa `+` dan spasi).
- Scan QR dengan **HP nomor bot**: WhatsApp → Perangkat tertaut → Tautkan perangkat.
- Kalau Node.js belum ada, wizard ini memasangnya otomatis lewat Hermes.

### B5. Aktifkan dan tes

```bash
hermes gateway restart           # bot Anda yang lain ikut restart beberapa detik
hermes gateway status            # profile qudamah harus terlihat dilayani
ss -ltnp | grep -E ':(3000|3001)'
```

- Dari HP **6287720742631**, kirim "halo" ke nomor bot. Bot harus membalas.
- Kirim juga pesan ke bot lama Anda. Bot lama harus tetap membalas dari nomornya sendiri.

Catatan: jangan jalankan `qudamah gateway install`. Di v0.21.5 itu memang ditolak;
gateway utama yang melayani semua profile.

---

## C. Folder, repo, dan rahasia [MANUAL]

### C1. Folder dan repo

```bash
QR=~/.hermes/profiles/qudamah/qudamah-report
mkdir -p "$QR"/{bin,config,data,out,logs,fixtures,backup,secrets}
chmod 700 "$QR"/secrets "$QR"/fixtures

git clone https://github.com/zhafrantsanyy/financial-reporting-pipeline.git "$QR/repo"
cd "$QR/repo"
git checkout claude/great-euler-1zm3lk
git checkout -b hermes/migration
```

Kalau repo-nya private, `git clone` butuh login GitHub (token atau SSH key) di VPS.

### C2. Isi rahasia langsung ke file (bukan lewat chat)

Semua yang Anda ketik di chat Hermes dikirim ke penyedia AI (OpenCode/DeepSeek) dan
tersimpan di riwayat sesi. Karena itu kredensial ditulis langsung ke file, dan Hermes
hanya diberi tahu lokasinya.

```bash
nano "$QR/.env"
```

Isi (ganti bagian kosong):

```
ACCURATE_CLIENT_ID=
ACCURATE_CLIENT_SECRET=
ACCURATE_SCOPE=
ACCURATE_REDIRECT_URI=http://localhost:8765/callback
ACCURATE_AUTH_URL=https://account.accurate.id/oauth/authorize
ACCURATE_TOKEN_URL=https://account.accurate.id/oauth/token
GOOGLE_SA_PATH=/GANTI/dengan/hasil/perintah/di/bawah/google-sa.json
N8N_BASE_URL=
N8N_API_KEY=
N8N_WORKFLOW_ID=
```

`ACCURATE_SCOPE`, `ACCURATE_AUTH_URL` dan `ACCURATE_TOKEN_URL` disamakan dengan
credential di n8n. Untuk `GOOGLE_SA_PATH`, jalankan `echo "$QR/secrets/google-sa.json"`
dan salin hasilnya.

```bash
chmod 600 "$QR/.env"
```

### C3. Upload file service account Google

Dari laptop:

```bash
scp google-sa.json USER@IP-VPS:~/.hermes/profiles/qudamah/qudamah-report/secrets/google-sa.json
```

Lalu di VPS: `chmod 600 ~/.hermes/profiles/qudamah/qudamah-report/secrets/google-sa.json`

### C4. Cara membuka sesi Hermes untuk setiap tahap

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Setiap mulai tahap baru, keluar dari chat lalu jalankan dua baris ini lagi, supaya
sesinya bersih dan `AGENTS.md` terbaca otomatis. Kalau Hermes meminta izin untuk
perintah berbahaya, baca dulu perintahnya dan pilih **once** kalau yakin.

---

---

## Cek sebelum lanjut

- [ ] `hermes --version` menunjukkan v0.21.5 dan backup sudah dibuat
- [ ] `qudamah config get whatsapp.bridge_port` = 3001 (langkah B3)
- [ ] Bot membalas "halo" dari 6287720742631, dan bot lama tetap normal
- [ ] Repo ada di `$QR/repo` pada branch `hermes/migration`
- [ ] `$QR/.env` terisi (mode 600) dan `$QR/secrets/google-sa.json` ada (mode 600)
