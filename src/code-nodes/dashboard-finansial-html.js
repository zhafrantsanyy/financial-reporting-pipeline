// ============================================================
// Node: Dashboard HTML Finansial (v4)
// Input : output node 'Hitung Laba Rugi & Neraca'
// Perubahan dari v3:
//  1. Blok laba rugi hanya dirender kalau layakDilaporkan. Jendela
//     basis yang cuma beberapa hari, atau pendapatan yang tidak
//     bergerak padahal faktur jelas ada, tidak lagi ditampilkan
//     sebagai laba rugi karena yang terbaca hanya riak jurnal.
//  2. Tab Bulan Berjalan diisi data Accurate yang memang sahih untuk
//     periode itu: faktur penjualan dan pergerakan pos neraca.
//  3. Tabel Penjualan memisahkan penjualan inti dan pendapatan lain,
//     dan Beban Operasional menampilkan pos iklan serta sisanya,
//     supaya angka total tidak lagi terlihat tanpa penjelasan.
//  4. Rasio likuiditas disembunyikan saat tidak bermakna, dan
//     penyusutan yang belum diposting dimunculkan sebagai peringatan.
// ============================================================
const NODE_METRICS = 'Hitung Laba Rugi & Neraca';

let m;
try {
  m = $(NODE_METRICS).first().json;
} catch (e) {
  m = $input.first().json;
}
if (!m || !m.tahunan) {
  throw new Error(`Dashboard HTML: data tidak ditemukan dari node "${NODE_METRICS}".`);
}

const { periode, bulanan, tahunan, posisi, diagnostikNeraca } = m;
const { inventory, cash, neraca, liquidityRatios, balanceCheck, pergerakanBulanan } = posisi;

// ---------- Helper ----------
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function rp(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '-' : '') + 'Rp ' + Math.abs(v).toLocaleString('id-ID');
}
function rpShort(n) {
  const v = n || 0;
  const a = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toFixed(2) + ' M';
  if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toFixed(1) + ' jt';
  if (a >= 1e3) return s + 'Rp ' + (a / 1e3).toFixed(0) + ' rb';
  return s + 'Rp ' + a.toFixed(0);
}
function pct(n) { return Number(n || 0).toFixed(1) + '%'; }
function nz(o) { return Object.entries(o || {}).filter(([, v]) => v !== 0); }
function cls(n) { return (n || 0) < 0 ? 'neg' : 'pos'; }

const LABEL_BASIS = {
  'mtd-penuh': 'dihitung dari saldo akhir bulan lalu',
  'mtd-parsial': 'selisih saldo sejak snapshot pertama bulan ini',
  'kumulatif': 'akumulasi beberapa bulan, bukan bulan berjalan saja',
  'ytd': 'akumulasi sejak awal tahun fiskal',
};
function labelBasis(t) {
  return t ? (LABEL_BASIS[t] || t) : 'diambil dari faktur penjualan Accurate';
}
const BASIS_PERLU_PERHATIAN = ['mtd-parsial', 'kumulatif'];

// ---------- Komponen ----------
function kpi(label, value, sub, tone) {
  return `<div class="kpi ${tone || ''}">
    <div class="kpi-l">${esc(label)}</div>
    <div class="kpi-v">${esc(value)}</div>
    ${sub ? `<div class="kpi-s">${esc(sub)}</div>` : ''}
  </div>`;
}

function stripPeriode(d) {
  const kelas = (d.layakDilaporkan === false || BASIS_PERLU_PERHATIAN.indexOf(d.basisTipe) >= 0)
    ? 'periode alarm' : 'periode';
  return `<div class="${kelas}">Periode blok ini: <b>${esc(d.periode || '-')}</b><span>${esc(labelBasis(d.basisTipe))}</span></div>`;
}

function tabelRows(rows) {
  return rows.map(r => `<tr class="${r.strong ? 'strong' : ''}${r.indent ? ' ind' : ''}">
    <td>${esc(r.label)}</td>
    <td class="num ${r.tone || ''}">${esc(r.value)}</td>
    ${r.extra !== undefined ? `<td class="num muted">${esc(r.extra)}</td>` : '<td class="num muted"></td>'}
  </tr>`).join('');
}

