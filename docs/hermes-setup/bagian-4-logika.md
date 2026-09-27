# Bagian 4: Logika laporan (Prompt 7 dan 8)

Sebelumnya: [Bagian 3](bagian-3-sumber-data.md) · [Daftar bagian](../hermes-setup-guide.md) · Berikutnya: [Bagian 5](bagian-5-pdf-dan-hermes.md)

**Tujuan:** Bagian terpenting: memindahkan 15 node Code n8n tanpa mengubah logikanya, membuktikannya dengan uji paritas, lalu menyusun pipeline lengkap.

**Syarat mulai:** Bagian 3 selesai (fixture, Accurate dan Sheets sudah jalan).

Setiap prompt di bawah dikirim di **sesi `qudamah chat` baru**:

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Tunggu Hermes selesai dan melapor, baru kirim prompt berikutnya.

---

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

---

## Cek sebelum lanjut

- [ ] Tabel paritas node x eksekusi lulus semua, atau setiap perbedaan sudah Anda setujui (Prompt 7)
- [ ] Hermes tidak mengubah file di `src/code-nodes/` (cek: `git diff --stat claude/great-euler-1zm3lk -- src/` kosong)
- [ ] `sales --dry` dengan data asli cocok dengan laporan n8n pagi itu (Prompt 8)

## Kalau sesi terputus di tengah bagian ini

Buka sesi baru (`cd ~/.hermes/profiles/qudamah/qudamah-report/repo && qudamah chat`) lalu kirim:

```text
Lanjutkan proyek migrasi Qudamah. Baca AGENTS.md, cek `git log --oneline -10` dan
`git status` di repo, lalu jelaskan tahap terakhir yang selesai dan apa yang belum.
Jangan mengerjakan apa pun sebelum saya konfirmasi.
```
