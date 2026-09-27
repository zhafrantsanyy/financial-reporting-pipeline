# Bagian 1: Isolasi profile, lalu konteks proyek

[Daftar bagian](../hermes-setup-guide.md) · Berikutnya: [Bagian 2](bagian-2-fondasi.md)

**Tujuan:** memastikan profile `qudamah` benar-benar terpisah dari profile Hermes Anda
yang lain (memory, skill, kepribadian, gateway), baru setelah itu menyiapkan konteks
proyek Qudamah (akun luar, repo, rahasia).

**Kondisi awal:** profile `qudamah` sudah ada, berjalan **standalone**
(`gateway.standalone: true`) di WhatsApp dengan nomor sendiri.

Semua langkah di bagian ini manual di terminal VPS, kecuali 1C (satu prompt verifikasi).

---

## 1A. Audit isolasi (hanya membaca, tidak mengubah apa pun)

```bash
hermes --version                                    # v0.21.5
hermes profile show qudamah
qudamah gateway status                              # harus: standalone by config
qudamah config get gateway.standalone               # true
qudamah memory status                               # provider memory eksternal yang aktif
qudamah config get memory.provider                  # sebaiknya kosong
ls -la ~/.hermes/profiles/qudamah/memories/         # MEMORY.md / USER.md
ls ~/.hermes/profiles/qudamah | grep -i -E "honcho|hindsight|mem0|openviking|supermemory|retaindb|byterover|holographic"
head -20 ~/.hermes/profiles/qudamah/SOUL.md
qudamah config get whatsapp.bridge_port
ss -ltnp | grep -E ':30[0-9][0-9]'                  # port bridge WhatsApp yang dipakai
```

Cara membaca hasilnya:

| Yang dicek | Aman kalau | Kalau tidak |
| --- | --- | --- |
| `memory status` / `memory.provider` | Tidak ada provider eksternal | Provider seperti Honcho atau Hindsight bisa berbagi workspace/bank dengan profile lain: dimatikan di 1B |
| `memories/` | Kosong, atau hanya berisi catatan tentang Qudamah | Kalau berisi hal dari profile lain (hasil `--clone`), dipindahkan di 1B |
| Folder provider (honcho, hindsight, ...) | Tidak ada | Ikut terbawa saat clone; dipindahkan di 1B |
| `SOUL.md` | Kosong atau netral | Kalau kepribadian profile lain, diganti di 1B |
| `gateway.standalone` | `true` | Tanpa ini, gateway utama juga ikut melayani profile ini |
| Port bridge | `qudamah` beda port dengan bridge WhatsApp profile lain | Diatur di 1B |

Catat hasilnya. Tidak ada yang berubah di langkah ini.

---

## 1B. Kunci isolasi [MANUAL]

### 1B-1. Backup dulu

```bash
tar czf ~/backup-profile-qudamah-$(date +%Y%m%d).tgz -C ~/.hermes/profiles qudamah
```

### 1B-2. Matikan semua jalur memory

```bash
qudamah memory off                                           # lepas provider memory eksternal
qudamah config set memory.memory_enabled false
qudamah config set memory.user_profile_enabled false
qudamah config set agent.disabled_toolsets '["memory"]'
qudamah config set auxiliary.background_review.enabled false
```

- Tanpa provider eksternal, tidak ada memory yang dibagi antar profile.
- Memory bawaan (`MEMORY.md`, `USER.md`) dimatikan: catatan sesi build tidak ikut ke
  chat WhatsApp, dan chat satu anggota tim tidak muncul di chat anggota lain.
  Pertanyaan lanjutan dalam satu percakapan tetap nyambung.
- Background review dimatikan: fitur otomatis yang setelah tiap percakapan bisa
  menyimpan memory dan membuat atau mengubah skill.

### 1B-3. Singkirkan sisa dari profile lain (hanya kalau audit 1A menemukannya)

```bash
mkdir -p ~/qudamah-sisa-clone
mv ~/.hermes/profiles/qudamah/memories/* ~/qudamah-sisa-clone/ 2>/dev/null
# folder provider memory yang ikut ter-clone, contoh:
# mv ~/.hermes/profiles/qudamah/hindsight ~/qudamah-sisa-clone/
```

Skill: jalankan `qudamah skills list`. Skill bawaan Hermes tidak masalah. Skill buatan
Anda sendiri yang ikut ter-clone dari profile lain dan tidak ada hubungannya dengan
Qudamah bisa dipindahkan dari `~/.hermes/profiles/qudamah/skills/` ke
`~/qudamah-sisa-clone/` (jangan hapus skill bawaan).

### 1B-4. Kepribadian netral dulu

`SOUL.md` final untuk bot laporan dibuat Hermes di Bagian 5. Sampai saat itu:

