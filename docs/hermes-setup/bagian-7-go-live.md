# Bagian 7: Go-live, masalah umum, rollback (Prompt 13)

Sebelumnya: [Bagian 6](bagian-6-uji.md) · [Daftar bagian](../hermes-setup-guide.md)

**Tujuan:** Memindahkan penerima ke owner dan tim Qudamah, lalu mematikan n8n.

**Syarat mulai:** Bagian 6 selesai. Siapkan: grup WhatsApp "Laporan Qudamah" (disarankan) atau daftar nomor owner dan tim.

Setiap prompt di bawah dikirim di **sesi `qudamah chat` baru**:

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Tunggu Hermes selesai dan melapor, baru kirim prompt berikutnya.

---

## Go-live

### Langkah 1 [MANUAL] Pilih cara kirim ke owner dan tim

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

### Langkah 2 [MANUAL] Saat diminta Hermes

1. `qudamah gateway restart`
2. Buka n8n → workflow laporan → **nonaktifkan** (sebelum jam 07:00 berikutnya).
3. Balas ke Hermes: "sudah".

Jangan hapus n8n dulu; simpan setidaknya satu bulan untuk jaga-jaga.

---

## Kalau ada masalah

| Gejala | Cek dan solusi |
| --- | --- |
| Bot tidak membalas | Nomor pengirim ada di `WHATSAPP_ALLOWED_USERS` (tanpa `+`); `qudamah gateway status`; log di `~/.hermes/profiles/qudamah/logs/` dan `~/.hermes/profiles/qudamah/whatsapp/bridge.log` |
| Balasan keluar dari nomor bot lama, atau bot lama mati | Port bridge bentrok: `qudamah config get whatsapp.bridge_port` harus beda dengan bridge profile lain (misalnya 3001), lalu `qudamah gateway restart` |
| Bot qudamah mati setelah `hermes update` | Profile ini standalone (`gateway.standalone: true`), fitur sementara di Hermes. Baca catatan rilis sebelum update; cek `qudamah gateway status`, lalu `qudamah gateway start` |
| Laporan jam 07:00 tidak datang | `qudamah cron list` (status dan error pengiriman), `qudamah cron doctor`, `qudamah config get timezone` |
| PDF tidak ikut terkirim | Cek file di `$QR/out/<tanggal>/`, error di `qudamah cron list` |
| Error Accurate 401 atau token | `~/.hermes/profiles/qudamah/qudamah-report/bin/qudamah-report auth accurate` |
| Setelah `hermes update` ada yang aneh | `qudamah cron doctor`, `$QR/bin/qudamah-report doctor`, coba `/sales` |
| Hermes mulai mengubah logika atau menampilkan rahasia | Kirim: "Stop. Baca ulang AGENTS.md, aturan nomor 1 dan 3." |

---

## Rollback (kembali ke n8n)

1. `qudamah cron list`, lalu `qudamah cron pause <id>` untuk `qudamah-sales-harian`
   dan `qudamah-finance-mingguan`.
2. Aktifkan lagi workflow di n8n.

Selesai dalam beberapa menit, karena tidak ada yang dihapus dari sisi n8n.

---

## Cek sebelum lanjut

- [ ] Laporan pertama sampai ke grup/nomor owner dan tim
- [ ] Workflow n8n sudah nonaktif (jangan dihapus, simpan sebulan)
- [ ] Job `qudamah-bandingkan-n8n` sudah dihapus

## Kalau sesi terputus di tengah bagian ini

Buka sesi baru (`cd ~/.hermes/profiles/qudamah/qudamah-report/repo && qudamah chat`) lalu kirim:

```text
Lanjutkan proyek migrasi Qudamah. Baca AGENTS.md, cek `git log --oneline -10` dan
`git status` di repo, lalu jelaskan tahap terakhir yang selesai dan apa yang belum.
Jangan mengerjakan apa pun sebelum saya konfirmasi.
```