function tabel(judul, rows, kolom3) {
  return `<div class="card">
    <h3>${esc(judul)}</h3>
    <table>
      <thead><tr><th>Pos</th><th class="num">Nilai</th><th class="num">${esc(kolom3 || '')}</th></tr></thead>
      <tbody>${tabelRows(rows)}</tbody>
    </table>
  </div>`;
}

function barChart(judul, data, opsi) {
  const items = data.filter(d => d.value !== 0);
  if (!items.length) return '';
  const max = Math.max(...items.map(d => Math.abs(d.value)));
  const bars = items.map(d => {
    const w = max === 0 ? 0 : (Math.abs(d.value) / max) * 100;
    return `<div class="bar-row">
      <div class="bar-lab">${esc(d.label)}</div>
      <div class="bar-track"><div class="bar-fill ${d.value < 0 ? 'neg' : ''}" style="width:${w.toFixed(1)}%"></div></div>
      <div class="bar-val">${esc((opsi && opsi.short) ? rpShort(d.value) : rp(d.value))}</div>
    </div>`;
  }).join('');
  return `<div class="card"><h3>${esc(judul)}</h3><div class="bars">${bars}</div></div>`;
}

function donut(judul, data) {
  const items = data.filter(d => d.value > 0);
  const total = items.reduce((s, d) => s + d.value, 0);
  if (!total) return '';
  const palette = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#64748b'];
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  const segs = items.map((d, i) => {
    const frac = d.value / total;
    const len = frac * C;
    const seg = `<circle r="${R}" cx="100" cy="100" fill="transparent"
      stroke="${palette[i % palette.length]}" stroke-width="34"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 100 100)"></circle>`;
    offset += len;
    return seg;
  }).join('');
  const legend = items.map((d, i) => `<div class="lg">
      <span class="dot" style="background:${palette[i % palette.length]}"></span>
      <span class="lg-l">${esc(d.label)}</span>
      <span class="lg-v">${esc(rpShort(d.value))} (${((d.value / total) * 100).toFixed(1)}%)</span>
    </div>`).join('');
  return `<div class="card"><h3>${esc(judul)}</h3>
    <div class="donut-wrap">
      <svg viewBox="0 0 200 200" class="donut">${segs}
        <text x="100" y="96" text-anchor="middle" class="d-t1">Total</text>
        <text x="100" y="116" text-anchor="middle" class="d-t2">${esc(rpShort(total))}</text>
      </svg>
      <div class="legend">${legend}</div>
    </div></div>`;
}

// Faktur penjualan Accurate. Selalu sahih untuk bulan berjalan karena
// endpointnya punya filter tanggal dan tidak bergantung baseline saldo.
function kartuFaktur(pf) {
  if (!pf) return '';
  if (!pf.tersedia) {
    return `<div class="card"><h3>Penjualan Bulan Berjalan (Faktur Accurate)</h3>
      <p class="kosong">${esc(pf.alasanKosong || 'Data faktur tidak terbaca.')}</p></div>`;
  }
  return tabel('Penjualan Bulan Berjalan (Faktur Accurate)', [
    { label: 'Rentang faktur', value: (pf.periodeDari || '-') + ' s.d. ' + (pf.periodeSampai || '-') },
    { label: 'Jumlah faktur', value: String(pf.jumlahFaktur || 0) },
    { label: 'Faktur dibatalkan', value: String(pf.jumlahFakturDibatalkan || 0) },
    { label: 'Penjualan bruto', value: rp(pf.totalPenjualanBruto), strong: true },
    { label: 'Rata-rata per faktur', value: rp(pf.rataRataPerFaktur) },
  ], 'nilai bruto');
}

