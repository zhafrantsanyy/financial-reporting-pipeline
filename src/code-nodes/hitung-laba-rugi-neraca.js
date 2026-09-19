// ============================================================
// Node: Hitung Laba Rugi & Neraca (v9)
// Perubahan dari v8:
//  1. Total laba rugi dihitung dari penjumlahan akun LEAF, bukan dari
//     saldo akun induk. Saldo induk 6000 di Accurate ternyata tidak
//     memuat 600049 Owner Draw, sehingga beban operasional kurang
//     catat 256 juta dan laba bersih kelebihan sebesar itu. Neraca
//     pun tidak balance. Dengan basis leaf, identitas akuntansi
//     tertutup dan balanceCheck menjadi nol.
//  2. Pendapatan memakai seluruh akun 4 sebagai netSales, dengan
//     residu di luar penjualan inti dilaporkan terpisah, supaya tidak
//     ada akun pendapatan yang hilang diam-diam.
//  3. Blok bulanan diberi hariTercakup dan layakDilaporkan. Jendela
//     yang terlalu pendek, atau netSales nol padahal faktur berjalan,
//     ditandai tidak layak dilaporkan sebagai laba rugi.
//  4. penyusutanNol menandai bahwa belum ada penyusutan yang diposting
//     sama sekali, yang membuat laba tercatat lebih tinggi dari riil.
// ============================================================
const NODE_COA = 'Accurate GL Account List';
const NODE_TANGGAL = 'Siapkan Sesi dan Tanggal';
const NODE_MTD = 'Hitung Penjualan MTD';

const BULAN_TIDAK_LENGKAP = ['2026-01'];

// Nomor akun yang sudah punya tempat di mapping node ini. Dipakai hanya
// untuk diagnostik: akun bersaldo yang tidak ada di sini berarti akun
// baru di Accurate yang perlu ditinjau penempatannya.
const AKUN_TERPETAKAN = [
  '1101', '110101', '110102', '110103', '110104', '110105',
  '1102', '110204', '110205', '110206', '110207', '110208', '110209',
  '1103', '110301', '110302',
  '1104', '110401', '110402', '110403',
  '1105', '110506', '110507', '110508', '1106',
  '1200', '120002', '120003', '120004', '120005', '120006',
  '12000601', '12000602', '12000603', '12000604',
  '2101', '210101', '210102', '2102', '210201', '2201',
  '3000', '300001', '300002', '300003',
  '4000', '400001', '400003', '400004', '400009', '400010', '4-9001',
  '4401', '440101', '440102', '440103', '440104',
  '5-1100', '5-1200', '5101', '5102', '5103', '5104', '5105', '5106',
  '6000', '600002',
  '60000201', '60000203', '60000204', '60000205',
  '60000206', '60000207', '60000208', '60000209',
  '600003', '60000301', '60000302', '60000303',
  '600004', '60000401', '60000402', '60000403',
  '600005', '600006', '600007', '600008', '600009', '600010',
  '600011', '600013', '600016', '600017', '600020',
  '600021', '600022', '600023', '600024', '600025',
  '600026', '600027', '600028', '600029',
  '600032', '600033', '600034', '600036', '600037', '600038', '600039',
  '600040', '600041', '600042', '600043', '600044', '600045', '600046',
  '600047', '600048', '600049', '600050', '600051', '600052', '600053',
  '600054', '600055', '600056', '600057', '600058',
  '7100', '710002', '710006', '7200', '720002', '720008', '7201', '7202',
];

// --- 1. Ambil raw items ---
let rawItems;
try {
  rawItems = $(NODE_COA).all();
} catch (e) {
  rawItems = $input.all();
}

function extractAccounts(json) {
  if (Array.isArray(json)) {
    if (json.length && json[0] && Array.isArray(json[0].d)) {
      return json.flatMap(page => page.d || []);
    }
    if (json.length && json[0] && ('no' in json[0] || 'accountType' in json[0])) {
      return json;
    }
    return json.flatMap(x => extractAccounts(x));
  }
  if (json && Array.isArray(json.d)) return json.d;
  return [];
}

let allAccounts = [];
for (const item of rawItems) {
  allAccounts = allAccounts.concat(extractAccounts(item.json));
}

const seenIds = new Set();
allAccounts = allAccounts.filter(acc => {
  if (acc.id == null) return true;
  if (seenIds.has(acc.id)) return false;
  seenIds.add(acc.id);
  return true;
});

if (allAccounts.length === 0) {
  throw new Error(`Hitung Laba Rugi & Neraca: tidak ada akun dari node "${NODE_COA}".`);
}

