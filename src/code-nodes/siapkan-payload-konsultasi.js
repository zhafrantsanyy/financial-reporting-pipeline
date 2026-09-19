// ============================================================
// Node: Siapkan Payload Konsultasi
// Punya dua jalur masuk:
//   1. Gabung Konteks Konsultasi -> perintah /aiconsult, data segar
//      dari laporan sales dan laporan finance.
//   2. Jalur Lanjutan -> balasan teks biasa, dijawab dari memori
//      percakapan tanpa menarik data.
// Kedua node sumber dibaca dengan try/catch karena pada jalur
// lanjutan keduanya memang tidak tereksekusi.
// ============================================================
const BATAS_KARAKTER_SALES = 14000;

const mode = $('Tentukan Mode').first().json;
const lanjutan = mode.mode === 'lanjutan';

// --- Sumber 1: laporan finansial ---
let fin = null;
if (!lanjutan) {
  try { fin = $('Hitung Laba Rugi & Neraca').first().json; } catch (e) { fin = null; }
}

// --- Sumber 2: laporan sales / operasional harian ---
let sales = null;
let salesDipangkas = false;
if (!lanjutan) {
  try {
    const h = $('Hitung Metrik Harian').first().json;
    const s = JSON.stringify(h);
    if (s.length > BATAS_KARAKTER_SALES) {
      salesDipangkas = true;
      sales = { catatan: 'Data sales dipangkas karena terlalu besar untuk satu prompt.', cuplikan: s.slice(0, BATAS_KARAKTER_SALES) };
    } else {
      sales = h;
    }
  } catch (e) {
    sales = null;
  }
}

const laporanFinance = fin ? {
  dataQuality: fin.dataQuality,
  periode: fin.periode,
  penjualanBulanBerjalan: fin.penjualanMTD,
  bulanan: fin.bulanan,
  tahunan: fin.tahunan,
  rataRataBulanan: fin.rataRataBulanan,
  posisi: fin.posisi,
  diagnostikNeraca: {
    seimbang: (fin.diagnostikNeraca || {}).seimbang,
    selisihIdentitas: (fin.diagnostikNeraca || {}).selisihIdentitas,
    dugaanPenyebab: (fin.diagnostikNeraca || {}).dugaanPenyebab,
  },
} : null;

const pertanyaan = (mode.pertanyaan || '').trim()
  || 'Beri ringkasan kondisi bisnis BrandCo saat ini dan tiga hal yang paling perlu diperhatikan minggu ini.';

const ketersediaan = {
  lanjutanDariMemori: lanjutan,
  laporanSales: Boolean(sales),
  laporanSalesDipangkas: salesDipangkas,
  laporanFinance: Boolean(laporanFinance),
  dihasilkanPada: new Date().toISOString(),
};

return [{
  json: {
    pertanyaan,
    lanjutan,
    ketersediaan,
    payload: JSON.stringify({
      ketersediaan,
      laporanSales: sales,
      laporanFinance,
    }),
  },
}];