// Pergerakan pos neraca. Ini selisih saldo yang memang terukur pada
// rentang basis, jadi tetap sahih walaupun laba rugi bulanan ditahan.
function kartuPergerakan() {
  if (!pergerakanBulanan || !pergerakanBulanan.tersedia) return '';
  const judul = pergerakanBulanan.sejak
    ? 'Pergerakan Pos Neraca sejak ' + pergerakanBulanan.sejak
    : 'Pergerakan Pos Neraca';
  return tabel(judul, [
    { label: 'Kas & Bank', value: rp(pergerakanBulanan.kasBank), tone: cls(pergerakanBulanan.kasBank) },
    { label: 'Setara Kas', value: rp(pergerakanBulanan.setaraKas), tone: cls(pergerakanBulanan.setaraKas) },
    { label: 'Piutang Usaha', value: rp(pergerakanBulanan.piutangUsaha), tone: cls(pergerakanBulanan.piutangUsaha) },
    { label: 'Persediaan', value: rp(pergerakanBulanan.persediaan), tone: cls(pergerakanBulanan.persediaan) },
  ], pergerakanBulanan.hariTercakup ? pergerakanBulanan.hariTercakup + ' hari' : '');
}

// ---------- Blok Laba Rugi ----------
function blokLabaRugi(d, refShare) {
  // Basis belum ada, atau ada tapi tidak layak disajikan sebagai laba
  // rugi. Tabel sengaja tidak dirender supaya angka riak jurnal tidak
  // terbaca sebagai kinerja bulan berjalan.
  if (!d.tersedia || d.layakDilaporkan === false) {
    const pesan = d.catatan ? `<div class="warn">${esc(d.catatan)}</div>` : '';
    return stripPeriode(d) + pesan +
      `<div class="grid">${kartuFaktur(d.penjualanDariFaktur)}${kartuPergerakan()}</div>`;
  }
  const s = d.sales, mk = d.marketing, p = d.profitability;
  const share = v => (refShare && refShare !== 0) ? ((v / Math.abs(refShare)) * 100).toFixed(1) + '%' : '';

  const catatanBasis = d.catatan ? `<div class="notice">${esc(d.catatan)}</div>` : '';

  const rowsSales = [
    { label: 'Penjualan Kotor', value: rp(s.grossSales) },
    { label: 'Retur Penjualan', value: rp(s.salesReturns), tone: cls(s.salesReturns) },
    { label: 'Diskon Penjualan', value: rp(s.salesDiscount), tone: cls(s.salesDiscount) },
    { label: 'Penjualan Inti', value: rp(s.penjualanInti), strong: true },
    { label: 'Pendapatan Usaha Lainnya', value: rp(s.pendapatanLainnya), indent: true },
    { label: 'Total Pendapatan', value: rp(s.netSales), strong: true },
    { label: 'COGS', value: rp(s.cogs), extra: share(s.cogs) },
    { label: 'Laba Kotor', value: rp(s.grossProfit), extra: pct(s.grossMarginPct), strong: true },
  ];
  if (s.accountsReceivable !== undefined) {
    rowsSales.push({ label: 'Piutang Usaha', value: rp(s.accountsReceivable) });
  }

  const rowsMkt = [
    { label: 'Total Ad Spend', value: rp(mk.totalAdSpend), extra: share(mk.totalAdSpend), strong: true },
    ...nz(mk.adSpendByChannel).map(([k, v]) => ({ label: k, value: rp(v), indent: true })),
    { label: 'Total Komisi Affiliate', value: rp(mk.totalAffiliateCommission), extra: share(mk.totalAffiliateCommission), strong: true },
    ...nz(mk.affiliateCommissionByChannel).map(([k, v]) => ({ label: k, value: rp(v), indent: true })),
    { label: 'Total Fee Platform', value: rp(mk.totalPlatformFee), extra: share(mk.totalPlatformFee), strong: true },
    ...nz(mk.platformFeeByChannel).map(([k, v]) => ({ label: k, value: rp(v), indent: true })),
    { label: 'Total Ongkir', value: rp(mk.totalShipping), extra: share(mk.totalShipping), strong: true },
    ...nz(mk.shippingByChannel).map(([k, v]) => ({ label: k, value: rp(v), indent: true, tone: cls(v) })),
    { label: 'Total Biaya Marketing', value: rp(mk.totalMarketingCost), extra: pct(mk.marketingCostToSalesPct), strong: true },
  ];

  const ox = p.opexBreakdown || {};
  const rowsOpex = [
    { label: 'Beban Operasional', value: rp(p.operatingExpenseTotal), extra: share(p.operatingExpenseTotal), strong: true },
    { label: 'Komisi & Fee Platform', value: rp(ox.komisi), indent: true },
    { label: 'Iklan & Promosi', value: rp(ox.iklan), indent: true },
    { label: 'Gaji & Upah', value: rp(ox.payroll), indent: true },
    { label: 'Produksi Konten', value: rp(ox.kontenProduksi), indent: true },
    { label: 'Kendaraan', value: rp(ox.kendaraan), indent: true },
    { label: 'Utilitas', value: rp(ox.utilitas ? ox.utilitas.total : 0), indent: true },
    { label: 'Pos lainnya', value: rp(ox.lainnya), indent: true },
  ];

  const z = p.zakatQurbanOwner || {};
  const rowsProfit = [
    { label: 'Laba Kotor', value: rp(p.grossProfit) },
    { label: 'Beban Operasional', value: rp(p.operatingExpenseTotal) },
    { label: 'Pendapatan Lain', value: rp(p.otherIncome) },
    { label: 'Beban Lain', value: rp(p.otherExpense) },
    { label: 'Laba Bersih', value: rp(p.netProfit), extra: pct(p.netMarginPct), strong: true, tone: cls(p.netProfit) },
    { label: 'Zakat', value: rp(z.zakat), indent: true },
    { label: 'Qurban', value: rp(z.qurban), indent: true },
    { label: 'Owner Draw', value: rp(z.ownerDraw), indent: true },
    { label: 'Laba Bersih di luar pos di atas', value: rp(p.adjusted.netProfit), extra: pct(p.adjusted.netMarginPct), strong: true },
  ];

  const cd = d.cogsDetail || {};
  const rowsCogs = nz({
    'Beban Pokok Penjualan': cd.bebanPokokPenjualan,
    'Gaji Finishing': cd.gajiFinishing,
    'Jasa Bordir': cd.jasaBordir,
    'HPP Ongkir Pembelian': cd.hppOngkirPembelian,
    'HPP Jasa Potong': cd.hppJasaPotong,
    'HPP Jasa Jahit': cd.hppJasaJahit,
    'Produksi Embos': cd.biayaProduksiEmbos,
    'Ongkir Embos': cd.ongkirProduksiEmbos,
  }).map(([k, v]) => ({ label: k, value: rp(v), tone: cls(v) }));

  const kpis = `<div class="kpis">
    ${kpi('Total Pendapatan', rpShort(s.netSales), rp(s.netSales))}
    ${kpi('Laba Kotor', rpShort(s.grossProfit), 'Margin ' + pct(s.grossMarginPct))}
    ${kpi('Biaya Marketing', rpShort(mk.totalMarketingCost), pct(mk.marketingCostToSalesPct) + ' dari pendapatan')}
    ${kpi('Laba Bersih', rpShort(p.netProfit), 'Margin ' + pct(p.netMarginPct), p.netProfit < 0 ? 'danger' : 'good')}
  </div>`;

  return stripPeriode(d) + catatanBasis + kpis + `<div class="grid">
    ${kartuFaktur(d.penjualanDariFaktur)}
    ${tabel('Penjualan', rowsSales, '% / margin')}
    ${tabel('Profitabilitas', rowsProfit, '%')}
    ${tabel('Marketing', rowsMkt, '% dari pendapatan')}
    ${tabel('Beban Operasional', rowsOpex, '% dari pendapatan')}
    ${rowsCogs.length ? tabel('Rincian COGS', rowsCogs) : ''}
    ${donut('Komposisi Biaya', [
      { label: 'COGS', value: s.cogs },
      { label: 'Ad Spend', value: mk.totalAdSpend },
      { label: 'Fee Platform', value: mk.totalPlatformFee },
      { label: 'Komisi Affiliate', value: mk.totalAffiliateCommission },
      { label: 'Opex Lainnya', value: Math.max(0, (ox.lainnya || 0) + (ox.payroll || 0) + (ox.utilitas ? ox.utilitas.total : 0)) },
    ])}
    ${barChart('Ad Spend per Channel', nz(mk.adSpendByChannel).map(([k, v]) => ({ label: k, value: v })), { short: true })}
  </div>`;
}

