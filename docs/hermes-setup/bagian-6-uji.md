# Bagian 6: Uji coba dan masa uji 7 hari (Prompt 11 dan 12)

Sebelumnya: [Bagian 5](bagian-5-pdf-dan-hermes.md) · [Daftar bagian](../hermes-setup-guide.md) · Berikutnya: [Bagian 7](bagian-7-go-live.md)

**Tujuan:** Menguji semuanya lewat WhatsApp ke nomor tes, lalu membiarkan Hermes dan n8n berjalan berdampingan selama 7 hari.

**Syarat mulai:** Bagian 5 selesai.

Setiap prompt di bawah dikirim di **sesi `qudamah chat` baru**:

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Tunggu Hermes selesai dan melapor, baru kirim prompt berikutnya.

---

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

## Masa uji 7 hari

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

---

## Cek sebelum lanjut

- [ ] `/sales`, `/finance`, `/aiconsult` + pertanyaan lanjutan berfungsi dari HP tes (Prompt 11)
- [ ] Notifikasi gagal sampai ke nomor tes, dan bot menolak "jalankan ls /" (Prompt 11)
- [ ] 7 hari masa uji (termasuk satu hari Minggu) tanpa perbedaan yang belum dijelaskan (Prompt 12)

## Kalau sesi terputus di tengah bagian ini

Buka sesi baru (`cd ~/.hermes/profiles/qudamah/qudamah-report/repo && qudamah chat`) lalu kirim:

```text
Lanjutkan proyek migrasi Qudamah. Baca AGENTS.md, cek `git log --oneline -10` dan
`git status` di repo, lalu jelaskan tahap terakhir yang selesai dan apa yang belum.
Jangan mengerjakan apa pun sebelum saya konfirmasi.
```
