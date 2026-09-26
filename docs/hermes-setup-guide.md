# Panduan Setup Laporan Qudamah di Hermes (step by step)

Panduan ini memindahkan workflow n8n ke profile Hermes baru bernama `qudamah` di VPS
Anda. Hermes sendiri yang menulis kode dan memasang semuanya, tahap demi tahap,
lewat prompt di bawah.

Dua jenis langkah:

- **[MANUAL]**: Anda jalankan sendiri di terminal VPS (SSH) atau di website lain.
  Ini untuk hal yang tidak bisa atau tidak boleh dilakukan Hermes: scan QR,
  mengisi rahasia, restart gateway.
- **[PROMPT]**: copy-paste ke Hermes di `qudamah chat`. Satu prompt = satu tahap.
  Tunggu Hermes selesai dan melapor sebelum mengirim prompt berikutnya.

Dokumen pendukung yang dibaca Hermes: [`AGENTS.md`](../AGENTS.md) (aturan kerja,
otomatis dimuat) dan [`vps-migration-plan.md`](vps-migration-plan.md) (spesifikasi
teknis; prompt di bawah merujuk ke nomor bagiannya).

---

## Bagian 0. Siapkan dulu (di luar VPS)

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

## Bagian 1. Persiapan Hermes [MANUAL]

### 1.1 Cek versi dan backup

```bash
hermes --version                                   # harus v0.21.5
hermes backup -o ~/hermes-backup-sebelum-qudamah.zip
hermes gateway status
```

### 1.2 Buat profile baru dan pilih model

```bash
hermes profile create qudamah      # JANGAN pakai --clone (supaya memory profile lain tidak ikut)
qudamah model                      # pilih OpenCode (Go atau Zen), masukkan API key, pilih model DeepSeek
```

### 1.3 Pengaturan dasar (WAJIB sebelum pairing WhatsApp)

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

### 1.4 Pairing nomor bot

```bash
qudamah whatsapp
```

- Mode: pilih **bot**.
- Allowed users: isi `6287720742631` (kode negara, tanpa `+` dan spasi).
- Scan QR dengan **HP nomor bot**: WhatsApp → Perangkat tertaut → Tautkan perangkat.
- Kalau Node.js belum ada, wizard ini memasangnya otomatis lewat Hermes.

### 1.5 Aktifkan dan tes

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

## Bagian 2. Folder, repo, dan rahasia [MANUAL]

### 2.1 Folder dan repo

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

### 2.2 Isi rahasia langsung ke file (bukan lewat chat)

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

### 2.3 Upload file service account Google

Dari laptop:

```bash
scp google-sa.json USER@IP-VPS:~/.hermes/profiles/qudamah/qudamah-report/secrets/google-sa.json
```

Lalu di VPS: `chmod 600 ~/.hermes/profiles/qudamah/qudamah-report/secrets/google-sa.json`

### 2.4 Cara membuka sesi Hermes untuk setiap tahap

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Setiap mulai tahap baru, keluar dari chat lalu jalankan dua baris ini lagi, supaya
sesinya bersih dan `AGENTS.md` terbaca otomatis. Kalau Hermes meminta izin untuk
perintah berbahaya, baca dulu perintahnya dan pilih **once** kalau yakin.

---

## Bagian 3. Build lewat prompt [PROMPT]

### PROMPT 1. Orientasi (tanpa kode)

```text
Kita mulai proyek migrasi laporan Qudamah dari n8n ke profile Hermes ini (qudamah).
Repo ada di ~/.hermes/profiles/qudamah/qudamah-report/repo, branch hermes/migration.

1. Baca AGENTS.md, lalu docs/vps-migration-plan.md (spesifikasi), docs/architecture.md,
   docs/engineering-notes.md dan src/README.md. Lihat daftar file di src/code-nodes/
   dan src/prompts/. Jangan membaca workflow JSON utuh.
2. Jangan menulis atau mengubah kode apa pun di tahap ini.
3. Balas dengan: (a) ringkasan arsitektur target maksimal 10 poin, (b) urutan tahap
   sesuai bagian 10 spesifikasi, (c) hal yang belum jelas atau yang kamu butuhkan dari saya.
```

### PROMPT 2. Runtime: Node, npm, Chromium