// ---------- Tab Channel ----------
function tabChannel(d) {
  if (!d.layakDilaporkan || !d.channelPnL) return `<p class="kosong">Data channel belum tersedia.</p>`;
  const rows = Object.entries(d.channelPnL).map(([ch, v]) => `<tr>
    <td>${esc(ch)}</td>
    <td class="num ${cls(v.discount)}">${esc(rp(v.discount))}</td>
    <td class="num">${esc(rp(v.adSpend))}</td>
    <td class="num">${esc(rp(v.affiliate))}</td>
    <td class="num">${esc(rp(v.platformFee))}</td>
    <td class="num ${cls(v.shipping)}">${esc(rp(v.shipping))}</td>
    <td class="num strong">${esc(rp(v.totalDeduction))}</td>
  </tr>`).join('');
  const chart = barChart('Total Biaya per Channel',
    Object.entries(d.channelPnL).map(([ch, v]) => ({ label: ch, value: v.totalDeduction })), { short: true });
  return stripPeriode(d) + `<div class="card wide"><h3>Biaya per Channel</h3>
    <div class="scroll"><table>
      <thead><tr><th>Channel</th><th class="num">Diskon</th><th class="num">Ad Spend</th>
      <th class="num">Affiliate</th><th class="num">Fee Platform</th><th class="num">Ongkir</th>
      <th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>
    <div class="grid">${chart}</div>`;
}

