// ============================================================
// NODE: "Pecah Pesan Telegram"
// Tipe: Code, mode "Run Once for All Items"
// Posisi: setelah "Hitung Metrik Harian", sebelum node Telegram
//
// Memecah field pesan jadi beberapa item, satu item = satu pesan Telegram.
// Pemotongan diusahakan di batas blok (baris kosong), lalu baris,
// dan baru dipotong paksa kalau satu baris memang lebih panjang dari batas.
// ============================================================

const BATAS = 3800;              // aman di bawah limit 4096 milik Telegram
const NOMOR_BAGIAN = true;       // tambahkan penanda (1/3) di akhir tiap pesan
const FIELD = 'pesan';           // nama field sumber teks

const potongPanjang = (teks, batas) => {
  const out = [];
  let sisa = teks;
  while (sisa.length > batas) {
    out.push(sisa.slice(0, batas));
    sisa = sisa.slice(batas);
  }
  if (sisa.length > 0) out.push(sisa);
  return out;
};

// Pecah teks jadi unit terkecil yang masih utuh: blok, lalu baris, lalu paksa
function unitTeks(teks, batas) {
  const unit = [];
  for (const blok of String(teks).split('\n\n')) {
    if (blok.length <= batas) { unit.push(blok); continue; }
    let kumpul = '';
    for (const baris of blok.split('\n')) {
      if (baris.length > batas) {
        if (kumpul) { unit.push(kumpul); kumpul = ''; }
        unit.push(...potongPanjang(baris, batas));
        continue;
      }
      if ((kumpul + '\n' + baris).length > batas) { unit.push(kumpul); kumpul = baris; }
      else kumpul = kumpul ? kumpul + '\n' + baris : baris;
    }
    if (kumpul) unit.push(kumpul);
  }
  return unit.filter(u => u.trim() !== '');
}

function pecah(teks, batas) {
  const unit = unitTeks(teks, batas);
  const bagian = [];
  let kumpul = '';
  for (const u of unit) {
    if (kumpul === '') { kumpul = u; continue; }
    if ((kumpul + '\n\n' + u).length > batas) { bagian.push(kumpul); kumpul = u; }
    else kumpul = kumpul + '\n\n' + u;
  }
  if (kumpul) bagian.push(kumpul);
  return bagian.length > 0 ? bagian : [''];
}

const keluar = [];
for (const item of $input.all()) {
  const asal = item.json || {};
  const teks = String(asal[FIELD] || '');
  if (teks.trim() === '') continue;

  // Sisakan ruang untuk penanda bagian
  const cadangan = NOMOR_BAGIAN ? 12 : 0;
  const bagian = pecah(teks, BATAS - cadangan);

  bagian.forEach((isi, i) => {
    const label = NOMOR_BAGIAN && bagian.length > 1 ? '\n\n(' + (i + 1) + '/' + bagian.length + ')' : '';
    keluar.push({
      json: {
        pesan: isi + label,
        bagian: i + 1,
        totalBagian: bagian.length,
        panjang: (isi + label).length,
        // ringkas hanya ikut di pesan pertama supaya payload tidak berlipat
        ringkas: i === 0 ? asal.ringkas : undefined
      }
    });
  });
}

if (keluar.length === 0) {
  keluar.push({ json: { pesan: 'Laporan harian kosong, tidak ada teks yang bisa dikirim.', bagian: 1, totalBagian: 1 } });
}

return keluar;