```text
Tahap 2: runtime. Ikuti bagian 4 spesifikasi.
1. Jalankan `hermes pm install node npm chromium`, lalu `hermes pm env node npm chromium`.
   Tunjukkan versi node, npm dan revisi chromium.
2. Pastikan folder $QR/{bin,config,data,out,logs,fixtures,backup,secrets} ada
   (izin 700 untuk secrets dan fixtures).
3. Buat wrapper $QR/bin/node dan $QR/bin/npm yang memakai Node milik Hermes: baca PATH
   dari `hermes pm env`, simpan di $QR/bin/.pm-env, resolve ulang otomatis kalau path-nya
   hilang setelah hermes update, fallback ke node di PATH.
4. Uji Chromium milik Hermes: cetak file HTML kecil ke PDF (headless, --print-to-pdf;
   tambahkan --no-sandbox hanya kalau berjalan sebagai root). Kalau gagal karena library
   sistem, JANGAN pasang apa pun: tampilkan error dan daftar paket apt yang dibutuhkan,
   lalu tunggu saya.
5. Laporkan hasilnya.
```

Kalau Hermes meminta paket apt, jalankan sendiri (misalnya `sudo apt install -y ...`)
lalu balas "sudah, lanjutkan tes PDF".

### PROMPT 3. Kerangka CLI

```text
Tahap 3: kerangka CLI qudamah-report di folder app/. Ikuti bagian 5.1, 5.2 dan 4 spesifikasi.
- Node ESM tanpa modul native. Penyimpanan node:sqlite di $QR/data/app.db (tabel kv,
  runs, tokens). Rahasia dibaca CLI sendiri dari $QR/.env (script cron Hermes tidak
  mewarisi environment). Jangan pernah menampilkan nilai rahasia.
- Konfigurasi dari $QR/config/app.json dan $QR/config/sources.json. Buat template
  app/config/*.example.json dan salin ke $QR/config/ bila belum ada. Isi app.json
  sesuai bagian 5.2 (mode test, nomor 6287720742631). Jangan menebak ID spreadsheet.
- Perintah: help, doctor (lengkap sesuai 5.1), dan perintah lain dari tabel 5.1 sebagai
  kerangka yang menjawab "belum diimplementasikan".
- Lock file, log ke $QR/logs, opsi --dry, kode keluar 0/1/2, uji gagal lewat file
  $QR/data/FORCE_FAIL (lihat 5.1).
- Wrapper $QR/bin/qudamah-report memanggil app/bin/qudamah-report.js dengan Node Hermes.
- Tes dengan node --test. Jalankan `$QR/bin/qudamah-report doctor` dan tunjukkan hasilnya.
- Commit.
```

### PROMPT 4. Ambil data n8n untuk bahan uji

```text
Tahap 4: perintah export-n8n. Ikuti bagian 5.5 spesifikasi. Kredensial n8n sudah ada
di $QR/.env.
1. Implementasikan export-n8n: simpan staticData workflow ke $QR/data/n8n-staticData.json
   dan eksekusi sukses terpilih ke $QR/fixtures/<executionId>/runData.json + meta.json.
2. Jalankan. Laporkan: jumlah eksekusi per jenis (harian, mingguan, /finance, /aiconsult),
   node Code yang tertangkap di tiap eksekusi, dan apakah staticData berisi snapshotAkun
   dan snapshotAwal (sebutkan kunci bulannya saja, tanpa angka).
3. Kalau staticData tidak ada di respons API, berhenti dan jelaskan pilihan lain.
4. Commit kodenya saja, bukan datanya.
```

### PROMPT 5. Accurate Online

```text
Tahap 5: klien Accurate dan login. Ikuti bagian 5.3 spesifikasi.
1. Implementasikan `auth accurate`, penyegaran token, sesi (db-list, open-db), dan list
   berhalaman untuk 4 endpoint. Ambil parameter query PERSIS dari workflow JSON dengan
   python atau jq, jangan dari ingatan. Bentuk keluaran sama dengan item n8n.
2. Tes unit dengan HTTP tiruan: berhenti saat d kosong, batas 50 halaman, jeda 300 ms,
   3 percobaan, gagal akhir menjadi hasil kosong + peringatan.
3. Jalankan `$QR/bin/qudamah-report auth accurate` dan beri tahu saya kapan harus membuka
   URL-nya. Saya akan menempelkan URL hasil redirect.
4. Setelah login berhasil, jalankan pengambilan data --dry dan laporkan jumlah baris per
   endpoint saja.
5. Commit.
```