// ---------- Tab Posisi ----------
function tabPosisi() {
  const rowsKas = [
    ...nz(cash.cashBank).map(([k, v]) => ({ label: k, value: rp(v), indent: true })),
    { label: 'Total Kas & Bank', value: rp(cash.totalCashBank), strong: true },
    ...nz(cash.marketplaceWallet).map(([k, v]) => ({ label: k, value: rp(v), indent: true })),
    { label: 'Total Saldo Marketplace', value: rp(cash.totalMarketplaceWallet), strong: true },
    { label: 'Total Aset Likuid', value: rp(cash.totalLiquidAssets), strong: true },
  ];
  const rowsInv = [
    { label: 'Stok Tersedia', value: rp(inventory.inventoryOnHand) },
    { label: 'Persediaan Terkirim', value: rp(inventory.inventoryInTransit) },
    { label: 'Dalam Proses (WIP)', value: rp(inventory.inventoryWip) },
    { label: 'Total Persediaan', value: rp(inventory.inventoryTotal), strong: true },
    { label: 'Beban Selisih Persediaan', value: rp(inventory.inventoryVarianceExpense), tone: cls(inventory.inventoryVarianceExpense) },
  ];
  const a = neraca.asetLancar;
  const rowsNeraca = [
    { label: 'Kas & Bank', value: rp(a.kasBank), indent: true },
    { label: 'Setara Kas', value: rp(a.setaraKas), indent: true },
    { label: 'Piutang Usaha', value: rp(a.piutangUsaha), indent: true },
    { label: 'Persediaan', value: rp(a.persediaan), indent: true },
    { label: 'Aset Lancar Lainnya', value: rp(a.asetLancarLainnya), indent: true },
    { label: 'Investasi Logam Mulia', value: rp(a.investasiLogamMulia), indent: true },
    { label: 'Total Aset Lancar', value: rp(neraca.totalAsetLancar), strong: true },
    { label: 'Aset Tetap (kotor)', value: rp(neraca.asetTetapKotor), indent: true },
    { label: 'Akumulasi Depresiasi', value: rp(neraca.akumulasiDepresiasi), indent: true },
    { label: 'Total Aset', value: rp(neraca.totalAset), strong: true },
    { label: 'Total Liabilitas', value: rp(neraca.totalLiabilitas), strong: true },
    { label: 'Total Ekuitas', value: rp(neraca.totalEkuitas), strong: true },
  ];

  const warnNeraca = Math.abs(balanceCheck.selisih) > 1000
    ? `<div class="warn">Selisih persamaan neraca ${esc(rp(balanceCheck.selisih))}. Total Aset ${esc(rp(balanceCheck.totalAset))} versus Liabilitas + Ekuitas + Laba ${esc(rp(balanceCheck.totalLiabilitasPlusEkuitasPlusLaba))}. Perlu ditelusuri di Accurate.</div>`
    : '';

  const warnSusut = (diagnostikNeraca && diagnostikNeraca.peringatanPenyusutan)
    ? `<div class="warn">${esc(diagnostikNeraca.peringatanPenyusutan)}</div>` : '';

  const akunBaru = (diagnostikNeraca && diagnostikNeraca.akunTidakDikenal && diagnostikNeraca.akunTidakDikenal.length)
    ? tabel('Akun Bersaldo di Luar Pemetaan', diagnostikNeraca.akunTidakDikenal.slice(0, 8).map(x => ({
        label: x.no + ' ' + (x.nama || ''), value: rp(x.saldo),
      })), 'perlu ditinjau')
    : '';

  const rasio = (liquidityRatios.currentRatio === null)
    ? `<div class="card"><h3>Rasio Likuiditas</h3><p class="kosong">${esc(liquidityRatios.catatan || 'Tidak bermakna.')}</p></div>`
    : tabel('Rasio Likuiditas', [
        { label: 'Current Ratio', value: String(liquidityRatios.currentRatio) },
        { label: 'Cash Ratio', value: String(liquidityRatios.cashRatio) },
      ]);

  const kpis = `<div class="kpis">
    ${kpi('Total Aset', rpShort(neraca.totalAset))}
    ${kpi('Aset Likuid', rpShort(cash.totalLiquidAssets))}
    ${kpi('Persediaan', rpShort(inventory.inventoryTotal))}
    ${kpi('Total Ekuitas', rpShort(neraca.totalEkuitas))}
  </div>`;

  return warnNeraca + warnSusut + kpis + `<div class="grid">
    ${tabel('Kas, Bank & Marketplace', rowsKas)}
    ${tabel('Persediaan', rowsInv)}
    ${tabel('Neraca Ringkas', rowsNeraca)}
    ${kartuPergerakan()}
    ${rasio}
    ${akunBaru}
    ${barChart('Sebaran Saldo Marketplace', nz(cash.marketplaceWallet).map(([k, v]) => ({ label: k, value: v })), { short: true })}
  </div>`;
}

