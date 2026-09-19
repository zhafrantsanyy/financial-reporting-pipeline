// ============================================================
// Node: Tentukan Mode
// Satu-satunya penentu apa yang dikerjakan dan apa yang dikirim.
// Semua gate hilir membaca flag dari sini, tidak ada gate yang
// menghitung sendiri.
//
// Ada tiga pintu masuk:
//   Jadwal Harian 07:00           -> laporan sales harian
//   Jadwal Mingguan Minggu 10:00  -> laporan finance mingguan
//   Telegram Trigger              -> perintah atau lanjutan percakapan
// ============================================================

// Chat tujuan untuk eksekusi TERJADWAL saja. Eksekusi yang dipicu
// perintah membalas ke chat pengirimnya. Isi dengan chat id berupa
// angka dalam tanda kutip, BUKAN ekspresi, karena node Code tidak
// mengevaluasi ekspresi n8n di dalam string.
const CHAT_DEFAULT = 'YOUR_TELEGRAM_CHAT_ID';

// Nama node pemicu finance. Kalau node itu di-rename di canvas,
// nilai di bawah WAJIB ikut diubah, kalau tidak setiap eksekusi
// terjadwal akan dianggap jadwal harian.
const NODE_PERINTAH = 'Baca Perintah';
const NODE_JADWAL_FINANCE = 'Jadwal Mingguan Minggu 10:00';

let mode = null;
let pertanyaan = '';
let chatId = CHAT_DEFAULT;
let nama = '';
let perintahAsal = '';

// 1. Dipicu perintah Telegram?
try {
  const p = $(NODE_PERINTAH).first().json;
  if (p && p.mode) {
    mode = p.mode;
    pertanyaan = p.pertanyaan || '';
    chatId = p.chatId || CHAT_DEFAULT;
    nama = p.nama || '';
    perintahAsal = p.perintah || '';
  }
} catch (e) { /* bukan dari Telegram */ }

// 2. Bukan perintah. Cek jadwal mana yang menyalakan eksekusi ini.
if (!mode) {
  try {
    $(NODE_JADWAL_FINANCE).first();
    mode = 'jadwal-finance';
    perintahAsal = '(jadwal mingguan)';
  } catch (e) {
    mode = 'jadwal-sales';
    perintahAsal = '(jadwal harian)';
  }
}

// ------------------------------------------------------------
// Flag kerja
// ------------------------------------------------------------
// Mode 'lanjutan' adalah balasan teks biasa atas jawaban konsultasi.
// Dijawab dari memori, jadi seluruh penarikan data dilewati dan
// balasannya hitungan detik, bukan menit.
const tarikData = mode !== 'lanjutan';

// Metrik sales dipakai dua kali, sebagai laporan dan sebagai konteks
// untuk AI Konsultan lewat node Gabung Konteks Konsultasi. Selama
// pipeline jalan, branch ini harus ikut jalan agar input Merge itu
// tidak pernah kosong.
const prosesSales = tarikData;

// ------------------------------------------------------------
// Flag kirim. Ini yang menentukan pesan mana yang keluar.
//   /sales, jadwal harian     -> hanya laporan sales
//   /finance, jadwal mingguan -> hanya laporan finance
//   /aiconsult, lanjutan      -> hanya jawaban konsultasi
// ------------------------------------------------------------
const kirimSales = mode === 'harian' || mode === 'jadwal-sales';
const kirimFinansial = mode === 'finansial' || mode === 'jadwal-finance';
const kirimKonsultasi = mode === 'konsultasi';

return [{
  json: {
    mode,
    perintahAsal,
    pertanyaan,
    chatId,
    nama,
    tarikData,
    prosesSales,
    // nama lama dipertahankan agar gate yang sudah ada tetap terbaca
    prosesHarian: prosesSales,
    kirimSales,
    kirimHarian: kirimSales,
    kirimFinansial,
    kirimKonsultasi,
    dipicuOleh: perintahAsal,
    waktuMulai: new Date().toISOString(),
  },
}];
