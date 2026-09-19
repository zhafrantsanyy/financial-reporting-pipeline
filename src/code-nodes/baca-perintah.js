// ============================================================
// Node: Baca Perintah
// Mengurai pesan Telegram menjadi mode kerja workflow.
//
// Aturan pemilahan:
//   diawali '/'  -> perintah. Dikenal jadi mode kerjanya, tidak
//                   dikenal dibalas daftar perintah.
//   teks biasa   -> lanjutan percakapan konsultasi. Dijawab dari
//                   memori tanpa menarik ulang data.
//   bukan teks   -> diabaikan (stiker, foto, lokasi).
//
// ------------------------------------------------------------
// AKSES
// BATASI_KE_DAFTAR_IZIN = false berarti bot terbuka untuk SIAPA PUN
// yang menemukannya di Telegram, dan balasannya dikirim ke chat id
// pengirim masing-masing. Tidak ada chat yang berstatus ditolak
// selama flag ini false.
//
// Konsekuensinya: siapa pun yang tahu nama bot ini bisa menarik laba
// rugi, neraca, posisi kas, dan nilai persediaan Qudamah, serta
// memicu eksekusi berbayar berulang kali.
//
// Untuk menguncinya kembali, ubah satu baris di bawah menjadi true.
// Kalau nanti dikunci lagi, pastikan chat id di dalam array ditulis
// sebagai string tanpa spasi berlebih, karena perbandingannya persis.
// ------------------------------------------------------------
const BATASI_KE_DAFTAR_IZIN = false;
const CHAT_DIIZINKAN = ['YOUR_TELEGRAM_CHAT_ID'];

const PETA_PERINTAH = {
  '/sales': 'harian',
  '/finance': 'finansial',
  '/aiconsult': 'konsultasi',
};

const pesan = $json.message || $json.edited_message || {};
const teks = String(pesan.text || '').trim();
const chatId = String((pesan.chat && pesan.chat.id) || '').trim();
const nama = String((pesan.from && pesan.from.first_name) || 'Pengguna');
const username = String((pesan.from && pesan.from.username) || '');

const potongan = teks.split(/\s+/);
let perintah = String(potongan[0] || '').toLowerCase();
// Di grup, Telegram mengirim perintah sebagai /sales@NamaBot
const posAt = perintah.indexOf('@');
if (posAt > 0) perintah = perintah.slice(0, posAt);

const adalahPerintah = perintah.charAt(0) === '/';
const argumen = teks.slice(String(potongan[0] || '').length).trim();

const daftarBersih = CHAT_DIIZINKAN.map(x => String(x).trim());
const ditolak = BATASI_KE_DAFTAR_IZIN && daftarBersih.indexOf(chatId) === -1;

let mode = null;
let pertanyaan = '';
let status;

if (ditolak) {
  status = 'ditolak';
} else if (!teks) {
  status = 'abaikan';
} else if (adalahPerintah) {
  mode = PETA_PERINTAH[perintah] || null;
  pertanyaan = argumen;
  status = mode ? 'ok' : 'tidak dikenal';
} else {
  mode = 'lanjutan';
  pertanyaan = teks;
  status = 'lanjutan';
}

return [{
  json: {
    status,
    mode,
    perintah: adalahPerintah ? perintah : '(lanjutan percakapan)',
    pertanyaan,
    chatId,
    nama,
    username,
    teksAsli: teks,
    aksesTerbuka: !BATASI_KE_DAFTAR_IZIN,
    daftarPerintah: Object.keys(PETA_PERINTAH),
  },
}];