// --- 2. Info tanggal ---
let infoTanggal = {};
try {
  infoTanggal = $(NODE_TANGGAL).first().json || {};
} catch (e) {
  infoTanggal = {};
}
const isoAcuan = infoTanggal.isoKemarin || new Date().toISOString().slice(0, 10);
const bulanKey = isoAcuan.slice(0, 7);
const labelBulan = infoTanggal.labelBulan || bulanKey;
const tahunKey = isoAcuan.slice(0, 4);
const nomorBulan = Number(isoAcuan.slice(5, 7));

// --- 2b. Penjualan MTD dari faktur (tidak butuh baseline) ---
let penjualanMTD = { tersedia: false, alasanKosong: 'Node Hitung Penjualan MTD tidak dapat dibaca.' };
try {
  const j = $(NODE_MTD).first().json || {};
  if (j.penjualanMTD) penjualanMTD = j.penjualanMTD;
} catch (e) { /* biarkan default */ }

let modeEksekusi = 'tidak diketahui';
try { modeEksekusi = $execution.mode || 'tidak diketahui'; } catch (e) { /* noop */ }

function bulanSebelumnya(key) {
  const [y, mm] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function jarakBulan(dari, sampai) {
  const [y1, m1] = String(dari).split('-').map(Number);
  const [y2, m2] = String(sampai).split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
function selisihHari(a, b) {
  const x = Date.parse(a), y = Date.parse(b);
  if (!isFinite(x) || !isFinite(y)) return null;
  return Math.round((y - x) / 86400000);
}
const keyBulanLalu = bulanSebelumnya(bulanKey);

// --- 3. Peta saldo saat ini + deteksi akun leaf ---
const saldoSekarang = {};
const namaAkun = {};
for (const acc of allAccounts) {
  if (acc.no) {
    saldoSekarang[acc.no] = acc.balance || 0;
    namaAkun[acc.no] = acc.name || '';
  }
}

// Akun induk = nomornya menjadi awalan nomor akun lain (mis. 1101 induk
// dari 110101). Seluruh agregasi laba rugi memakai akun leaf, karena
// saldo akun induk di Accurate tidak selalu memuat semua anaknya.
const semuaNo = Object.keys(saldoSekarang);
const setParent = new Set();
for (let i = 0; i < semuaNo.length; i++) {
  const a = semuaNo[i];
  for (let j = 0; j < semuaNo.length; j++) {
    const b = semuaNo[j];
    if (a !== b && b.startsWith(a)) { setParent.add(a); break; }
  }
}
const daftarNoLeaf = semuaNo.filter(no => !setParent.has(no));
function sumLeafPrefix(pfx) {
  return daftarNoLeaf
    .filter(no => no.startsWith(pfx))
    .reduce((s, no) => s + (saldoSekarang[no] || 0), 0);
}

// ============================================================
// SNAPSHOT: DUA STORE TERPISAH
// ============================================================
const staticData = $getWorkflowStaticData('global');
if (!staticData.snapshotAkun) staticData.snapshotAkun = {};
if (!staticData.snapshotAwal) staticData.snapshotAwal = {};

staticData.snapshotAkun[bulanKey] = {
  tanggal: isoAcuan,
  saldo: Object.assign({}, saldoSekarang),
};
if (!staticData.snapshotAwal[bulanKey]) {
  staticData.snapshotAwal[bulanKey] = {
    tanggal: isoAcuan,
    saldo: Object.assign({}, saldoSekarang),
  };
}

for (const store of [staticData.snapshotAkun, staticData.snapshotAwal]) {
  const keys = Object.keys(store).sort();
  while (keys.length > 14) delete store[keys.shift()];
}

// ============================================================
// RESOLUSI BASIS BULANAN
// ============================================================
let baseline = null;
let sumberBaseline = null;
let tanggalBaseline = null;
let periodeBaseline = null;
let basisTipe = null;
let bulanTercakup = 0;

const snapBulanLalu = staticData.snapshotAkun[keyBulanLalu];

if (snapBulanLalu && snapBulanLalu.saldo) {
  baseline = snapBulanLalu.saldo;
  sumberBaseline = 'snapshot akhir ' + keyBulanLalu;
  tanggalBaseline = snapBulanLalu.tanggal;
  periodeBaseline = keyBulanLalu;
  basisTipe = 'mtd-penuh';
  bulanTercakup = 1;
} else {
  const awal = staticData.snapshotAwal[bulanKey];
  const kandidat = Object.keys(staticData.snapshotAkun)
    .filter(k => k < bulanKey && staticData.snapshotAkun[k] && staticData.snapshotAkun[k].saldo)
    .sort();
  const terbaru = kandidat.length ? kandidat[kandidat.length - 1] : null;

  if (awal && awal.saldo && awal.tanggal < isoAcuan) {
    baseline = awal.saldo;
    sumberBaseline = 'snapshot awal bulan berjalan per ' + awal.tanggal;
    tanggalBaseline = awal.tanggal;
    periodeBaseline = bulanKey;
    basisTipe = 'mtd-parsial';
    bulanTercakup = 1;
  } else if (terbaru) {
    baseline = staticData.snapshotAkun[terbaru].saldo;
    sumberBaseline = 'snapshot akhir ' + terbaru;
    tanggalBaseline = staticData.snapshotAkun[terbaru].tanggal;
    periodeBaseline = terbaru;
    basisTipe = 'kumulatif';
    bulanTercakup = Math.max(1, jarakBulan(terbaru, bulanKey));
  }
}

// ============================================================
// FACTORY METRIK LABA RUGI (berbasis akun leaf)
// ============================================================
function buildLabaRugi(bal, listNo) {
  function sumPrefix(prefix) {
    return listNo.filter(no => no.startsWith(prefix)).reduce((s, no) => s + bal(no), 0);
  }

  const grossSales = bal('400001');
  const salesReturns = bal('400003');
  const salesDiscountMain = bal('400004');
  const salesDiscountChannel = sumPrefix('4401');
  const penjualanInti = grossSales + salesReturns + salesDiscountMain + salesDiscountChannel;

  // Seluruh akun pendapatan, termasuk yang belum masuk rincian di atas.
  // Memakai total ini membuat identitas akuntansi tertutup.
  const pendapatanTotal = sumPrefix('4');
  const pendapatanLainnya = pendapatanTotal - penjualanInti;
  const netSales = pendapatanTotal;

  const cogs = sumPrefix('5');
  const grossProfit = netSales - cogs;
  const grossMarginPct = netSales !== 0 ? (grossProfit / netSales) * 100 : 0;

  const discountByChannel = {
    'Offline': bal('440101'),
    'Shopee Qudamah': bal('440102'),
    'Tiktok Qudamah': bal('440103'),
    'Lazada Qudamah': bal('440104'),
  };

  const cogsDetail = {
    bebanPokokPenjualan: bal('5101'),
    gajiFinishing: bal('5102'),
    hppJasaPotong: bal('5103'),
    hppJasaJahit: bal('5104'),
    hppOngkirPembelian: bal('5105'),
    jasaBordir: bal('5106'),
    biayaProduksiEmbos: bal('5-1100'),
    ongkirProduksiEmbos: bal('5-1200'),
  };

  const adSpendByChannel = {
    'Tiktok Qudamah': bal('600032'),
    'Shopee Afghan': bal('600033'),
    'Shopee Qudamah': bal('600034'),
    'Lazada': bal('600036'),
    'Metta': bal('600051'),
  };
  const totalAdSpend = Object.values(adSpendByChannel).reduce((s, v) => s + v, 0);

  const affiliateCommissionByChannel = {
    'Shopee Afghan': bal('60000206'),
    'Shopee Qudamah': bal('60000207'),
    'Tiktok Qudamah': bal('60000208'),
  };
  const totalAffiliateCommission = Object.values(affiliateCommissionByChannel).reduce((s, v) => s + v, 0);

  const platformFeeByChannel = {
    'Shopee Afghan': bal('60000201'),
    'Shopee Qudamah': bal('60000203'),
    'Tiktok Qudamah': bal('60000204'),
    'Lazada Qudamah': bal('60000205'),
    'Desty Store': bal('60000209'),
  };
  const totalPlatformFee = Object.values(platformFeeByChannel).reduce((s, v) => s + v, 0);

  const shippingByChannel = {
    'Shopee Afghan': bal('600026'),
    'Shopee Qudamah': bal('600027'),
    'Tiktok Qudamah': bal('600028'),
    'Lazada': bal('600029'),
    'Offline': bal('600055'),
  };
  const totalShipping = Object.values(shippingByChannel).reduce((s, v) => s + v, 0);

  const totalMarketingCost = totalAdSpend + totalAffiliateCommission + totalPlatformFee;
  const marketingCostToSalesPct = netSales !== 0 ? (totalMarketingCost / Math.abs(netSales)) * 100 : 0;

  const marketing = {
    adSpendByChannel, totalAdSpend,
    affiliateCommissionByChannel, totalAffiliateCommission,
    platformFeeByChannel, totalPlatformFee,
    totalMarketingCost,
    marketingCostToSalesPct: Number(marketingCostToSalesPct.toFixed(1)),
    shippingByChannel, totalShipping,
    refundOngkirTiktok: bal('600025'),
    ongkirEcommerceSample: bal('600048'),
  };

  const channelAliases = {
    'Shopee Afghan': ['Shopee Afghan'],
    'Shopee Qudamah': ['Shopee Qudamah'],
    'Tiktok Qudamah': ['Tiktok Qudamah', 'Tiktok'],
    'Lazada': ['Lazada', 'Lazada Qudamah'],
    'Offline': ['Offline'],
    'Desty Store': ['Desty Store'],
  };
  function pick(dict, channel) {
    for (const alias of channelAliases[channel]) {
      if (dict[alias] !== undefined) return dict[alias];
    }
    return 0;
  }
  const channelPnL = {};
  for (const channel of Object.keys(channelAliases)) {
    const discount = pick(discountByChannel, channel);
    const adSpend = pick(adSpendByChannel, channel);
    const affiliate = pick(affiliateCommissionByChannel, channel);
    const platformFee = pick(platformFeeByChannel, channel);
    const shipping = pick(shippingByChannel, channel);
    channelPnL[channel] = {
      discount, adSpend, affiliate, platformFee, shipping,
      totalDeduction: adSpend + affiliate + platformFee + shipping - discount,
    };
  }

  // Basis leaf, bukan saldo induk 6000 yang terbukti tidak memuat
  // seluruh anaknya di Accurate.
  const operatingExpenseTotal = sumPrefix('6');
  const otherIncome = sumPrefix('71');
  const otherExpense = sumPrefix('72');
  const netProfit = grossProfit - operatingExpenseTotal + otherIncome - otherExpense;
  const netMarginPct = netSales !== 0 ? (netProfit / Math.abs(netSales)) * 100 : 0;

  const opexBreakdown = {
    komisi: sumPrefix('600002'),
    payroll: sumPrefix('600004'),
    kendaraan: sumPrefix('600003'),
    kontenProduksi: bal('600046'),
    iklan: totalAdSpend,
    utilitas: {
      listrik: bal('600011'),
      indihome: bal('600013'),
      pulsaData: bal('600044'),
    },
  };
  opexBreakdown.utilitas.total =
    opexBreakdown.utilitas.listrik + opexBreakdown.utilitas.indihome + opexBreakdown.utilitas.pulsaData;
  opexBreakdown.lainnya = operatingExpenseTotal
    - opexBreakdown.komisi - opexBreakdown.payroll - opexBreakdown.kendaraan
    - opexBreakdown.kontenProduksi - opexBreakdown.iklan - opexBreakdown.utilitas.total;

  const zakatQurbanOwner = {
    zakat: bal('600053'),
    qurban: bal('600056'),
    ownerDraw: bal('600049'),
  };
  const totalZakatQurbanOwner =
    zakatQurbanOwner.zakat + zakatQurbanOwner.qurban + zakatQurbanOwner.ownerDraw;

  const adjustedNetProfit = netProfit + totalZakatQurbanOwner;
  const adjustedNetMarginPct = netSales !== 0 ? (adjustedNetProfit / Math.abs(netSales)) * 100 : 0;

  return {
    sales: {
      grossSales, salesReturns,
      salesDiscount: salesDiscountMain + salesDiscountChannel,
      penjualanInti, pendapatanLainnya,
      netSales, cogs, grossProfit,
      grossMarginPct: Number(grossMarginPct.toFixed(1)),
      discountByChannel,
    },
    cogsDetail, marketing, channelPnL,
    profitability: {
      netSales, grossProfit, operatingExpenseTotal,
      otherIncome, otherExpense, netProfit,
      netMarginPct: Number(netMarginPct.toFixed(1)),
      opexBreakdown, zakatQurbanOwner, totalZakatQurbanOwner,
      adjusted: {
        operatingExpense: operatingExpenseTotal - totalZakatQurbanOwner,
        netProfit: adjustedNetProfit,
        netMarginPct: Number(adjustedNetMarginPct.toFixed(1)),
      },
    },
  };
}

// ============================================================
// DATA 1: TAHUNAN (YTD)
// ============================================================
const tahunan = buildLabaRugi(no => saldoSekarang[no] || 0, daftarNoLeaf);
tahunan.tersedia = true;
tahunan.layakDilaporkan = true;
tahunan.tipe = 'tahunan';
tahunan.basisTipe = 'ytd';
tahunan.periode = `Tahun ${tahunKey} s.d. ${labelBulan}`;
tahunan.sales.accountsReceivable = saldoSekarang['110301'] || 0;
tahunan.catatan = BULAN_TIDAK_LENGKAP.some(b => b.startsWith(tahunKey))
  ? `Mencakup ${BULAN_TIDAK_LENGKAP.join(', ')} yang datanya belum lengkap di Accurate, angka tahunan cenderung lebih rendah dari kondisi riil.`
  : null;

// ============================================================
// DATA 2: BULANAN
// ============================================================
const fnBulanan = baseline
  ? (no => (saldoSekarang[no] || 0) - (baseline[no] || 0))
  : (() => 0);

const bulanan = buildLabaRugi(fnBulanan, daftarNoLeaf);
bulanan.tipe = 'bulanan';
bulanan.tersedia = Boolean(baseline);
bulanan.basisTipe = basisTipe;
bulanan.basisPenuh = basisTipe === 'mtd-penuh';
bulanan.bulanTercakup = bulanTercakup;
bulanan.baselineDari = periodeBaseline;
bulanan.sumberBaseline = sumberBaseline;
bulanan.tanggalBaseline = tanggalBaseline;
bulanan.penjualanDariFaktur = penjualanMTD;

// Berapa hari yang sebenarnya tercakup blok ini.
let hariTercakup = null;
if (basisTipe === 'mtd-penuh') {
  hariTercakup = Number(isoAcuan.slice(8, 10));
} else if (basisTipe === 'mtd-parsial' && /^\d{4}-\d{2}-\d{2}$/.test(String(tanggalBaseline))) {
  hariTercakup = selisihHari(tanggalBaseline, isoAcuan);
}
bulanan.hariTercakup = hariTercakup;

// Jendela terlalu pendek, atau pendapatan tidak bergerak sama sekali
// padahal faktur bulan berjalan jelas ada. Dalam dua kondisi itu angka
// laba rugi bulanan tidak boleh disajikan, karena yang terbaca cuma
// riak pembalikan jurnal, bukan kinerja.
const pendapatanDiam = bulanan.sales.netSales === 0
  && penjualanMTD && penjualanMTD.tersedia && (penjualanMTD.totalPenjualanBruto || 0) > 0;
const jendelaTerlaluPendek = hariTercakup !== null && hariTercakup < 3;
bulanan.pendapatanDiam = pendapatanDiam;
bulanan.jendelaTerlaluPendek = jendelaTerlaluPendek;
bulanan.layakDilaporkan = Boolean(baseline) && !pendapatanDiam && !jendelaTerlaluPendek;

if (!baseline) {
  bulanan.periode = `${labelBulan} (dari faktur penjualan)`;
  bulanan.catatan = 'Belum ada snapshot saldo sebagai pembanding. Pakai penjualanDariFaktur sebagai angka bulan berjalan. Snapshot pertama tersimpan pada eksekusi production berikutnya.';
} else if (basisTipe === 'mtd-penuh') {
  bulanan.periode = labelBulan;
  bulanan.catatan = null;
} else if (basisTipe === 'mtd-parsial') {
  bulanan.periode = `${labelBulan} (sejak ${tanggalBaseline}, ${hariTercakup === null ? '?' : hariTercakup} hari)`;
  bulanan.catatan = jendelaTerlaluPendek || pendapatanDiam
    ? `Blok laba rugi bulanan tidak disajikan. Basisnya hanya ${hariTercakup === null ? 'beberapa' : hariTercakup} hari sejak ${tanggalBaseline}${pendapatanDiam ? ', dan pada rentang itu akun pendapatan tidak bergerak sama sekali padahal faktur bulan berjalan jelas ada' : ''}. Yang terbaca hanya riak pembalikan jurnal, bukan kinerja. Pakai penjualanDariFaktur untuk bulan berjalan. MTD penuh terbentuk sendiri setelah snapshot akhir bulan ini tersimpan.`
    : `Angka pada blok ini adalah perubahan saldo sejak ${tanggalBaseline}, belum mencakup awal bulan.`;
} else {
  bulanan.periode = `Kumulatif ${bulanTercakup} bulan sejak ${tanggalBaseline}`;
  bulanan.catatan = `Angka pada blok ini akumulasi ${bulanTercakup} bulan sejak ${tanggalBaseline}, bukan bulan berjalan saja. Sebut periodenya apa adanya.`;
}

// ============================================================
// DATA 3: RATA-RATA PER BULAN
// ============================================================
const bulanTerhitung = Math.max(1, nomorBulan);
const rataRataBulanan = {
  tipe: 'rata-rata',
  tersedia: true,
  periode: `Rata-rata per bulan (${tahunKey}, ${bulanTerhitung} bulan)`,
  catatan: 'Total tahun berjalan dibagi jumlah bulan. Ini pembanding historis, bukan realisasi bulan berjalan. Dilarang diproratakan menjadi perkiraan bulan ini.',
  netSales: tahunan.sales.netSales / bulanTerhitung,
  cogs: tahunan.sales.cogs / bulanTerhitung,
  grossProfit: tahunan.sales.grossProfit / bulanTerhitung,
  totalMarketingCost: tahunan.marketing.totalMarketingCost / bulanTerhitung,
  totalAdSpend: tahunan.marketing.totalAdSpend / bulanTerhitung,
  operatingExpense: tahunan.profitability.operatingExpenseTotal / bulanTerhitung,
  netProfit: tahunan.profitability.netProfit / bulanTerhitung,
};

// ============================================================
// POSISI
// ============================================================
function bal(no) { return saldoSekarang[no] || 0; }
function balLeaf(pfx) { return sumLeafPrefix(pfx); }

const inventory = {
  inventoryOnHand: bal('110401'),
  inventoryInTransit: bal('110402'),
  inventoryWip: bal('110403'),
  inventoryTotal: balLeaf('1104'),
  inventoryVarianceExpense: bal('600050'),
  stockOpnameExpense: bal('600038'),
};

const cash = {
  cashBank: {
    'Kas Kecil': bal('110101'),
    'Bank BRI (Hadfa)': bal('110102'),
    'Bank BSI': bal('110103'),
    'Tunai': bal('110104'),
    'Bank BRI (Cecep)': bal('110105'),
  },
  totalCashBank: balLeaf('1101'),
  marketplaceWallet: {
    'Shopee Afghan': bal('110204'),
    'Shopee Qudamah': bal('110205'),
    'Tiktok': bal('110206'),
    'Lazada': bal('110207'),
    'Offline': bal('110208'),
    'Desty Store': bal('110209'),
  },
  totalMarketplaceWallet: balLeaf('1102'),
  totalLiquidAssets: balLeaf('1101') + balLeaf('1102'),
};

const asetLancar = {
  kasBank: balLeaf('1101'),
  setaraKas: balLeaf('1102'),
  piutangUsaha: balLeaf('1103'),
  persediaan: balLeaf('1104'),
  asetLancarLainnya: balLeaf('1105'),
  investasiLogamMulia: balLeaf('1106'),
};
const totalAsetLancar = Object.values(asetLancar).reduce((s, v) => s + v, 0);
const asetTetapKotor = balLeaf('1200');
const akumulasiDepresiasi = balLeaf('120006');
const asetTetapBersih = asetTetapKotor - akumulasiDepresiasi;
const totalAset = balLeaf('1');

const liabilitas = {
  utangUsaha: balLeaf('2101'),
  kewajibanJangkaPendekLainnya: balLeaf('2102'),
  utangJangkaPanjang: balLeaf('2201'),
};
const totalLiabilitas = balLeaf('2');
const totalEkuitas = balLeaf('3');

const neraca = {
  asetLancar, totalAsetLancar,
  asetTetapKotor, akumulasiDepresiasi, asetTetapBersih,
  totalAset, liabilitas, totalLiabilitas, totalEkuitas,
};

const liabilitasLancar = liabilitas.utangUsaha + liabilitas.kewajibanJangkaPendekLainnya;
const liquidityRatios = {
  currentRatio: liabilitasLancar > 1000 ? Number((totalAsetLancar / liabilitasLancar).toFixed(2)) : null,
  cashRatio: liabilitasLancar > 1000
    ? Number(((asetLancar.kasBank + asetLancar.setaraKas) / liabilitasLancar).toFixed(2))
    : null,
  catatan: liabilitasLancar > 1000
    ? null
    : 'Liabilitas lancar nyaris nol, sehingga rasio likuiditas tidak bermakna dan sengaja tidak ditampilkan.',
};

const expectedTotal = totalLiabilitas + totalEkuitas + tahunan.profitability.netProfit;
const balanceCheck = {
  totalAset,
  totalLiabilitasPlusEkuitasPlusLaba: expectedTotal,
  selisih: Number((totalAset - expectedTotal).toFixed(2)),
};

const pergerakanBulanan = baseline ? {
  tersedia: true,
  basisTipe,
  sejak: tanggalBaseline,
  hariTercakup,
  kasBank: fnBulanan('1101') + daftarNoLeaf.filter(n => n.startsWith('1101')).reduce((s, n) => s + fnBulanan(n), 0) - fnBulanan('1101'),
  setaraKas: daftarNoLeaf.filter(n => n.startsWith('1102')).reduce((s, n) => s + fnBulanan(n), 0),
  piutangUsaha: daftarNoLeaf.filter(n => n.startsWith('1103')).reduce((s, n) => s + fnBulanan(n), 0),
  persediaan: daftarNoLeaf.filter(n => n.startsWith('1104')).reduce((s, n) => s + fnBulanan(n), 0),
} : { tersedia: false };

// ============================================================
// DIAGNOSTIK NERACA
// ============================================================
const asetLeaf = sumLeafPrefix('1');
const liabLeaf = sumLeafPrefix('2');
const ekuitasLeaf = sumLeafPrefix('3');
const pendapatanLeaf = sumLeafPrefix('4');
const cogsLeaf = sumLeafPrefix('5');
const bebanLeaf = sumLeafPrefix('6');
const pendapatanLainLeaf = sumLeafPrefix('71');
const bebanLainLeaf = sumLeafPrefix('72');
const labaLeaf = pendapatanLeaf - cogsLeaf - bebanLeaf + pendapatanLainLeaf - bebanLainLeaf;
const selisihIdentitas = Number((asetLeaf - (liabLeaf + ekuitasLeaf + labaLeaf)).toFixed(2));

function rekon(label, mapping, leaf) {
  return { pos: label, mapping: Number(mapping.toFixed(2)), leaf: Number(leaf.toFixed(2)), selisih: Number((leaf - mapping).toFixed(2)) };
}
const rekonsiliasi = [
  rekon('Total Aset', totalAset, asetLeaf),
  rekon('Total Liabilitas', totalLiabilitas, liabLeaf),
  rekon('Total Ekuitas', totalEkuitas, ekuitasLeaf),
  rekon('Penjualan Bersih', tahunan.sales.netSales, pendapatanLeaf),
  rekon('COGS', tahunan.sales.cogs, cogsLeaf),
  rekon('Beban Operasional', tahunan.profitability.operatingExpenseTotal, bebanLeaf),
].filter(r => Math.abs(r.selisih) > 1000);

const AKUN_DIKENAL = new Set(AKUN_TERPETAKAN);
const akunTidakDikenal = daftarNoLeaf
  .filter(no => !AKUN_DIKENAL.has(no) && (saldoSekarang[no] || 0) !== 0)
  .map(no => ({ no, nama: namaAkun[no], saldo: Number((saldoSekarang[no] || 0).toFixed(2)) }))
  .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
const totalAkunTidakDikenal = Number(akunTidakDikenal.reduce((s, a) => s + a.saldo, 0).toFixed(2));

const akunPenyusutan = allAccounts
  .filter(a => /akumulasi|penyusutan|depresiasi/i.test(String(a.name || '')))
  .map(a => ({ no: a.no, nama: a.name, saldo: a.balance || 0 }));
const penyusutanNol = akunPenyusutan.length > 0 && akunPenyusutan.every(a => (a.saldo || 0) === 0);

let dugaanPenyebab;
if (Math.abs(selisihIdentitas) <= 1000) {
  dugaanPenyebab = 'Identitas akuntansi berbasis akun leaf seimbang. Total laba rugi juga sudah memakai basis leaf, jadi balanceCheck ikut tertutup.';
} else if (akunTidakDikenal.length && Math.abs(totalAkunTidakDikenal - selisihIdentitas) < 1000) {
  dugaanPenyebab = 'Selisih cocok dengan total akun yang belum terdaftar di mapping. Tambahkan akun pada akunTidakDikenal ke AKUN_TERPETAKAN dan ke logika node ini.';
} else if (allAccounts.length % 100 === 0) {
  dugaanPenyebab = `Jumlah akun terambil (${allAccounts.length}) adalah kelipatan page size. Pagination kemungkinan terputus.`;
} else {
  dugaanPenyebab = 'Selisih tidak dijelaskan mapping maupun pagination. Kemungkinan jurnal tidak seimbang di Accurate.';
}

const diagnostikNeraca = {
  jumlahAkunTerambil: allAccounts.length,
  jumlahAkunLeaf: daftarNoLeaf.length,
  totalPerKelompokLeaf: {
    aset: Number(asetLeaf.toFixed(2)),
    liabilitas: Number(liabLeaf.toFixed(2)),
    ekuitas: Number(ekuitasLeaf.toFixed(2)),
    pendapatan: Number(pendapatanLeaf.toFixed(2)),
    cogs: Number(cogsLeaf.toFixed(2)),
    bebanOperasional: Number(bebanLeaf.toFixed(2)),
    pendapatanLain: Number(pendapatanLainLeaf.toFixed(2)),
    bebanLain: Number(bebanLainLeaf.toFixed(2)),
    labaBerjalan: Number(labaLeaf.toFixed(2)),
  },
  selisihIdentitas,
  seimbang: Math.abs(selisihIdentitas) <= 1000,
  rekonsiliasiMappingVsLeaf: rekonsiliasi,
  akunTidakDikenal: akunTidakDikenal.slice(0, 25),
  jumlahAkunTidakDikenal: akunTidakDikenal.length,
  totalAkunTidakDikenal,
  akunPenyusutan,
  penyusutanNol,
  peringatanPenyusutan: penyusutanNol
    ? 'Seluruh akun akumulasi penyusutan dan beban penyusutan bersaldo nol. Tidak ada depresiasi yang diposting sepanjang periode, sehingga laba tercatat lebih tinggi dari kondisi riil dan nilai aset tetap tidak menyusut.'
    : null,
  dugaanPenyebab,
};

// ============================================================
// DIAGNOSTIK BASIS
// ============================================================
const diagnostik = {
  modeEksekusi,
  snapshotTerakhirTersimpan: Object.keys(staticData.snapshotAkun).sort(),
  snapshotAwalTersimpan: Object.keys(staticData.snapshotAwal).sort(),
  baselineDicari: keyBulanLalu,
  baselineDitemukan: Boolean(baseline),
  basisTipe,
  bulanTercakup,
  hariTercakup,
  sumberBaseline,
  peringatanStaticData: modeEksekusi !== 'production'
    ? 'Eksekusi ini bukan production run. Snapshot saldo TIDAK tersimpan, sehingga basis bulanan tidak akan pernah terbentuk. Aktifkan workflow agar jadwal berjalan sebagai production.'
    : null,
};

// ============================================================
// KONTRAK DATA UNTUK AI AGENT
// ============================================================
const dataQuality = {
  dilarangMembuatEstimasi: true,
  bulananAkuntansiTersedia: bulanan.tersedia,
  bulananLayakDilaporkan: bulanan.layakDilaporkan,
  basisBulanan: basisTipe || 'tidak ada',
  bulananAdalahMTDMurni: basisTipe === 'mtd-penuh',
  hariTercakupBlokBulanan: hariTercakup,
  labelBasisBulanan: bulanan.periode,
  peringatanBasisBulanan: bulanan.layakDilaporkan
    ? (basisTipe === 'mtd-penuh' ? null
      : `Blok bulanan memakai basis ${basisTipe} dengan label "${bulanan.periode}". Sebut periodenya apa adanya.`)
    : `Blok laba rugi bulanan TIDAK LAYAK dilaporkan. ${bulanan.catatan} Untuk bulan berjalan, gunakan hanya penjualanBulanBerjalan dan posisi.pergerakanBulanan.`,
  sumberBaseline,
  tanggalBaseline,
  penjualanMTDTersedia: Boolean(penjualanMTD && penjualanMTD.tersedia),
  sumberPenjualanBulanBerjalan: (penjualanMTD && penjualanMTD.tersedia)
    ? 'faktur penjualan Accurate (sales-invoice/list.do)'
    : 'tidak tersedia',
  neracaSeimbang: diagnostikNeraca.seimbang,
  selisihNeraca: diagnostikNeraca.selisihIdentitas,
  penyusutanBelumDiposting: penyusutanNol,
  snapshotAkanTersimpan: modeEksekusi === 'production',
  metrikYangTidakBolehDilaporkan: bulanan.layakDilaporkan
    ? []
    : ['bulanan.sales', 'bulanan.cogsDetail', 'bulanan.marketing', 'bulanan.channelPnL', 'bulanan.profitability'],
};

return [{
  json: {
    generatedAt: new Date().toISOString(),
    accountCount: allAccounts.length,
    periode: {
      bulanKey,
      labelBulan,
      tanggalAcuan: infoTanggal.labelTanggal || isoAcuan,
      isoAcuan,
      tahunKey,
    },
    dataQuality,
    bulanan,
    tahunan,
    rataRataBulanan,
    penjualanMTD,
    posisi: { inventory, cash, neraca, liquidityRatios, balanceCheck, pergerakanBulanan },
    diagnostik,
    diagnostikNeraca,
    sales: tahunan.sales,
    cogsDetail: tahunan.cogsDetail,
    marketing: tahunan.marketing,
    channelPnL: tahunan.channelPnL,
    profitability: tahunan.profitability,
    inventory, cash, neraca, liquidityRatios, balanceCheck,
  },
}];
