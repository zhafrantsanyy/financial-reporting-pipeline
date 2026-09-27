# Bagian 2: Fondasi (Prompt 1 sampai 3)

Sebelumnya: [Bagian 1](bagian-1-persiapan.md) · [Daftar bagian](../hermes-setup-guide.md) · Berikutnya: [Bagian 3](bagian-3-sumber-data.md)

**Tujuan:** Hermes memahami proyek, memasang runtime (Node, npm, Chromium dari Hermes) dan membuat kerangka CLI `qudamah-report`.

**Syarat mulai:** Bagian 1 selesai.

Setiap prompt di bawah dikirim di **sesi `qudamah chat` baru**:

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Tunggu Hermes selesai dan melapor, baru kirim prompt berikutnya.

---

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

---

## Cek sebelum lanjut

- [ ] Hermes sudah meringkas arsitektur dan urutan tahap (Prompt 1)
- [ ] Versi Node, npm, Chromium tampil dan tes PDF Chromium berhasil (Prompt 2)
- [ ] `$QR/bin/qudamah-report doctor` jalan, semua variabel `.env` = set (Prompt 3)
- [ ] Ada commit baru di branch `hermes/migration`

## Kalau sesi terputus di tengah bagian ini

Buka sesi baru (`cd ~/.hermes/profiles/qudamah/qudamah-report/repo && qudamah chat`) lalu kirim:

```text
Lanjutkan proyek migrasi Qudamah. Baca AGENTS.md, cek `git log --oneline -10` dan
`git status` di repo, lalu jelaskan tahap terakhir yang selesai dan apa yang belum.
Jangan mengerjakan apa pun sebelum saya konfirmasi.
```