// ---------- Ringkasan ----------
function tabRingkasan() {
  const t = tahunan, b = bulanan;
  const pf = b.penjualanDariFaktur;

  const catatanBlokBulanan = (b.layakDilaporkan === false && b.catatan)
    ? `<div class="warn">Blok bulanan: ${esc(b.catatan)}</div>` : '';

  const banding = b.layakDilaporkan ? `<div class="card wide"><h3>Blok Bulanan vs Total Tahunan</h3>
    <div class="scroll"><table>
      <thead><tr><th>Metrik</th><th class="num">${esc(b.periode)}</th><th class="num">${esc(t.periode)}</th><th class="num">Kontribusi</th></tr></thead>
      <tbody>
      ${[
        ['Total Pendapatan', b.sales.netSales, t.sales.netSales],
        ['COGS', b.sales.cogs, t.sales.cogs],
        ['Laba Kotor', b.sales.grossProfit, t.sales.grossProfit],
        ['Biaya Marketing', b.marketing.totalMarketingCost, t.marketing.totalMarketingCost],
        ['Beban Operasional', b.profitability.operatingExpenseTotal, t.profitability.operatingExpenseTotal],
        ['Laba Bersih', b.profitability.netProfit, t.profitability.netProfit],
      ].map(([lab, bv, tv]) => `<tr>
        <td>${esc(lab)}</td>
        <td class="num">${esc(rp(bv))}</td>
        <td class="num">${esc(rp(tv))}</td>
        <td class="num muted">${tv ? ((bv / tv) * 100).toFixed(1) + '%' : ''}</td>
      </tr>`).join('')}
      </tbody></table></div></div>`
    : '';

  const kpiFaktur = (pf && pf.tersedia)
    ? kpi('Penjualan Faktur (bulan ini)', rpShort(pf.totalPenjualanBruto), (pf.jumlahFaktur || 0) + ' faktur, nilai bruto')
    : kpi('Penjualan Faktur (bulan ini)', 'n/a', 'Data faktur tidak terbaca');

  return `<div class="kpis">
    ${kpi('Total Pendapatan (tahun)', rpShort(t.sales.netSales), rp(t.sales.netSales))}
    ${kpi('Laba Kotor (tahun)', rpShort(t.sales.grossProfit), 'Margin ' + pct(t.sales.grossMarginPct))}
    ${kpi('Laba Bersih (tahun)', rpShort(t.profitability.netProfit), 'Margin ' + pct(t.profitability.netMarginPct), t.profitability.netProfit < 0 ? 'danger' : 'good')}
    ${kpiFaktur}
  </div>
  ${t.catatan ? `<div class="notice">${esc(t.catatan)}</div>` : ''}
  ${catatanBlokBulanan}
  ${banding}
  <div class="grid">
    ${kartuFaktur(pf)}
    ${kartuPergerakan()}
    ${barChart('Biaya Utama Tahun Berjalan', [
      { label: 'COGS', value: t.sales.cogs },
      { label: 'Fee Platform', value: t.marketing.totalPlatformFee },
      { label: 'Ad Spend', value: t.marketing.totalAdSpend },
      { label: 'Komisi Affiliate', value: t.marketing.totalAffiliateCommission },
      { label: 'Gaji & Upah', value: (t.profitability.opexBreakdown || {}).payroll || 0 },
      { label: 'Owner, Zakat, Qurban', value: t.profitability.totalZakatQurbanOwner },
    ], { short: true })}
    ${barChart('Kontribusi Biaya per Channel', Object.entries(t.channelPnL).map(([k, v]) => ({ label: k, value: v.totalDeduction })), { short: true })}
  </div>`;
}

