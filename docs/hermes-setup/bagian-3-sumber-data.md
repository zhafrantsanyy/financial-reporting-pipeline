# Bagian 3: Sumber data (Prompt 4 sampai 6)

Sebelumnya: [Bagian 2](bagian-2-fondasi.md) · [Daftar bagian](../hermes-setup-guide.md) · Berikutnya: [Bagian 4](bagian-4-logika.md)

**Tujuan:** Mengambil data uji dari n8n, menyambungkan Accurate Online (termasuk login sekali) dan Google Sheets.

**Syarat mulai:** Bagian 2 selesai. Siapkan browser di laptop untuk login Accurate, dan ID/URL spreadsheet untuk Prompt 6.

Setiap prompt di bawah dikirim di **sesi `qudamah chat` baru**:

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Tunggu Hermes selesai dan melapor, baru kirim prompt berikutnya.

---

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

---

## Cek sebelum lanjut

- [ ] Fixture n8n dan staticData tersimpan di `$QR` (bukan di repo) (Prompt 4)
- [ ] Login Accurate berhasil, jumlah baris per endpoint tampil (Prompt 5)
- [ ] Konverter Google Sheets cocok dengan fixture, atau perbedaannya sudah dijelaskan (Prompt 6)

## Kalau sesi terputus di tengah bagian ini

Buka sesi baru (`cd ~/.hermes/profiles/qudamah/qudamah-report/repo && qudamah chat`) lalu kirim:

```text
Lanjutkan proyek migrasi Qudamah. Baca AGENTS.md, cek `git log --oneline -10` dan
`git status` di repo, lalu jelaskan tahap terakhir yang selesai dan apa yang belum.
Jangan mengerjakan apa pun sebelum saya konfirmasi.
```