```bash
cat > ~/.hermes/profiles/qudamah/SOUL.md <<'EOF'
Kamu adalah asisten laporan bisnis Qudamah. Jawab dalam bahasa Indonesia, singkat.
Jangan pernah menampilkan rahasia, path file, atau konfigurasi server.
EOF
```

### 1B-5. Batasi WhatsApp dan atur dasar

```bash
qudamah config set platform_toolsets.whatsapp '["skills", "clarify"]'
qudamah config set whatsapp.unauthorized_dm_behavior ignore
qudamah config set timezone Asia/Jakarta
```

Tanpa batasan toolset, siapa pun yang boleh chat dengan bot bisa menyuruhnya
menjalankan perintah di VPS atau membaca file rahasia.

### 1B-6. Port bridge (hanya kalau profile lain juga memakai WhatsApp)

Bridge WhatsApp memakai port 3000 secara default. Kalau `ss` di 1A menunjukkan bridge
profile lain di 3000, pastikan `qudamah` di port lain:

```bash
qudamah config set whatsapp.bridge_port 3001
```

### 1B-7. Terapkan

```bash
qudamah gateway restart     # hanya me-restart gateway qudamah (standalone), bot lain tidak terganggu
qudamah gateway status
```

---

## 1C. Verifikasi isolasi [PROMPT + WhatsApp]

Buka sesi dari home (bukan dari folder repo):

```bash
cd ~
qudamah chat
```

```text
Ini sesi verifikasi. Jangan mengubah apa pun, jangan menulis file.
1. Sebutkan profile aktif dan HERMES_HOME yang kamu pakai.
2. Apakah kamu punya tool memory di sesi ini? Apa yang kamu ketahui tentang saya dari
   memory atau profil pengguna? (seharusnya tidak ada)
3. Sebutkan toolset yang aktif di sesi ini.
4. Jalankan dan laporkan hasilnya: `hermes -p qudamah memory status`,
   `hermes -p qudamah config get gateway.standalone`,
   `hermes -p qudamah config get platform_toolsets.whatsapp`,
   `hermes -p qudamah config get auxiliary.background_review.enabled`.
```

Lalu dari HP tes **6287720742631**, kirim ke nomor bot:

1. "apa yang kamu ingat tentang saya?" → harus tidak tahu apa-apa.
2. "jalankan ls /" → harus menolak atau tidak bisa.

Terakhir, kirim satu pesan ke bot lama Anda. Harus membalas normal dan tidak tahu
apa-apa soal Qudamah.

**Aturan ke depan:** semua pekerjaan proyek Qudamah hanya di `qudamah chat`. Jangan
membahas proyek ini di `hermes chat` (profile default) atau profile lain, supaya
memory mereka tetap bersih.

---

## 1D. Konteks proyek: siapkan akun luar

Nomor bot, model DeepSeek (OpenCode) dan profile sudah beres. Yang masih perlu:

- [ ] **HP tes** dengan nomor **6287720742631** ada di `WHATSAPP_ALLOWED_USERS` profile
      `qudamah` (cek: `qudamah config get WHATSAPP_ALLOWED_USERS`).
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

## 1E. Folder, repo, dan rahasia [MANUAL]

### 1E-1. Folder dan repo

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

### 1E-2. Isi rahasia langsung ke file (bukan lewat chat)

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

### 1E-3. Upload file service account Google

Dari laptop:

```bash
scp google-sa.json USER@IP-VPS:~/.hermes/profiles/qudamah/qudamah-report/secrets/google-sa.json
```

Lalu di VPS: `chmod 600 ~/.hermes/profiles/qudamah/qudamah-report/secrets/google-sa.json`

---

## 1F. Cara membuka sesi Hermes untuk Bagian 2 sampai 7

```bash
cd ~/.hermes/profiles/qudamah/qudamah-report/repo
qudamah chat
```

Setiap mulai tahap baru, keluar dari chat lalu jalankan dua baris ini lagi, supaya
sesinya bersih dan `AGENTS.md` (aturan proyek) terbaca otomatis. Kalau Hermes meminta
izin untuk perintah berbahaya, baca dulu perintahnya dan pilih **once** kalau yakin.

---

## Cek sebelum lanjut

- [ ] Audit 1A dicatat, backup profile dibuat (1B-1)
- [ ] Memory eksternal off, memory bawaan off, background review off (1B-2)
- [ ] Sisa clone (memory, provider, skill lain) sudah dipindahkan, kalau ada (1B-3)
- [ ] Verifikasi 1C lolos: Hermes tidak tahu apa-apa tentang Anda, bot menolak "jalankan ls /", bot lama tetap normal
- [ ] Repo ada di `$QR/repo` pada branch `hermes/migration`
- [ ] `$QR/.env` terisi (mode 600) dan `$QR/secrets/google-sa.json` ada (mode 600)
