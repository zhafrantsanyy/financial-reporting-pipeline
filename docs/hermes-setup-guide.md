# Panduan Setup Laporan Qudamah di Hermes

Panduan memindahkan workflow n8n ke profile Hermes `qudamah` di VPS, dibagi menjadi
7 bagian. Kerjakan berurutan; tiap bagian ditutup dengan checklist **"Cek sebelum
lanjut"**. Bagian 1 dikerjakan manual di terminal, bagian 2 sampai 7 lewat chat Hermes.

| Bagian | Isi | Cara | Prompt |
| --- | --- | --- | --- |
| [1. Persiapan](hermes-setup/bagian-1-persiapan.md) | Akun luar, profile `qudamah`, pairing WhatsApp, repo, rahasia | Manual (terminal) | - |
| [2. Fondasi](hermes-setup/bagian-2-fondasi.md) | Orientasi, runtime Node/Chromium, kerangka CLI | Chat Hermes | 1 sampai 3 |
| [3. Sumber data](hermes-setup/bagian-3-sumber-data.md) | Data uji n8n, Accurate (login), Google Sheets | Chat Hermes | 4 sampai 6 |
| [4. Logika laporan](hermes-setup/bagian-4-logika.md) | Porting node Code + uji paritas, pipeline | Chat Hermes | 7 dan 8 |
| [5. PDF dan Hermes](hermes-setup/bagian-5-pdf-dan-hermes.md) | PDF dashboard, cron, `/sales` `/finance` `/aiconsult` | Chat Hermes | 9 dan 10 |
| [6. Uji coba](hermes-setup/bagian-6-uji.md) | Uji lewat WhatsApp, masa uji 7 hari | Chat Hermes | 11 dan 12 |
| [7. Go-live](hermes-setup/bagian-7-go-live.md) | Kirim ke owner dan tim, matikan n8n, masalah umum, rollback | Chat Hermes + manual | 13 |

Dua jenis langkah di dalamnya:

- **[MANUAL]**: Anda jalankan sendiri di terminal VPS (SSH) atau di website lain.
- **[PROMPT]**: copy-paste ke Hermes di `qudamah chat`, **satu prompt per sesi baru**.

Aturan umum untuk semua bagian:

- Rahasia (API key, password, token) tidak pernah diketik di chat. Tulis ke file
  `$QR/.env` sesuai Bagian 1, lalu Hermes hanya diberi tahu lokasinya.
- Hermes membaca [`AGENTS.md`](../AGENTS.md) otomatis setiap sesi dibuka dari folder repo,
  dan memakai [`vps-migration-plan.md`](vps-migration-plan.md) sebagai spesifikasi.
  Karena memory profile ini dimatikan, kesinambungan antar sesi datang dari dua file
  itu dan riwayat git.
- Kalau Hermes melenceng (mengubah logika, menampilkan rahasia), kirim:
  "Stop. Baca ulang AGENTS.md, aturan nomor 1 dan 3."
- Setelah Bagian 4, Anda bisa push branch `hermes/migration` ke GitHub dan minta Claude
  mereview kodenya.
