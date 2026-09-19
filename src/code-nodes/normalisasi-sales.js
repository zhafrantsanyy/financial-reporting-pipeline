// ============================================================
// Node: Normalisasi Sales
// Mode: Run Once for All Items
// Input : Gabung Sheet VS (boleh berisi lebih dari satu sheet VS,
//         termasuk dari spreadsheet yang berbeda)
// Output: 1 item { _source:'sales', bulanBerjalan, bulanSebelumnya, tahunLalu }
//
// CARA KERJA
// 1. Baris dikelompokkan per sheet asal memakai sidik jari kolom, yaitu
//    daftar judul blok "DATA PENJUALAN <BULAN> <TAHUN>" yang dimiliki
//    baris itu. Ini penting karena dua spreadsheet berbeda memakai
//    penomoran kolom sendiri-sendiri. Tanpa pemisahan ini, baris sheet
//    September akan terbaca memakai peta kolom sheet Juli dan angkanya
//    tercampur tanpa error apa pun.
// 2. Di dalam tiap kelompok, blok dideteksi dari judul kolomnya dan
//    tujuh kolom sesudahnya diambil berdasarkan urutan kolom.
// 3. Pemilihan bulan berjalan mengikuti tanggal hari ini. Menambah blok
//    atau menambah sheet baru tidak perlu mengubah kode.
// ============================================================

const POLA_BLOK = /^DATA PENJUALAN\s+([A-Za-z]+)\s+(\d{4})\s*$/i;

const rowsMasuk = $input.all()
  .map(i => i.json)
  .filter(r => r && typeof r === 'object');

// ---------- helper ----------
const BLN = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};
const NAMA_BULAN = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI',
  'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER'];

function num(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s || s === '-' || s === '#DIV/0!' || s === '#N/A') return 0;
  s = s.replace(/rp/ig, '').replace(/\s/g, '');
  const persen = s.includes('%');
  s = s.replace('%', '');
  if (/,/.test(s) && /\./.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/,/.test(s)) s = s.replace(',', '.');
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return persen ? n / 100 : n;
}

function isKosong(v) {
  return v === '' || v === null || v === undefined;
}