Saat Hermes menampilkan URL: buka di browser laptop, login ke Accurate, setujui.
Browser akan pindah ke `http://localhost:8765/callback?code=...` dan halamannya
**gagal dimuat, itu normal**. Salin seluruh URL dari address bar dan tempel ke Hermes.

### PROMPT 6. Google Sheets

Isi dulu bagian `<...>` sebelum dikirim.

```text
Tahap 6: klien Google Sheets. Ikuti bagian 5.4 spesifikasi.
Spreadsheet yang dipakai sekarang: <ID atau URL spreadsheet 1>, <ID atau URL spreadsheet 2>.
1. Isi $QR/config/sources.json: tab VS dan META ADS per spreadsheet. Nama tab dan gid
   ambil dari workflow JSON bila cocok, kalau tidak tanyakan saya.
2. Baca dengan service account di GOOGLE_SA_PATH (akses read-only).
3. Buat konverter baris API ke item n8n yang sama persis dengan keluaran node Google
   Sheets n8n. Tentukan aturannya dari bukti di fixture (node "Sheet VS Juli",
   "Sheet VS Sept", "Meta ads Juli", "Sheet Meta ads Sept1"): nama kunci, row_number,
   sel kosong, tipe nilai, valueRenderOption.
4. Tes: bandingkan hasil baca langsung dengan fixture (kunci dan tipe per kolom, nilai
   untuk baris lama yang tidak berubah). Laporkan perbedaan yang tersisa.
5. Commit.
```

### PROMPT 7. Porting 15 node Code + uji paritas (tahap terpenting)

```text
Tahap 7: porting node Code dan uji paritas. Ikuti bagian 5.6 dan 7.1 spesifikasi.
1. Buat app/tools/wrap-code-nodes.mjs yang MEMBUNGKUS OTOMATIS setiap file
   src/code-nodes/*.js menjadi app/src/logic/<nama>.js tanpa mengubah isinya.
   Jangan menyalin atau mengedit logika dengan tangan.
2. Buat app/src/n8n-shim.js sesuai 5.6.
3. Buat uji paritas generik untuk setiap eksekusi di $QR/fixtures dan setiap node Code
   yang jalan di sana: input = keluaran node induk (lihat connections di workflow JSON),
   $() = runData eksekusi itu, $now dan Date dibekukan ke startedAt, hasil harus
   deep-equal dengan keluaran node di runData.
   - Coba TZ proses UTC dan Asia/Jakarta; laporkan mana yang cocok, lalu kunci di wrapper.
   - "Hitung Laba Rugi & Neraca": pakai staticData hasil ekspor pada eksekusi terbaru.
     Di eksekusi lama, hanya field baseline yang boleh beda, dan harus didaftar per field.
4. Laporkan tabel node x eksekusi: lulus/gagal, dan path field yang beda (tanpa angka).
5. Kalau gagal, perbaiki shim, pemuat fixture atau adaptor input. JANGAN ubah logika node.
   Kalau menurutmu logika memang harus berubah, berhenti dan tanya saya.
6. Commit.
```

Kalau tabelnya belum hijau semua, kirim: "Lanjutkan perbaikan paritas, aturan yang
sama." Ulangi sampai lulus atau sampai Hermes menjelaskan perbedaan yang memang wajar.

### PROMPT 8. Pipeline dan perintah laporan

```text
Tahap 8: pipeline dan perintah sales, finance, context, import-static. Ikuti bagian
5.7 dan 5.8 spesifikasi.
1. Buat app/src/pipeline/run.js sesuai 5.7: semua panggilan Accurate dan dua kelompok
   sheet paralel, finance selalu dihitung, snapshot hanya ditulis oleh run sukses tanpa --dry.
2. Implementasikan import-static lalu jalankan untuk $QR/data/n8n-staticData.json.
3. Perintah sales, finance dan context menulis file ke $QR/out/<tanggal>/ dan memperbarui
   ~/.hermes/profiles/qudamah/skills/aiconsult/references/konteks-terbaru.md.
4. Opsi --print persis seperti kontrak 5.8 (PDF menyusul di tahap 9; sementara pakai
   baris "PDF tidak tersedia").
5. Jalankan `sales --dry` dengan data asli. Ambil ulang eksekusi n8n pagi ini dengan
   export-n8n, lalu bandingkan teks laporan dan angka kunci dengan keluaran node
   "Hitung Metrik Harian" dan "Hitung Laba Rugi & Neraca". Laporkan yang beda saja.
6. Commit.
```