// ---------- Rakit HTML ----------
const labelTabBulanan = bulanan.layakDilaporkan === false
  ? 'Bulan Berjalan (faktur)'
  : (bulanan.basisTipe === 'mtd-parsial'
    ? 'Bulan Berjalan (sebagian)'
    : (bulanan.basisTipe === 'kumulatif'
      ? 'Kumulatif ' + (bulanan.bulanTercakup || '?') + ' Bulan'
      : 'Bulan Berjalan'));

const tabs = [
  { id: 'ringkasan', label: 'Ringkasan', content: tabRingkasan() },
  { id: 'bulanan', label: labelTabBulanan, content: blokLabaRugi(bulanan, bulanan.layakDilaporkan ? bulanan.sales.netSales : 0) },
  { id: 'tahunan', label: 'Total Tahunan', content: blokLabaRugi(tahunan, tahunan.sales.netSales) },
  { id: 'channel', label: 'Per Channel', content: tabChannel(tahunan) },
  { id: 'posisi', label: 'Posisi & Neraca', content: tabPosisi() },
];

const navHtml = tabs.map((t, i) =>
  `<button class="tab${i === 0 ? ' active' : ''}" data-t="${t.id}">${esc(t.label)}</button>`).join('');
const paneHtml = tabs.map((t, i) =>
  `<section class="pane${i === 0 ? ' active' : ''}" id="p-${t.id}">${t.content}</section>`).join('');

