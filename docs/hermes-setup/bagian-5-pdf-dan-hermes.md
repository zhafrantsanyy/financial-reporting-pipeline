# Bagian 5: PDF dan sambungan ke Hermes (Prompt 9 dan 10)

Sebelumnya: [Bagian 4](bagian-4-logika.md) · [Daftar bagian](../hermes-setup-guide.md) · Berikutnya: [Bagian 6](bagian-6-uji.md)

**Tujuan:** Membuat PDF dashboard, lalu memasang cron job, perintah `/sales` `/finance`, skill `/aiconsult`, dan pengaturan bot.

**Syarat mulai:** Bagian 4 selesai. HP tes 6287720742631 siap untuk mengecek PDF.

Setiap prompt di bawah dikirim di **sesi `qudamah chat` baru**:

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Tunggu Hermes selesai dan melapor, baru kirim prompt berikutnya.

---

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

---

## Cek sebelum lanjut

- [ ] Kedua PDF sudah Anda cek di HP: semua tab ada, tidak terpotong (Prompt 9)
- [ ] `qudamah cron list` menampilkan 4 job, `qudamah cron doctor` bersih (Prompt 10)
- [ ] `hermes gateway restart` sudah dijalankan setelah Prompt 10

## Kalau sesi terputus di tengah bagian ini

Buka sesi baru (`cd ~/.hermes/profiles/qudamah/qudamah-report/repo && qudamah chat`) lalu kirim:

```text
Lanjutkan proyek migrasi Qudamah. Baca AGENTS.md, cek `git log --oneline -10` dan
`git status` di repo, lalu jelaskan tahap terakhir yang selesai dan apa yang belum.
Jangan mengerjakan apa pun sebelum saya konfirmasi.
```