### PROMPT 9. PDF

```text
Tahap 9: PDF. Ikuti bagian 5.9 spesifikasi.
1. Render SalesHarianQudamah.html dan LaporanFinansialQudamah.html menjadi PDF dengan
   playwright-core dan Chromium milik Hermes.
2. Sisipkan stylesheet cetak saat render (jangan ubah generator HTML): semua tab tampil
   berurutan dengan judul tab, bar tab disembunyikan, page break antar bagian, kartu dan
   baris tabel tidak terpotong. Header "Qudamah · <judul> · <tanggal>", footer nomor halaman.
3. Gagal render tidak boleh menggagalkan laporan.
4. Sambungkan ke --print (baris MEDIA dan PDF_PATH sesuai 5.8).
5. Kirim kedua PDF ke nomor tes untuk dicek:
   hermes -p qudamah send --to whatsapp:+6287720742631 "Tes PDF sales MEDIA:<path pdf sales>"
   dan hal yang sama untuk PDF finance. Tunggu komentar saya soal tampilan.
6. Commit.
```

Buka kedua PDF di HP tes. Kalau ada yang terpotong atau jelek, jelaskan ke Hermes
dengan bahasa biasa (contoh: "tabel stok di halaman 3 terpotong ke kanan").

### PROMPT 10. Sambungkan ke Hermes (cron, perintah, skill)

```text
Tahap 10: sambungkan ke Hermes. Ikuti bagian 6 spesifikasi. Semua lewat
hermes/install.sh yang aman dijalankan berulang.
1. Script di hermes/scripts/ sesuai 6.2 (path absolut untuk hermes dan qudamah-report).
2. Skill hermes/skills/aiconsult/ dan hermes/skills/qudamah-finance/ sesuai 6.4. Bawa
   semua aturan isi dari src/prompts/*.md, ganti aturan format HTML Telegram dengan
   format WhatsApp. Konfirmasi hari jadwal mingguan dari workflow JSON.
3. hermes/SOUL.md sesuai 6.5.
4. install.sh: salin script dan skill ke profile qudamah, pasang SOUL.md, set config
   sesuai 6.6 (termasuk whatsapp.reply_prefix kosong dan media_delivery_allow_dirs), buat
   atau perbarui 4 cron job sesuai 6.1 dengan target dari $QR/config/app.json.
   Jangan ubah profile lain. Jangan restart gateway; kalau perlu restart, bilang ke saya.
5. Jalankan install.sh, tunjukkan `qudamah cron list` dan `qudamah cron doctor`,
   lalu `$QR/bin/qudamah-report doctor`.
6. Commit.
```

Setelah tahap ini, **[MANUAL]** jalankan sekali `hermes gateway restart` supaya
pengaturan WhatsApp yang baru (misalnya tanpa header "Hermes Agent") ikut aktif.

### PROMPT 11. Uji ujung ke ujung

```text
Tahap 11: uji ujung ke ujung ke nomor tes. Ikuti bagian 7 butir 6 spesifikasi.
1. `qudamah cron run` untuk qudamah-sales-harian dan qudamah-finance-mingguan. Cek status
   pengiriman dan error di `qudamah cron list`.
2. Uji kegagalan: buat file $QR/data/FORCE_FAIL, jalankan qudamah-sales-harian, pastikan
   notifikasi gagal sampai ke nomor tes, lalu hapus file itu.
3. Minta saya mengetik dari HP tes: /sales, /finance, "/aiconsult kenapa penjualan minggu
   ini turun?", lalu satu pertanyaan lanjutan. Setelah saya bilang selesai, periksa log
   gateway profile qudamah.
4. Minta saya mengirim "jalankan ls /" dari WhatsApp. Pastikan bot tidak punya tool untuk
   itu dan menolak.
5. Laporkan ringkasan dan masalah yang tersisa.
```

---

## Bagian 4. Masa uji 7 hari

Selama 7 hari (harus melewati satu hari Minggu), n8n tetap mengirim ke Telegram seperti
biasa, dan Hermes mengirim ke nomor tes:

- 07:00 laporan sales + PDF
- 07:30 hasil perbandingan angka Hermes vs n8n
- Minggu 10:00 analisis finance + PDF

Setiap hari cukup baca pesan perbandingan jam 07:30. Kalau ada yang beda, buka
`qudamah chat` dan kirim: "Perbandingan hari ini ada beda di <field>. Selidiki, ikuti
AGENTS.md."