const waktuCetak = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard Finansial BrandCo - ${esc(periode.labelBulan)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
background:#f1f5f9;color:#0f172a;line-height:1.5;padding:16px}
.wrap{max-width:1240px;margin:0 auto}
header{background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;padding:22px 24px;border-radius:14px;margin-bottom:18px}
header h1{font-size:20px;font-weight:650;letter-spacing:-.2px}
header .meta{font-size:13px;opacity:.8;margin-top:6px}
nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
.tab{border:1px solid #cbd5e1;background:#fff;color:#475569;padding:9px 16px;border-radius:9px;
font-size:14px;font-weight:550;cursor:pointer;transition:.15s}
.tab:hover{border-color:#94a3b8}
.tab.active{background:#0f172a;color:#fff;border-color:#0f172a}
.pane{display:none}.pane.active{display:block}
.periode{background:#fff;border:1px solid #e2e8f0;border-left:4px solid #2563eb;border-radius:10px;
padding:11px 14px;margin-bottom:14px;font-size:13.5px}
.periode.alarm{border-left-color:#d97706}
.periode span{display:block;color:#64748b;font-size:12px;margin-top:2px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:16px}
.kpi{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;border-left:4px solid #2563eb}
.kpi.good{border-left-color:#16a34a}.kpi.danger{border-left-color:#dc2626}
.kpi-l{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
.kpi-v{font-size:24px;font-weight:680;margin-top:6px;letter-spacing:-.5px}
.kpi-s{font-size:12px;color:#64748b;margin-top:3px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px}
.card.wide{grid-column:1/-1;margin-bottom:14px}
.card h3{font-size:14px;font-weight:650;margin-bottom:12px;color:#1e293b;
padding-bottom:9px;border-bottom:1px solid #e2e8f0}
table{width:100%;border-collapse:collapse;font-size:13.5px}
th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;
color:#94a3b8;font-weight:650;padding:6px 8px;border-bottom:1px solid #e2e8f0}
td{padding:7px 8px;border-bottom:1px solid #f1f5f9}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
tr.strong td{font-weight:650;background:#f8fafc}
tr.ind td:first-child{padding-left:22px;color:#475569}
.muted{color:#94a3b8;font-size:12px}
.kosong{color:#64748b;font-size:13px;font-style:italic}
.pos{color:#0f172a}.neg{color:#dc2626}
.scroll{overflow-x:auto}
.bars{display:flex;flex-direction:column;gap:9px}
.bar-row{display:grid;grid-template-columns:130px 1fr 92px;gap:9px;align-items:center;font-size:12.5px}
.bar-lab{color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{background:#f1f5f9;border-radius:5px;height:20px;overflow:hidden}
.bar-fill{background:linear-gradient(90deg,#2563eb,#3b82f6);height:100%;border-radius:5px}
.bar-fill.neg{background:linear-gradient(90deg,#dc2626,#ef4444)}
.bar-val{text-align:right;font-variant-numeric:tabular-nums;color:#0f172a;font-weight:550}
.donut-wrap{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.donut{width:180px;height:180px;flex-shrink:0}
.d-t1{font-size:12px;fill:#94a3b8}.d-t2{font-size:17px;font-weight:650;fill:#0f172a}
.legend{flex:1;min-width:180px;display:flex;flex-direction:column;gap:7px}
.lg{display:flex;align-items:center;gap:8px;font-size:12.5px}
.dot{width:11px;height:11px;border-radius:3px;flex-shrink:0}
.lg-l{flex:1;color:#475569}.lg-v{color:#0f172a;font-weight:550;font-variant-numeric:tabular-nums}
.notice{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:13px 15px;
border-radius:10px;font-size:13.5px;margin-bottom:14px}
.warn{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:13px 15px;
border-radius:10px;font-size:13.5px;margin-bottom:14px;font-weight:550}
footer{text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;padding:14px}
@media(max-width:640px){
body{padding:10px}.kpi-v{font-size:20px}
.bar-row{grid-template-columns:88px 1fr 78px;font-size:11.5px}
.grid{grid-template-columns:1fr}
}
</style></head><body>
<div class="wrap">
<header>
  <h1>Dashboard Finansial BrandCo</h1>
  <div class="meta">Periode ${esc(periode.labelBulan)} &middot; Data per ${esc(periode.tanggalAcuan)} &middot; ${esc(m.accountCount)} akun</div>
</header>
<nav>${navHtml}</nav>
${paneHtml}
<footer>Dibuat otomatis ${esc(waktuCetak)} WIB dari Accurate ERP</footer>
</div>
<script>
document.querySelectorAll('.tab').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('active');});
    document.querySelectorAll('.pane').forEach(function(p){p.classList.remove('active');});
    btn.classList.add('active');
    var el = document.getElementById('p-' + btn.dataset.t);
    if (el) el.classList.add('active');
    window.scrollTo({top:0,behavior:'smooth'});
  });
});
</script>
</body></html>`;

const namaFile = `dashboard-finansial-${periode.bulanKey}.html`;

return [{
  json: {
    html,
    namaFile,
    periode: periode.labelBulan,
    basisBulanan: bulanan.basisTipe || null,
    bulananLayakDilaporkan: bulanan.layakDilaporkan,
    ukuranKb: Math.round(Buffer.byteLength(html, 'utf8') / 1024),
  },
  binary: {
    data: {
      data: Buffer.from(html, 'utf8').toString('base64'),
      mimeType: 'text/html',
      fileName: namaFile,
      fileExtension: 'html',
    },
  },
}];