function parseTgl(v, defaultYear) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2})[-\s\/]([A-Za-z]{3,})\.?(?:[-\s\/](\d{2,4}))?$/);
  if (!m) return null;
  const bln = BLN[m[2].slice(0, 3).toLowerCase()];
  if (!bln) return null;
  let th = m[3] ? parseInt(m[3], 10) : defaultYear;
  if (th < 100) th += 2000;
  return `${th}-${String(bln).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

// ---------- 1. kelompokkan baris per sheet asal ----------
function sidikSheet(r) {
  return Object.keys(r).filter(k => POLA_BLOK.test(k)).join('|');
}

const kelompok = new Map();
for (const r of rowsMasuk) {
  const sidik = sidikSheet(r);
  if (!sidik) continue;              // bukan baris sheet VS
  if (!kelompok.has(sidik)) kelompok.set(sidik, []);
  kelompok.get(sidik).push(r);
}

// ---------- 2. deteksi blok di tiap kelompok ----------
const BLOKS = [];
for (const [sidik, baris] of kelompok.entries()) {
  // Kolom diambil dari baris terlengkap di kelompok ini saja.
  let kolom = [];
  for (const r of baris) {
    const k = Object.keys(r);
    if (k.length > kolom.length) kolom = k;
  }
  for (let i = 0; i < kolom.length; i++) {
    const m = String(kolom[i]).match(POLA_BLOK);
    if (!m) continue;
    const bln = BLN[m[1].slice(0, 3).toLowerCase()];
    if (!bln) continue;              // buang judul seperti DATA PENJUALAN PERPEKAN
    const sesudah = kolom.slice(i + 1, i + 8);
    if (sesudah.length < 7) continue;
    const tahun = parseInt(m[2], 10);
    BLOKS.push({
      sidik, baris,
      kunciBulan: `${tahun}-${String(bln).padStart(2, '0')}`,
      label: `${NAMA_BULAN[bln - 1]} ${tahun}`,
      tahun,
      kunci: kolom[i],
      omset: sesudah[0], resi: sesudah[1], terjual: sesudah[2],
      shopee: sesudah[3], tiktok: sesudah[4], lazada: sesudah[5], lainnya: sesudah[6],
    });
  }
}

// ---------- 3. parse tiap blok ----------
const hasil = {};

for (const B of BLOKS) {
  const harian = [];
  const kv = {};
  const flat = {};
  let section = 'RINGKASAN';

  for (const r of B.baris) {
    // Pengaman terakhir: baris yang tidak memuat judul blok ini bukan
    // miliknya, walaupun kebetulan punya nama kolom yang sama.
    if (!(B.kunci in r)) continue;

    const kunciVal = r[B.kunci];
    const labelVal = r[B.omset];
    const nilaiVal = r[B.resi];

    const tgl = parseTgl(kunciVal, B.tahun);
    if (tgl) {
      harian.push({
        tanggal: tgl,
        omset: num(r[B.omset]),
        resi: num(r[B.resi]),
        terjual: num(r[B.terjual]),
        shopee: num(r[B.shopee]),
        tiktok: num(r[B.tiktok]),
        lazada: num(r[B.lazada]),
        lainnya: num(r[B.lainnya]),
      });
      continue;
    }

    const label = !isKosong(kunciVal) ? String(kunciVal).trim()
                : !isKosong(labelVal) ? String(labelVal).trim()
                : null;
    if (!label) continue;
    if (label.length > 60) continue;

    const kapital = label === label.toUpperCase() && /[A-Z]/.test(label);
    if (label === 'VARIABLE' || (isKosong(nilaiVal) && kapital)) {
      section = label.toUpperCase();
      if (!kv[section]) kv[section] = {};
      continue;
    }
    if (isKosong(nilaiVal)) continue;

    if (!kv[section]) kv[section] = {};
    const nilai = typeof nilaiVal === 'number' ? nilaiVal : num(nilaiVal);
    kv[section][label] = nilai;
    if (!(label in flat)) flat[label] = nilai;
  }

  const totOmset = harian.reduce((a, d) => a + d.omset, 0);
  const totTerjual = harian.reduce((a, d) => a + d.terjual, 0);

  const blok = {
    periode: B.label,
    kunciBulan: B.kunciBulan,
    hariTerisi: harian.length,
    harian,
    ringkasan: {
      totalOmset: flat['Total Omset'] || totOmset,
      totalResi: flat['Resi'] || harian.reduce((a, d) => a + d.resi, 0),
      totalTerjual: flat['Produk Terjual'] || totTerjual,
      spendAdsPpn: flat['Spend Ads +ppn'] || 0,
      metaAds: flat['Meta Ads'] || 0,
      komisiAffiliate: flat['Komisi Affiliate'] || 0,
      koinPenjual: flat['Koin penjual'] || 0,
      biayaPromosiPerPcs: flat['Biaya promosi/pcs'] || 0,
      roasTotal: flat['ROAS total'] || flat['ROAS TOTAL'] || 0,
    },
    shopee: {
      omset: (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['Omset Shopee'] || 0,
      terjual: (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['Produk terjual'] || 0,
      ads: (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['Shopee Ads +ppn'] || 0,
      cpas: (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['CPAS ads+ppn'] || 0,
      komisi: (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['Komisi Affiliate'] || 0,
      biayaPerPcs: (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['Biaya promosi/pcs'] || 0,
      roas: (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['ROAS ~ Shopee']
         || (kv['SHOPEE'] || kv['SHOPEE ALL'] || {})['ROAS total'] || 0,
    },
    tiktok: {
      omset: (kv['TIKTOK'] || {})['Omset Tiktok'] || 0,
      terjual: (kv['TIKTOK'] || {})['Produk terjual'] || 0,
      ads: (kv['TIKTOK'] || {})['Tiktok Ads +ppn'] || 0,
      komisi: (kv['TIKTOK'] || {})['Komisi Affiliate'] || 0,
      biayaPerPcs: (kv['TIKTOK'] || {})['Biaya promosi/pcs'] || 0,
      roas: (kv['TIKTOK'] || {})['ROAS ~ Tiktok'] || (kv['TIKTOK'] || {})['ROAS total'] || 0,
    },
    meta: {
      spend: (kv['META ADS'] || {})['Spend'] || 0,
      ppn: (kv['META ADS'] || {})['PPN 11%'] || 0,
      total: (kv['META ADS'] || {})['TOTAL'] || 0,
      impresi: (kv['META ADS'] || {})['Impresi'] || 0,
      visit: (kv['META ADS'] || {})['Visit'] || 0,
      followersFanpage: (kv['META ADS'] || {})['Penambahan Followers Fanpages'] || 0,
      followersIg: (kv['META ADS'] || {})['Penambahan Followers IG'] || 0,
    },
    linktree: {
      totalView: (kv['VARIABLE'] || {})['Total View'] || 0,
      totalClick: (kv['VARIABLE'] || {})['Total Click'] || 0,
      klikShopee: (kv['VARIABLE'] || {})['- klik shopee'] || 0,
      klikWa: (kv['VARIABLE'] || {})['- klik WA'] || 0,
      klikMaps: (kv['VARIABLE'] || {})['- klik maps'] || 0,
      klikTiktok: (kv['VARIABLE'] || {})['- klik tiktok'] || 0,
      klikWebsite: (kv['VARIABLE'] || {})['- klik website'] || 0,
      biayaPerView: (kv['VARIABLE'] || {})['Biaya/view'] || 0,
      cpcTotal: (kv['VARIABLE'] || {})['Biaya/click (CPC Total)'] || 0,
    },
    _kv: kv,
  };

  // Bila dua sheet memuat bulan yang sama, menangkan yang datanya lebih
  // lengkap, bukan yang kebetulan diproses terakhir.
  const lama = hasil[B.kunciBulan];
  if (!lama || blok.hariTerisi > lama.hariTerisi) hasil[B.kunciBulan] = blok;
}

// ---------- 4. pilih blok berdasarkan tanggal hari ini ----------
function geser(kunciBulan, jumlahBulan) {
  const [y, m] = kunciBulan.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + jumlahBulan, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const wib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
const kunciSekarang = `${wib.getFullYear()}-${String(wib.getMonth() + 1).padStart(2, '0')}`;
const labelSekarang = `${NAMA_BULAN[wib.getMonth()]} ${wib.getFullYear()}`;

const tersedia = Object.keys(hasil).sort();
let kunciTerpakai = hasil[kunciSekarang] ? kunciSekarang : null;
const sesuaiBulanBerjalan = Boolean(kunciTerpakai);

if (!kunciTerpakai && tersedia.length) {
  kunciTerpakai = tersedia[tersedia.length - 1];
}

const bulanBerjalan = kunciTerpakai ? hasil[kunciTerpakai] : null;
const bulanSebelumnya = kunciTerpakai ? (hasil[geser(kunciTerpakai, -1)] || null) : null;
const tahunLalu = kunciTerpakai ? (hasil[geser(kunciTerpakai, -12)] || null) : null;

if (bulanBerjalan && !sesuaiBulanBerjalan) {
  bulanBerjalan.periode = bulanBerjalan.periode + ' \u00b7 bukan bulan berjalan';
}

const catatanPeriode = sesuaiBulanBerjalan
  ? null
  : `Sheet belum memuat blok "DATA PENJUALAN ${labelSekarang}". Angka yang ditampilkan berasal dari ${kunciTerpakai || 'tidak ada blok sama sekali'}.`;

return [{
  json: {
    _source: 'sales',
    bulanBerjalan,
    bulanSebelumnya,
    tahunLalu,
    periodeInfo: {
      bulanBerjalanSesungguhnya: kunciSekarang,
      labelBulanBerjalan: labelSekarang,
      blokDipakai: kunciTerpakai,
      sesuaiBulanBerjalan,
      blokTersedia: tersedia,
      jumlahSheetTerbaca: kelompok.size,
      jumlahBlokTerbaca: BLOKS.length,
      catatan: catatanPeriode,
    },
  },
}];