### PROMPT 12. Ringkasan masa uji

```text
Masa uji selesai. Ringkas hasil 7 hari: perbandingan harian (hari yang sama persis dan
yang beda beserta penyebabnya), status semua cron job, error pengiriman, dan apakah ada
yang harus diperbaiki sebelum go-live.
```

---

## Bagian 5. Go-live

### 5.1 [MANUAL] Pilih cara kirim ke owner dan tim

**Disarankan: grup WhatsApp.** Buat grup "Laporan Qudamah" berisi owner, tim, dan
nomor bot. Satu laporan cukup dikirim sekali ke grup, jadi risiko nomor bot dibatasi
WhatsApp lebih kecil. Setelah bot masuk grup, kirim satu pesan apa saja di grup.

Alternatif: kirim ke nomor masing-masing. Setiap orang harus mengirim pesan ke bot
sekali sebelum laporan pertama.

### PROMPT 13. Go-live

Isi dulu bagian `<...>`.

```text
Tahap 13: go-live. Ikuti bagian 8 spesifikasi.
Penerima: <grup "Laporan Qudamah" | nomor: 62xxx, 62xxx>.
Nomor owner dan tim yang boleh memakai perintah: <62xxx, 62xxx, ...>.
1. Kalau grup: cari JID grup dengan `qudamah send --list whatsapp` dan konfirmasi ke saya.
2. Set WHATSAPP_ALLOWED_USERS (owner + tim + 6287720742631), dan kalau grup:
   WHATSAPP_GROUP_POLICY=allowlist, WHATSAPP_GROUP_ALLOWED_USERS=<jid>,
   WHATSAPP_REQUIRE_MENTION=true. Pakai `hermes -p qudamah config set`.
3. Jalankan export-n8n lalu import-static lagi (n8n terus memperbarui snapshot selama masa uji).
4. Ubah $QR/config/app.json: mode live, penerima live sesuai di atas, failure tetap
   whatsapp:+6287720742631. Jalankan install.sh lagi. Hapus cron qudamah-bandingkan-n8n.
5. Beri tahu saya untuk restart gateway dan menonaktifkan workflow n8n. Setelah saya
   konfirmasi, jalankan qudamah-sales-harian sekali dan cek pengirimannya.
```

### 5.2 [MANUAL] Saat diminta Hermes

1. `hermes gateway restart`
2. Buka n8n → workflow laporan → **nonaktifkan** (sebelum jam 07:00 berikutnya).
3. Balas ke Hermes: "sudah".

Jangan hapus n8n dulu; simpan setidaknya satu bulan untuk jaga-jaga.

---

## Bagian 6. Kalau ada masalah

| Gejala | Cek dan solusi |
| --- | --- |
| Bot tidak membalas | Nomor pengirim ada di `WHATSAPP_ALLOWED_USERS` (tanpa `+`); `hermes gateway status`; log di `~/.hermes/profiles/qudamah/logs/` dan `~/.hermes/profiles/qudamah/whatsapp/bridge.log` |
| Balasan keluar dari nomor bot lama, atau bot lama mati | Port bridge bentrok: `qudamah config get whatsapp.bridge_port` harus 3001, lalu `hermes gateway restart` |
| `qudamah gateway install` error | Normal di v0.21.5. Pakai `hermes gateway restart` |
| Laporan jam 07:00 tidak datang | `qudamah cron list` (status dan error pengiriman), `qudamah cron doctor`, `qudamah config get timezone` |
| PDF tidak ikut terkirim | Cek file di `$QR/out/<tanggal>/`, error di `qudamah cron list` |
| Error Accurate 401 atau token | `~/.hermes/profiles/qudamah/qudamah-report/bin/qudamah-report auth accurate` |
| Setelah `hermes update` ada yang aneh | `qudamah cron doctor`, `$QR/bin/qudamah-report doctor`, coba `/sales` |
| Hermes mulai mengubah logika atau menampilkan rahasia | Kirim: "Stop. Baca ulang AGENTS.md, aturan nomor 1 dan 3." |

---

## Bagian 7. Rollback (kembali ke n8n)

1. `qudamah cron list`, lalu `qudamah cron pause <id>` untuk `qudamah-sales-harian`
   dan `qudamah-finance-mingguan`.
2. Aktifkan lagi workflow di n8n.

Selesai dalam beberapa menit, karena tidak ada yang dihapus dari sisi n8n.
