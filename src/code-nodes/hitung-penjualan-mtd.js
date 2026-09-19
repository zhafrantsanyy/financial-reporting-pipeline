// ============================================================
// Node: Hitung Penjualan MTD
// Sumber: sales-invoice/list.do (punya filter tanggal)
// Tujuan: menyediakan angka bulan berjalan yang TIDAK bergantung
//         pada baseline saldo akhir bulan lalu.
// ============================================================
const NODE_TANGGAL = 'Siapkan Sesi dan Tanggal';

let tgl = {};
try { tgl = $(NODE_TANGGAL).first().json || {}; } catch (e) { tgl = {}; }

function ambilBaris(json) {
  if (Array.isArray(json)) return json.flatMap(ambilBaris);
  if (json && Array.isArray(json.d)) return json.d;
  return [];
}

let penjualanMTD;
try {
  let rows = [];
  for (const item of $input.all()) rows = rows.concat(ambilBaris(item.json));

  const seen = new Set();
  rows = rows.filter(r => {
    if (r.id == null) return true;
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const polaBatal = /batal|void|cancel/i;
  const valid = rows.filter(r => !polaBatal.test(String(r.statusName || '')));
  const total = valid.reduce((s, r) => s + Number(r.totalAmount || 0), 0);

  penjualanMTD = {
    tersedia: rows.length > 0,
    sumber: 'sales-invoice/list.do',
    periodeDari: tgl.tglAwalBulan || null,
    periodeSampai: tgl.tglKemarin || null,
    jumlahFaktur: valid.length,
    jumlahFakturDibatalkan: rows.length - valid.length,
    totalPenjualanBruto: Math.round(total),
    rataRataPerFaktur: valid.length ? Math.round(total / valid.length) : 0,
    catatan: 'Nilai bruto per faktur sebelum retur, diskon, dan potongan platform. Bukan pengganti penjualan bersih akuntansi, tapi valid sebagai indikator volume bulan berjalan.'
  };

  if (rows.length === 0) {
    penjualanMTD.alasanKosong = 'Tidak ada faktur pada rentang tanggal, atau permintaan ke Accurate gagal. Cek eksekusi node Accurate Sales Invoice MTD.';
  }
} catch (e) {
  penjualanMTD = {
    tersedia: false,
    sumber: 'sales-invoice/list.do',
    error: String((e && e.message) || e),
    alasanKosong: 'Gagal memproses respons faktur penjualan.'
  };
}

return [{ json: Object.assign({}, tgl, { penjualanMTD }) }];
