// =====================================================================
// DASHBOARD QUDAMAH - Generator HTML (v5)
// Mode: Run Once for All Items
//
// PRINSIP
// 1. Hanya bulan berjalan menurut tanggal saat dijalankan (Asia/Jakarta).
// 2. Navigasi tab jalan tanpa JavaScript (radio + CSS), karena penampil
//    dokumen bawaan Telegram di ponsel tidak mengeksekusi script.
// 3. Tidak ada panel yang dibiarkan kosong. Metrik yang hanya ada di
//    sheet diganti analisis yang bisa diturunkan dari faktur Accurate:
//    perbandingan periode sebanding, pola hari, dan sebaran nilai faktur.
// =====================================================================

const angka = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
const rp    = (v) => 'Rp' + Math.round(angka(v)).toLocaleString('id-ID');
const rpk   = (v) => {
  const n = angka(v);
  if (Math.abs(n) >= 1e9) return 'Rp' + (n / 1e9).toFixed(2) + ' M';
  if (Math.abs(n) >= 1e6) return 'Rp' + (n / 1e6).toFixed(1) + ' jt';
  if (Math.abs(n) >= 1e3) return 'Rp' + (n / 1e3).toFixed(0) + ' rb';
  return rp(n);
};
const nm    = (v) => angka(v).toLocaleString('id-ID');
const ds    = (v, d = 2) => angka(v).toFixed(d);
const persen= (v, d = 1) => angka(v).toFixed(d) + '%';
const esc   = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function tumbuh(sekarang, sebelum) {
  const a = angka(sekarang), b = angka(sebelum);
  if (b === 0) return null;
  const pct = ((a - b) / Math.abs(b)) * 100;
  return { pct, naik: pct >= 0 };
}
function badge(t) {
  if (!t) return '<span class="delta nol">n/a</span>';
  return '<span class="delta ' + (t.naik ? 'naik' : 'turun') + '">' +
    (t.naik ? '\u25b2' : '\u25bc') + ' ' + ds(Math.abs(t.pct), 1) + '%</span>';
}

// =====================================================================
// 0. TANGGAL ACUAN
// =====================================================================
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const wib = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
const thnIni = wib.getFullYear();
const blnIni = wib.getMonth();
const hariIni = wib.getDate();
const kunciBulan = thnIni + '-' + String(blnIni + 1).padStart(2, '0');
const labelBulan = NAMA_BULAN[blnIni] + ' ' + thnIni;
const hariDalamBulan = new Date(thnIni, blnIni + 1, 0).getDate();
const sisaHari = hariDalamBulan - hariIni;
const progresBulan = (hariIni / hariDalamBulan) * 100;
const tglHariIni = kunciBulan + '-' + String(hariIni).padStart(2, '0');
const awalBulan = kunciBulan + '-01';

function geserHari(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function hariDari(iso) {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}
function tglPendek(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.getUTCDate() + ' ' + NAMA_BULAN[d.getUTCMonth()].slice(0, 3);
}

const tanggalBerjalan = [];
for (let d = 1; d <= hariIni; d++) {
  tanggalBerjalan.push(kunciBulan + '-' + String(d).padStart(2, '0'));
}

// Periode pembanding: jumlah hari yang sama, tepat sebelum bulan ini.
const bandingAkhir = geserHari(awalBulan, -1);
const bandingMulai = geserHari(awalBulan, -hariIni);

// =====================================================================
// 1. KLASIFIKASI INPUT
// =====================================================================
const semua = items.map((i) => i.json || {});
let dSales = null, dAds = null;
const halamanInvoice = [];
const daftarItem = [];

for (const j of semua) {
  if (!j || typeof j !== 'object') continue;
  if (j._source === 'sales') { dSales = j; continue; }
  if (j._source === 'ads')   { dAds = j;   continue; }
  if (j.s === true && Array.isArray(j.d)) { halamanInvoice.push(j); continue; }
  if (j.itemType && j.no && j.quantity !== undefined) { daftarItem.push(j); continue; }
}

// =====================================================================
// 2. FAKTUR ACCURATE
// =====================================================================
const invoiceUnik = new Map();
for (const hal of halamanInvoice) {
  for (const row of hal.d) {
    if (!row || row.id == null) continue;
    const lama = invoiceUnik.get(row.id);
    if (!lama || (lama.totalAmount == null && row.totalAmount != null)) invoiceUnik.set(row.id, row);
  }
}
const invoices = Array.from(invoiceUnik.values()).filter((r) => r.totalAmount != null);

function keChannel(nomor) {
  const s = String(nomor || '');
  if (/^SI\./i.test(s)) return 'Manual / Offline';
  if (/^\d{15,}$/.test(s)) return 'Shopee';
  if (/^\d{6}[A-Z0-9]{6,}$/i.test(s)) return 'TikTok';
  return 'Lainnya';
}
function isoDari(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? m[3] + '-' + m[2] + '-' + m[1] : null;
}

const mtdHarian = new Map();
const mtdChannel = new Map();
const perHariPekan = NAMA_HARI.map((n, i) => ({ hari: n, idx: i, omset: 0, faktur: 0, jumlahHari: 0 }));
const BUCKET = [
  { label: 'di bawah Rp100 rb', min: 0, max: 100000, n: 0, omset: 0 },
  { label: 'Rp100 rb - Rp250 rb', min: 100000, max: 250000, n: 0, omset: 0 },
  { label: 'Rp250 rb - Rp500 rb', min: 250000, max: 500000, n: 0, omset: 0 },
  { label: 'Rp500 rb - Rp1 jt', min: 500000, max: 1000000, n: 0, omset: 0 },
  { label: 'di atas Rp1 jt', min: 1000000, max: Infinity, n: 0, omset: 0 },
];

let mtdOmset = 0, mtdFaktur = 0;
let bandingOmset = 0, bandingFaktur = 0;
let tglTerawal = null, tglTerakhirSemua = null;

for (const inv of invoices) {
  const iso = isoDari(inv.transDate);
  if (!iso) continue;
  if (!tglTerawal || iso < tglTerawal) tglTerawal = iso;
  if (!tglTerakhirSemua || iso > tglTerakhirSemua) tglTerakhirSemua = iso;
  const nilai = angka(inv.totalAmount);

  if (iso >= bandingMulai && iso <= bandingAkhir) {
    bandingOmset += nilai; bandingFaktur += 1;
  }
  if (iso.slice(0, 7) !== kunciBulan) continue;

  mtdOmset += nilai; mtdFaktur += 1;
  const h = mtdHarian.get(iso) || { tanggal: iso, omset: 0, faktur: 0 };
  h.omset += nilai; h.faktur += 1; mtdHarian.set(iso, h);
  const ch = keChannel(inv.number);
  const c = mtdChannel.get(ch) || { channel: ch, omset: 0, faktur: 0 };
  c.omset += nilai; c.faktur += 1; mtdChannel.set(ch, c);
  const dow = perHariPekan[hariDari(iso)];
  dow.omset += nilai; dow.faktur += 1;
  for (const b of BUCKET) {
    if (nilai >= b.min && nilai < b.max) { b.n += 1; b.omset += nilai; break; }
  }
}
// Berapa kali tiap nama hari sudah lewat bulan ini, untuk rata-rata adil.
for (const t of tanggalBerjalan) perHariPekan[hariDari(t)].jumlahHari += 1;

const mtdChannelArr = Array.from(mtdChannel.values()).sort((a, b) => b.omset - a.omset);
const mtdDeret = tanggalBerjalan.map(t => (mtdHarian.get(t) || { tanggal: t, omset: 0, faktur: 0 }));
const mtdHariTransaksi = mtdDeret.filter(d => d.omset > 0).length;
const mtdAov = mtdFaktur ? mtdOmset / mtdFaktur : 0;
const mtdPerHariBerjalan = hariIni ? mtdOmset / hariIni : 0;
const mtdProyeksi = mtdPerHariBerjalan * hariDalamBulan;
const mtdTglTerakhir = mtdDeret.filter(d => d.omset > 0).map(d => d.tanggal).pop() || null;
let mtdTerbaik = null;
for (const d of mtdDeret) if (d.omset > 0 && (!mtdTerbaik || d.omset > mtdTerbaik.omset)) mtdTerbaik = d;

const bandingAov = bandingFaktur ? bandingOmset / bandingFaktur : 0;
const bandingLengkap = Boolean(tglTerawal) && tglTerawal <= bandingMulai;
const bandingAda = bandingFaktur > 0;
const tOmset = bandingAda ? tumbuh(mtdOmset, bandingOmset) : null;
const tFaktur = bandingAda ? tumbuh(mtdFaktur, bandingFaktur) : null;
const tAov = bandingAda ? tumbuh(mtdAov, bandingAov) : null;

const pekanTerisi = perHariPekan.filter(d => d.jumlahHari > 0);
const totalBucket = BUCKET.reduce((s, b) => s + b.n, 0);

// =====================================================================
// 3. INVENTORI
// =====================================================================
const invAktif = daftarItem.filter((it) => !/^RIJEK/i.test(String(it.no || '')));
let totQty = 0, totSiapJual = 0, skuKosong = 0, skuNegatif = 0;
const perKategori = new Map(), perBrand = new Map();
for (const it of invAktif) {
  const q = angka(it.quantity), a = angka(it.availableToSell);
  totQty += q; totSiapJual += a;
  if (a <= 0) skuKosong++;
  if (q < 0) skuNegatif++;
  const k = it.kategoriItem || 'Tanpa Kategori';
  const ok = perKategori.get(k) || { nama: k, sku: 0, qty: 0, siap: 0, kosong: 0 };
  ok.sku++; ok.qty += q; ok.siap += a; if (a <= 0) ok.kosong++;
  perKategori.set(k, ok);
  const b = it.brandItem || 'Tanpa Brand';
  const ob = perBrand.get(b) || { nama: b, sku: 0, qty: 0, siap: 0, kosong: 0 };
  ob.sku++; ob.qty += q; ob.siap += a; if (a <= 0) ob.kosong++;
  perBrand.set(b, ob);
}
const kategoriArr = Array.from(perKategori.values()).sort((a, b) => b.siap - a.siap);
const brandArr = Array.from(perBrand.values()).sort((a, b) => b.siap - a.siap);
const skuKritis = invAktif
  .filter((it) => angka(it.availableToSell) <= 2)
  .sort((a, b) => angka(a.availableToSell) - angka(b.availableToSell))
  .slice(0, 60);

// =====================================================================
// 4. SHEET, HANYA BILA BLOKNYA BULAN BERJALAN
// =====================================================================
const pInfo = (dSales && dSales.periodeInfo) || {};
const sheetSiap = pInfo.sesuaiBulanBerjalan === true && dSales && dSales.bulanBerjalan;
const bj = sheetSiap ? dSales.bulanBerjalan : null;
const bl = sheetSiap ? (dSales.bulanSebelumnya || null) : null;
const tl = sheetSiap ? (dSales.tahunLalu || null) : null;
const rBJ = (bj && bj.ringkasan) || {};
const rBL = (bl && bl.ringkasan) || {};
const rTL = (tl && tl.ringkasan) || {};

const harianSheetMap = new Map();
for (const h of ((bj && bj.harian) || [])) harianSheetMap.set(h.tanggal, h);
const sheetDeret = tanggalBerjalan.map(t => harianSheetMap.get(t) || {
  tanggal: t, omset: 0, resi: 0, terjual: 0, shopee: 0, tiktok: 0, lazada: 0, lainnya: 0,
});
const tSheetMoM = tumbuh(rBJ.totalOmset, rBL.totalOmset);
const tSheetYoY = tumbuh(rBJ.totalOmset, rTL.totalOmset);
const aovSheet = angka(rBJ.totalResi) ? angka(rBJ.totalOmset) / angka(rBJ.totalResi) : 0;

// =====================================================================
// 5. IKLAN META, HANYA BULAN BERJALAN
// =====================================================================
const iklanSemua = (dAds && dAds.iklan) || [];
const iklanBulan = iklanSemua.filter((r) => String(r.tanggal || '').startsWith(kunciBulan));
const adaIklan = iklanBulan.length > 0;

function ringkasIklan(rows) {
  const o = { spend: 0, spendPpn: 0, impression: 0, reach: 0, igVisit: 0, klik: 0, followersIg: 0, hari: new Set() };
  for (const r of rows) {
    o.spend += angka(r.spend); o.spendPpn += angka(r.spendPpn);
    o.impression += angka(r.impression); o.reach += angka(r.reach);
    o.igVisit += angka(r.igVisit); o.followersIg += angka(r.followersIg);
    o.klik += Math.round(angka(r.impression) * angka(r.ctr));
    if (angka(r.spend) > 0) o.hari.add(r.tanggal);
  }
  const hari = o.hari.size;
  return {
    spend: o.spend, spendPpn: o.spendPpn, impression: o.impression, reach: o.reach,
    igVisit: o.igVisit, klik: o.klik, followersIg: o.followersIg, hari,
    ctr: o.impression ? (o.klik / o.impression) * 100 : 0,
    cpc: o.klik ? o.spendPpn / o.klik : 0,
    cpm: o.impression ? (o.spendPpn / o.impression) * 1000 : 0,
    cpv: o.igVisit ? o.spendPpn / o.igVisit : 0,
  };
}
const metaBulan = ringkasIklan(iklanBulan);

const mapProduk = new Map();
for (const r of iklanBulan) {
  const p = r.produk || 'Lainnya';
  if (!mapProduk.has(p)) mapProduk.set(p, []);
  mapProduk.get(p).push(r);
}
const perProduk = Array.from(mapProduk.entries())
  .map(([nama, rows]) => Object.assign({ nama }, ringkasIklan(rows)))
  .sort((a, b) => b.spendPpn - a.spendPpn);

const mapCamp = new Map();
for (const r of iklanBulan) {
  const c = (r.campaign || '(tanpa nama)') + '||' + (r.produk || 'Lainnya');
  if (!mapCamp.has(c)) mapCamp.set(c, []);
  mapCamp.get(c).push(r);
}
const perCampaign = Array.from(mapCamp.entries())
  .map(([kunci, rows]) => {
    const [campaign, produk] = kunci.split('||');
    return Object.assign({ campaign, produk }, ringkasIklan(rows));
  })
  .sort((a, b) => b.spendPpn - a.spendPpn);

const metaHariMap = new Map();
for (const r of iklanBulan) {
  if (!r.tanggal) continue;
  const o = metaHariMap.get(r.tanggal) || { tanggal: r.tanggal, spendPpn: 0, impression: 0, igVisit: 0 };
  o.spendPpn += angka(r.spendPpn); o.impression += angka(r.impression); o.igVisit += angka(r.igVisit);
  metaHariMap.set(r.tanggal, o);
}
const metaDeret = tanggalBerjalan.map(t => metaHariMap.get(t) || { tanggal: t, spendPpn: 0, impression: 0, igVisit: 0 });

const ltHarian = ((dAds && dAds.linktreeHarian) || []).filter(r => String(r.tanggal || '').startsWith(kunciBulan));
const lt = { views: 0, clicks: 0, shopee: 0, wa: 0, maps: 0, tiktok: 0, website: 0 };
for (const r of ltHarian) {
  lt.views += angka(r.views); lt.clicks += angka(r.clicks); lt.shopee += angka(r.shopee);
  lt.wa += angka(r.wa); lt.maps += angka(r.maps); lt.tiktok += angka(r.tiktok); lt.website += angka(r.website);
}
lt.ctr = lt.views ? (lt.clicks / lt.views) * 100 : 0;

const waHarian = ((dAds && dAds.leadsWa) || []).filter(r => String(r.tanggal || '').startsWith(kunciBulan));
const wa = { voucher: 0, linktree: 0, website: 0, iklan: 0, chat: 0, closing: 0, qty: 0, omset: 0 };
for (const r of waHarian) {
  wa.voucher += angka(r.voucher); wa.linktree += angka(r.linktree); wa.website += angka(r.website);
  wa.iklan += angka(r.iklan); wa.chat += angka(r.totalChatBaru); wa.closing += angka(r.closing);
  wa.qty += angka(r.qty); wa.omset += angka(r.omset);
}
wa.konversi = wa.chat ? (wa.closing / wa.chat) * 100 : 0;
wa.aov = wa.closing ? wa.omset / wa.closing : 0;
wa.roas = metaBulan.spendPpn ? wa.omset / metaBulan.spendPpn : 0;

const risikoStok = perProduk.map((p) => {
  const cocok = brandArr.filter((b) => {
    const a = b.nama.toLowerCase(), c = p.nama.toLowerCase();
    return a.indexOf(c) >= 0 || c.indexOf(a) >= 0;
  });
  return {
    produk: p.nama, spendPpn: p.spendPpn,
    siap: cocok.reduce((s, b) => s + b.siap, 0),
    kosong: cocok.reduce((s, b) => s + b.kosong, 0),
    skuTot: cocok.reduce((s, b) => s + b.sku, 0),
    cocok: cocok.length > 0,
  };
}).sort((a, b) => b.spendPpn - a.spendPpn);

// =====================================================================
// 6. KOMPONEN
// =====================================================================
function kpi(label, nilai, sub, nada) {
  return '<div class="kpi' + (nada ? ' ' + nada : '') + '">' +
    '<div class="kpi-l">' + esc(label) + '</div>' +
    '<div class="kpi-v">' + nilai + '</div>' +
    '<div class="kpi-s">' + (sub || '') + '</div></div>';
}
function panel(judul, isi, sub) {
  return '<section class="panel"><div class="panel-h"><h3>' + esc(judul) + '</h3>' +
    (sub ? '<span class="panel-s">' + esc(sub) + '</span>' : '') + '</div>' + isi + '</section>';
}
function kosong(teks) { return '<p class="kosong">' + esc(teks) + '</p>'; }

function tabel(kolom, baris, opsi) {
  const o = opsi || {};
  if (!baris.length) return kosong(o.kosong || 'Belum ada data pada periode ini.');
  const th = kolom.map(k => '<th class="' + (k.num ? 'num' : '') + '">' + esc(k.label) + '</th>').join('');
  const tr = baris.map(r => '<tr' + (o.attr ? ' ' + o.attr(r) : '') + '>' + kolom.map(k => {
    const v = k.val(r);
    const s = k.num ? ' data-sort="' + angka(k.sort ? k.sort(r) : v) + '"' : '';
    return '<td class="' + (k.num ? 'num' : '') + (k.kelas ? ' ' + k.kelas(r) : '') + '"' + s + '>' +
      (k.raw ? v : esc(v)) + '</td>';
  }).join('') + '</tr>').join('');
  return '<div class="tbl-wrap"><table class="tbl sortable"><thead><tr>' + th +
    '</tr></thead><tbody>' + tr + '</tbody></table></div>';
}

function barChart(data, opsi) {
  const o = opsi || {};
  const items2 = data.filter(d => angka(d.value) !== 0);
  if (!items2.length) return kosong(o.kosong || 'Belum ada angka pada bulan berjalan.');
  const max = Math.max(...items2.map(d => Math.abs(angka(d.value))));
  return '<div class="bars">' + items2.map(d => {
    const w = max === 0 ? 0 : (Math.abs(angka(d.value)) / max) * 100;
    return '<div class="bar-row"><div class="bar-lab">' + esc(d.label) + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + w.toFixed(1) + '%"></div></div>' +
      '<div class="bar-val">' + esc(o.format ? o.format(d.value) : rpk(d.value)) + '</div></div>';
  }).join('') + '</div>';
}

function grafikHarian(seri, opsi) {
  const o = Object.assign({ w: 1000, h: 250, format: rpk }, opsi || {});
  const n = tanggalBerjalan.length;
  if (!n) return kosong('Belum ada hari berjalan.');
  let maks = 0;
  for (const s of seri) for (const v of s.data) maks = Math.max(maks, angka(v));
  if (maks <= 0) return kosong(o.kosong || 'Belum ada angka pada bulan berjalan.');
  const padL = 62, padB = 26, padT = 10;
  const lebarPlot = o.w - padL - 10;
  const tinggiPlot = o.h - padB - padT;
  const slot = lebarPlot / n;
  const lebarBar = Math.max(2, (slot * 0.68) / seri.length);
  let bars = '', sumbu = '', garis = '';
  for (let g = 0; g <= 4; g++) {
    const y = padT + tinggiPlot - (g / 4) * tinggiPlot;
    garis += '<line class="grid" x1="' + padL + '" y1="' + ds(y, 1) + '" x2="' + (o.w - 6) + '" y2="' + ds(y, 1) + '"/>' +
      '<text class="axis" x="' + (padL - 6) + '" y="' + ds(y + 3, 1) + '" text-anchor="end">' + esc(o.format((maks * g) / 4)) + '</text>';
  }
  for (let i = 0; i < n; i++) {
    const x0 = padL + i * slot + slot * 0.16;
    seri.forEach((s, k) => {
      const v = angka(s.data[i]);
      const t = (v / maks) * tinggiPlot;
      const x = x0 + k * lebarBar;
      bars += '<rect class="bar" x="' + ds(x, 1) + '" y="' + ds(padT + tinggiPlot - t, 1) +
        '" width="' + ds(lebarBar - 1, 1) + '" height="' + ds(Math.max(t, 0), 1) +
        '" fill="' + s.warna + '" rx="2"><title>' + esc(tanggalBerjalan[i].slice(8)) + ' ' + esc(labelBulan) +
        ' | ' + esc(s.nama) + ': ' + esc(o.format(v)) + '</title></rect>';
    });
    if (n <= 16 || (i + 1) % Math.ceil(n / 12) === 0 || i === n - 1) {
      sumbu += '<text class="axis" x="' + ds(x0 + slot * 0.34, 1) + '" y="' + (o.h - 8) +
        '" text-anchor="middle">' + esc(String(Number(tanggalBerjalan[i].slice(8)))) + '</text>';
    }
  }
  const legenda = seri.length > 1
    ? '<div class="legend">' + seri.map(s => '<span class="lg"><i style="background:' + s.warna + '"></i>' + esc(s.nama) + '</span>').join('') + '</div>'
    : '';
  return legenda + '<svg viewBox="0 0 ' + o.w + ' ' + o.h + '" class="chart" preserveAspectRatio="none">' +
    garis + bars + sumbu + '</svg><p class="nota">Sumbu mendatar: tanggal 1 sampai ' + hariIni + ' ' + esc(labelBulan) + '</p>';
}

// =====================================================================
// 7. TAB
// =====================================================================
const pitaProgres =
  '<div class="progres"><div class="progres-t">' +
  '<span>Hari ke-<b>' + hariIni + '</b> dari ' + hariDalamBulan + ' hari ' + esc(labelBulan) + '</span>' +
  '<span>' + (sisaHari > 0 ? 'sisa ' + sisaHari + ' hari' : 'bulan selesai') + '</span></div>' +
  '<div class="progres-bar"><div style="width:' + progresBulan.toFixed(1) + '%"></div></div></div>';

const tabRingkasan = pitaProgres +
  '<div class="kpis">' +
  kpi('Omset bulan berjalan', rp(mtdOmset), nm(mtdFaktur) + ' faktur Accurate') +
  kpi('Rata-rata per hari', rp(mtdPerHariBerjalan), 'dibagi ' + hariIni + ' hari berjalan') +
  kpi('AOV per faktur', rp(mtdAov), mtdHariTransaksi + ' hari ada transaksi') +
  kpi('Laju akhir bulan', rpk(mtdProyeksi), 'ekstrapolasi linear, bukan ramalan', 'netral') +
  '</div>' +
  panel('Omset faktur harian', grafikHarian([
    { nama: 'Omset faktur', warna: '#2563eb', data: mtdDeret.map(d => d.omset) },
  ], { kosong: 'Belum ada faktur pada bulan berjalan.' }), 'sumber: faktur Accurate') +
  '<div class="kolom-2">' +
  panel('Channel bulan berjalan', tabel([
    { label: 'Channel', val: r => r.channel },
    { label: 'Faktur', num: true, val: r => nm(r.faktur), sort: r => r.faktur },
    { label: 'Omset', num: true, val: r => rp(r.omset), sort: r => r.omset },
    { label: 'AOV', num: true, val: r => rp(r.faktur ? r.omset / r.faktur : 0), sort: r => (r.faktur ? r.omset / r.faktur : 0) },
  ], mtdChannelArr) + '<p class="nota">Channel ditebak dari pola nomor faktur, bukan field resmi Accurate.</p>',
    'per ' + tglHariIni) +
  panel('Sorotan', '<ul class="poin">' +
    '<li>Omset per ' + esc(tglHariIni) + ': <b>' + rp(mtdOmset) + '</b> dari ' + nm(mtdFaktur) + ' faktur</li>' +
    (mtdTerbaik ? '<li>Hari terbaik: <b>tanggal ' + Number(mtdTerbaik.tanggal.slice(8)) + '</b>, ' + rp(mtdTerbaik.omset) + '</li>' : '') +
    (mtdTglTerakhir ? '<li>Faktur terakhir tercatat: <b>' + esc(mtdTglTerakhir) + '</b>' +
      (mtdTglTerakhir < tglHariIni ? ' <span class="peringatan">belum ada faktur sejak itu, cek proses input di Accurate</span>' : '') + '</li>' : '') +
    (bandingAda ? '<li>Dibanding ' + esc(tglPendek(bandingMulai)) + ' sampai ' + esc(tglPendek(bandingAkhir)) +
      ': ' + badge(tOmset) + '</li>' : '') +
    (adaIklan ? '<li>Belanja Meta bulan ini: ' + rp(metaBulan.spendPpn) + ' selama ' + nm(metaBulan.hari) + ' hari aktif</li>'
              : '<li>Belum ada baris iklan Meta untuk bulan berjalan</li>') +
    '<li>Stok siap jual: ' + nm(totSiapJual) + ' pcs, ' + nm(skuKosong) + ' SKU kosong dari ' + nm(invAktif.length) + '</li>' +
    '</ul>') +
  '</div>' +
  panel('Risiko stok pada lini yang diiklankan', tabel([
    { label: 'Lini produk', val: r => r.produk },
    { label: 'Spend +ppn', num: true, val: r => rp(r.spendPpn), sort: r => r.spendPpn },
    { label: 'Siap jual', num: true, val: r => r.cocok ? nm(r.siap) : '-', sort: r => r.siap },
    { label: 'SKU kosong', num: true, val: r => r.cocok ? nm(r.kosong) + ' / ' + nm(r.skuTot) : '-', sort: r => r.kosong },
  ], risikoStok, { kosong: 'Belum ada lini yang diiklankan pada bulan berjalan.' }), 'silang iklan dan stok');

// ---- Panel Accurate yang mengisi tempat metrik sheet ----
const panelBanding = panel('Perbandingan periode sebanding',
  (bandingAda
    ? '<div class="kpis kecil">' +
      kpi('Omset', rp(mtdOmset), esc(tglPendek(bandingMulai)) + ' - ' + esc(tglPendek(bandingAkhir)) + ': ' + rp(bandingOmset) + ' ' + badge(tOmset)) +
      kpi('Jumlah faktur', nm(mtdFaktur), 'sebelumnya ' + nm(bandingFaktur) + ' ' + badge(tFaktur)) +
      kpi('AOV', rp(mtdAov), 'sebelumnya ' + rp(bandingAov) + ' ' + badge(tAov)) +
      '</div>' +
      '<p class="nota">Pembanding adalah ' + hariIni + ' hari terakhir sebelum bulan berjalan, jadi panjang periodenya sama persis. ' +
      (bandingLengkap
        ? 'Rentang itu tercakup penuh oleh data faktur yang ditarik.'
        : 'Perhatian: data faktur paling awal yang tersedia adalah ' + esc(tglTerawal || '-') +
          ', jadi sebagian rentang pembanding belum tercakup dan angkanya cenderung lebih rendah dari kondisi riil.') + '</p>'
    : kosong('Belum ada faktur pada rentang ' + tglPendek(bandingMulai) + ' sampai ' + tglPendek(bandingAkhir) +
        '. Penarikan faktur hanya mencakup bulan berjalan dan 30 hari terakhir.')),
  hariIni + ' hari vs ' + hariIni + ' hari');

const panelPolaHari = panel('Pola hari dalam pekan',
  barChart(pekanTerisi.map(d => ({ label: d.hari + ' (' + d.jumlahHari + 'x)', value: d.jumlahHari ? d.omset / d.jumlahHari : 0 })),
    { kosong: 'Belum ada faktur pada bulan berjalan.' }) +
  '<p class="nota">Rata-rata omset per kemunculan hari tersebut sepanjang bulan berjalan, bukan total.</p>',
  'rata-rata per hari');

const panelSebaran = panel('Sebaran nilai faktur',
  tabel([
    { label: 'Rentang nilai', val: r => r.label },
    { label: 'Faktur', num: true, val: r => nm(r.n), sort: r => r.n },
    { label: 'Porsi', num: true, val: r => totalBucket ? persen((r.n / totalBucket) * 100) : '0%', sort: r => r.n },
    { label: 'Omset', num: true, val: r => rp(r.omset), sort: r => r.omset },
  ], BUCKET.filter(b => b.n > 0), { kosong: 'Belum ada faktur pada bulan berjalan.' }),
  nm(mtdFaktur) + ' faktur');

const panelSheet = sheetSiap
  ? '<div class="kpis">' +
    kpi('Omset sheet', rp(rBJ.totalOmset), 'MoM ' + badge(tSheetMoM) + ' &middot; YoY ' + badge(tSheetYoY)) +
    kpi('Produk terjual', nm(rBJ.totalTerjual) + ' pcs', 'dari sheet') +
    kpi('Resi', nm(rBJ.totalResi), 'AOV ' + rp(aovSheet)) +
    kpi('ROAS total', ds(rBJ.roasTotal), 'dari sheet') +
    kpi('Spend ads +ppn', rp(rBJ.spendAdsPpn), 'dari sheet') +
    kpi('Biaya promosi per pcs', rp(rBJ.biayaPromosiPerPcs), 'dari sheet') +
    '</div>' +
    panel('Omset harian menurut sheet', grafikHarian([
      { nama: 'Omset sheet', warna: '#0ea5e9', data: sheetDeret.map(d => d.omset) },
    ], { kosong: 'Blok sheet bulan ini belum terisi angka harian.' }), esc(labelBulan)) +
    panel('Volume terjual per channel', grafikHarian([
      { nama: 'Shopee', warna: '#f97316', data: sheetDeret.map(d => d.shopee) },
      { nama: 'TikTok', warna: '#0ea5e9', data: sheetDeret.map(d => d.tiktok) },
      { nama: 'Lazada', warna: '#8b5cf6', data: sheetDeret.map(d => d.lazada) },
      { nama: 'Lainnya', warna: '#64748b', data: sheetDeret.map(d => d.lainnya) },
    ], { format: nm, kosong: 'Belum ada volume harian pada sheet bulan ini.' }), 'pcs per hari')
  : '<p class="nota">Metrik yang hanya ada di sheet, yaitu ROAS, spend ads, produk terjual, dan resi, ' +
    'menunggu blok "DATA PENJUALAN ' + esc(String(labelBulan).toUpperCase()) + '" ditambahkan. ' +
    'Panel di atas seluruhnya dari faktur Accurate.</p>';

const tabPenjualan =
  panel('Rekap harian faktur Accurate', tabel([
    { label: 'Tanggal', val: r => r.tanggal },
    { label: 'Faktur', num: true, val: r => nm(r.faktur), sort: r => r.faktur },
    { label: 'Omset', num: true, val: r => rp(r.omset), sort: r => r.omset },
    { label: 'AOV', num: true, val: r => rp(r.faktur ? r.omset / r.faktur : 0), sort: r => (r.faktur ? r.omset / r.faktur : 0) },
  ], mtdDeret), '1 sampai ' + hariIni + ' ' + esc(labelBulan)) +
  panelBanding +
  '<div class="kolom-2">' + panelPolaHari + panelSebaran + '</div>' +
  panelSheet;

function kartuProduk(d) {
  return kpi('Spend +ppn', rp(d.spendPpn), nm(d.hari) + ' hari aktif') +
    kpi('Impresi', nm(d.impression), 'CPM ' + rp(d.cpm)) +
    kpi('Klik est.', nm(d.klik), 'CTR ' + persen(d.ctr, 2) + ' &middot; CPC ' + rp(d.cpc)) +
    kpi('IG visit', nm(d.igVisit), 'Biaya/visit ' + rp(d.cpv)) +
    kpi('Followers IG baru', nm(d.followersIg), 'akumulasi bulan ini');
}
const tombolProduk = ['SEMUA'].concat(perProduk.map(p => p.nama))
  .map((n, i) => '<button class="seg' + (i === 0 ? ' aktif' : '') + '" data-produk="' + esc(n) + '">' + esc(n) + '</button>')
  .join('');
const dataProdukJson = JSON.stringify(perProduk.reduce((acc, p) => {
  acc[p.nama] = { spendPpn: p.spendPpn, impression: p.impression, klik: p.klik, igVisit: p.igVisit,
    ctr: p.ctr, cpc: p.cpc, cpm: p.cpm, cpv: p.cpv, hari: p.hari, followersIg: p.followersIg };
  return acc;
}, { SEMUA: { spendPpn: metaBulan.spendPpn, impression: metaBulan.impression, klik: metaBulan.klik,
  igVisit: metaBulan.igVisit, ctr: metaBulan.ctr, cpc: metaBulan.cpc, cpm: metaBulan.cpm,
  cpv: metaBulan.cpv, hari: metaBulan.hari, followersIg: metaBulan.followersIg } }));

const tabMarketing = !adaIklan
  ? panel('Meta Ads', kosong('Belum ada baris iklan bertanggal ' + esc(labelBulan) +
      ' pada sheet META ADS. Data bulan lain sengaja tidak ditarik ke sini.'), esc(labelBulan))
  : panel('Meta Ads bulan berjalan',
      '<div class="kpis" id="kpi-produk">' + kartuProduk(metaBulan) + '</div>' +
      '<div class="segmen">' + tombolProduk + '</div>' +
      '<p class="nota">Tombol lini produk hanya aktif bila berkas dibuka di peramban. Angka di atas selalu total seluruh lini.</p>',
      esc(labelBulan)) +
    '<div class="kolom-2">' +
    panel('Spend harian', grafikHarian([{ nama: 'Spend +ppn', warna: '#ef4444', data: metaDeret.map(d => d.spendPpn) }])) +
    panel('IG visit harian', grafikHarian([{ nama: 'IG visit', warna: '#10b981', data: metaDeret.map(d => d.igVisit) }], { format: nm })) +
    '</div>' +
    panel('Rincian campaign', tabel([
      { label: 'Campaign', val: r => r.campaign },
      { label: 'Produk', val: r => r.produk },
      { label: 'Hari', num: true, val: r => nm(r.hari), sort: r => r.hari },
      { label: 'Spend +ppn', num: true, val: r => rp(r.spendPpn), sort: r => r.spendPpn },
      { label: 'Impresi', num: true, val: r => nm(r.impression), sort: r => r.impression },
      { label: 'Klik est.', num: true, val: r => nm(r.klik), sort: r => r.klik },
      { label: 'CTR', num: true, val: r => persen(r.ctr, 2), sort: r => r.ctr },
      { label: 'CPC', num: true, val: r => rp(r.cpc), sort: r => r.cpc },
      { label: 'CPM', num: true, val: r => rp(r.cpm), sort: r => r.cpm },
      { label: 'IG visit', num: true, val: r => nm(r.igVisit), sort: r => r.igVisit },
      { label: 'Biaya/visit', num: true, val: r => rp(r.cpv), sort: r => r.cpv },
    ], perCampaign, { attr: r => 'data-produk="' + esc(r.produk) + '"' })) +
    '<div class="kolom-2">' +
    panel('Funnel Linktree', '<div class="kpis kecil">' +
      kpi('Views', nm(lt.views), '') +
      kpi('Clicks', nm(lt.clicks), 'CTR ' + persen(lt.ctr, 2)) +
      kpi('Klik Shopee', nm(lt.shopee), 'TikTok ' + nm(lt.tiktok)) +
      kpi('Klik WA', nm(lt.wa), 'Maps ' + nm(lt.maps) + ' &middot; Web ' + nm(lt.website)) +
      '</div>' + (ltHarian.length ? '' : kosong('Belum ada baris Linktree bertanggal bulan ini.')), esc(labelBulan)) +
    panel('Leads WhatsApp', '<div class="kpis kecil">' +
      kpi('Chat baru', nm(wa.chat), 'iklan ' + nm(wa.iklan) + ' &middot; linktree ' + nm(wa.linktree)) +
      kpi('Closing', nm(wa.closing), 'konversi ' + persen(wa.konversi)) +
      kpi('Omset WA', rp(wa.omset), nm(wa.qty) + ' pcs &middot; AOV ' + rp(wa.aov)) +
      kpi('ROAS via WA', ds(wa.roas), 'terhadap spend Meta') +
      '</div>' + tabel([
        { label: 'Tanggal', val: r => r.tanggal },
        { label: 'Chat', num: true, val: r => nm(r.totalChatBaru), sort: r => r.totalChatBaru },
        { label: 'Closing', num: true, val: r => nm(r.closing), sort: r => r.closing },
        { label: 'Qty', num: true, val: r => nm(r.qty), sort: r => r.qty },
        { label: 'Omset', num: true, val: r => rp(r.omset), sort: r => r.omset },
      ], waHarian, { kosong: 'Belum ada baris leads WA bertanggal bulan ini.' }), esc(labelBulan)) +
    '</div>';

const tabInventori =
  '<div class="kpis">' +
  kpi('SKU aktif', nm(invAktif.length), 'di luar SKU rijek') +
  kpi('Stok fisik', nm(totQty) + ' pcs', 'siap jual ' + nm(totSiapJual) + ' pcs') +
  kpi('SKU kosong', nm(skuKosong), persen(invAktif.length ? (skuKosong / invAktif.length) * 100 : 0) + ' dari total', skuKosong > invAktif.length * 0.3 ? 'bahaya' : '') +
  kpi('Stok negatif', nm(skuNegatif) + ' SKU', 'perlu penyesuaian di Accurate', skuNegatif > 0 ? 'bahaya' : '') +
  '</div>' +
  '<div class="kolom-2">' +
  panel('Stok per brand', tabel([
    { label: 'Brand', val: r => r.nama },
    { label: 'SKU', num: true, val: r => nm(r.sku), sort: r => r.sku },
    { label: 'Qty', num: true, val: r => nm(r.qty), sort: r => r.qty },
    { label: 'Siap jual', num: true, val: r => nm(r.siap), sort: r => r.siap },
    { label: 'Kosong', num: true, val: r => nm(r.kosong), sort: r => r.kosong },
  ], brandArr)) +
  panel('Stok per kategori', tabel([
    { label: 'Kategori', val: r => r.nama },
    { label: 'SKU', num: true, val: r => nm(r.sku), sort: r => r.sku },
    { label: 'Qty', num: true, val: r => nm(r.qty), sort: r => r.qty },
    { label: 'Siap jual', num: true, val: r => nm(r.siap), sort: r => r.siap },
    { label: 'Kosong', num: true, val: r => nm(r.kosong), sort: r => r.kosong },
  ], kategoriArr)) +
  '</div>' +
  panel('SKU kritis', tabel([
    { label: 'Kode', val: r => r.no },
    { label: 'Nama', val: r => r.name },
    { label: 'Brand', val: r => r.brandItem || '-' },
    { label: 'Kategori', val: r => r.kategoriItem || '-' },
    { label: 'Qty', num: true, val: r => nm(r.quantity), sort: r => r.quantity },
    { label: 'Siap jual', num: true, val: r => nm(r.availableToSell), sort: r => r.availableToSell,
      kelas: r => (angka(r.availableToSell) <= 0 ? 'merah' : 'kuning') },
  ], skuKritis), 'siap jual 2 atau kurang, maksimal 60 baris');

// =====================================================================
// 8. HTML
// =====================================================================
const dibuat = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
const tabs = [
  { id: 'ringkasan', label: 'Ringkasan', isi: tabRingkasan },
  { id: 'penjualan', label: 'Penjualan', isi: tabPenjualan },
  { id: 'marketing', label: 'Marketing', isi: tabMarketing },
  { id: 'inventori', label: 'Inventori', isi: tabInventori },
];

const cssTab = tabs.map(t =>
  '#t-' + t.id + ':checked~#tab-' + t.id + '{display:block}' +
  '#t-' + t.id + ':checked~nav.tabs label[for="t-' + t.id + '"]' +
  '{background:var(--ink);color:#fff;border-color:var(--ink)}').join('');
const radios = tabs.map((t, i) =>
  '<input class="tnav" type="radio" name="tnav" id="t-' + t.id + '"' + (i === 0 ? ' checked' : '') + '>').join('');
const navHtml = '<nav class="tabs">' + tabs.map(t =>
  '<label for="t-' + t.id + '">' + esc(t.label) + '</label>').join('') + '</nav>';
const paneHtml = tabs.map(t =>
  '<section class="tab" id="tab-' + t.id + '">' + t.isi + '</section>').join('');

const html = '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">' +
'<meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>Dashboard Qudamah ' + esc(labelBulan) + '</title><style>' +
':root{--bg:#f6f7f9;--card:#fff;--ink:#0b1220;--sub:#667085;--line:#e6e9ef;--biru:#2563eb;--radius:14px}' +
'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);' +
'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased}' +
'.shell{max-width:1240px;margin:0 auto;padding:20px 18px 48px}' +
'header.top{background:linear-gradient(135deg,#0b1220,#1e3a5f);color:#fff;border-radius:var(--radius);padding:24px 26px;margin-bottom:16px}' +
'header.top h1{margin:0;font-size:21px;font-weight:660;letter-spacing:-.3px}' +
'header.top .per{margin-top:8px;font-size:15px;font-weight:600;color:#bfdbfe}' +
'header.top .meta{margin-top:4px;font-size:12px;color:#94a3b8}' +
'input.tnav{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}' +
'nav.tabs{display:flex;gap:6px;overflow-x:auto;padding:4px 0 12px;-webkit-overflow-scrolling:touch}' +
'nav.tabs label{background:#fff;border:1px solid var(--line);color:#475569;padding:10px 17px;' +
'border-radius:999px;cursor:pointer;font-size:13.5px;font-weight:550;white-space:nowrap;' +
'user-select:none;-webkit-user-select:none;display:inline-block}' +
'.tab{display:none}' + cssTab +
'.progres{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px}' +
'.progres-t{display:flex;justify-content:space-between;font-size:13px;color:var(--sub);margin-bottom:8px;gap:10px}' +
'.progres-bar{height:8px;background:#eef1f6;border-radius:999px;overflow:hidden}' +
'.progres-bar>div{height:100%;background:linear-gradient(90deg,#2563eb,#60a5fa);border-radius:999px}' +
'.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:14px}' +
'.kpis.kecil{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}' +
'.kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:15px 16px;border-top:3px solid var(--biru)}' +
'.kpi.netral{border-top-color:#94a3b8}.kpi.bahaya{border-top-color:#dc2626}' +
'.kpi-l{font-size:11px;color:var(--sub);text-transform:uppercase;letter-spacing:.5px;font-weight:650}' +
'.kpi-v{font-size:23px;font-weight:700;margin:6px 0 2px;letter-spacing:-.6px;font-variant-numeric:tabular-nums}' +
'.kpi-s{font-size:11.5px;color:var(--sub)}' +
'.delta{font-weight:650}.delta.naik{color:#16a34a}.delta.turun{color:#dc2626}.delta.nol{color:#94a3b8}' +
'.panel{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px;margin-bottom:14px}' +
'.panel-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--line)}' +
'.panel-h h3{margin:0;font-size:14.5px;font-weight:660}' +
'.panel-s{font-size:11.5px;color:var(--sub);white-space:nowrap}' +
'.kolom-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px}' +
'.chart{width:100%;height:auto;display:block}.grid{stroke:#eef1f6;stroke-width:1}' +
'.axis{font-size:9.5px;fill:#98a2b3}.bar{transition:opacity .15s}.bar:hover{opacity:.7}' +
'.legend{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px;font-size:11.5px;color:var(--sub)}' +
'.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}' +
'.tbl-wrap{overflow:auto;max-height:460px;border:1px solid var(--line);border-radius:10px;-webkit-overflow-scrolling:touch}' +
'.tbl{width:100%;border-collapse:collapse;font-size:12.5px}' +
'.tbl th{position:sticky;top:0;background:#f8fafc;text-align:left;padding:9px 10px;' +
'border-bottom:1px solid var(--line);white-space:nowrap;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--sub)}' +
'.tbl td{padding:8px 10px;border-bottom:1px solid #f2f4f7}' +
'.tbl tbody tr:last-child td{border-bottom:0}' +
'.tbl td.num,.tbl th.num{text-align:right;font-variant-numeric:tabular-nums}' +
'td.merah{color:#dc2626;font-weight:700}td.kuning{color:#d97706;font-weight:600}' +
'.bars{display:flex;flex-direction:column;gap:9px}' +
'.bar-row{display:grid;grid-template-columns:140px 1fr 96px;gap:10px;align-items:center;font-size:12.5px}' +
'.bar-lab{color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
'.bar-track{background:#eef1f6;border-radius:6px;height:18px;overflow:hidden}' +
'.bar-fill{background:linear-gradient(90deg,#2563eb,#60a5fa);height:100%}' +
'.bar-val{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}' +
'.segmen{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0 0}' +
'.seg{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 13px;font-size:12px;cursor:pointer}' +
'.seg.aktif{background:var(--biru);color:#fff;border-color:var(--biru)}' +
'.poin{margin:0;padding-left:18px}.poin li{margin-bottom:7px}' +
'.peringatan{color:#b45309;font-weight:600}' +
'.kosong{color:var(--sub);font-size:13px;background:#f8fafc;border:1px dashed var(--line);border-radius:10px;padding:16px;margin:0}' +
'.nota{color:var(--sub);font-size:11.5px;margin:10px 0 0;line-height:1.5}' +
'footer{text-align:center;color:#98a2b3;font-size:11.5px;margin-top:22px}' +
'@media(max-width:640px){.shell{padding:12px 10px 32px}.kpi-v{font-size:20px}' +
'.kolom-2{grid-template-columns:1fr}.tbl-wrap{max-height:none}' +
'.bar-row{grid-template-columns:100px 1fr 84px;font-size:11.5px}}' +
'</style></head><body><div class="shell">' +
'<header class="top"><h1>Dashboard Operasional Qudamah</h1>' +
'<div class="per">' + esc(labelBulan) + ' &middot; data sampai ' + esc(tglHariIni) + '</div>' +
'<div class="meta">Hanya menampilkan bulan berjalan. Dibuat ' + esc(dibuat) + ' WIB.</div></header>' +
radios + navHtml + paneHtml +
'<footer>Sumber: Accurate Online dan Google Sheets</footer></div>' +
'<script>' +
'var DATA_PRODUK=' + dataProdukJson + ';' +
'function rupiah(n){return "Rp"+Math.round(Number(n)||0).toLocaleString("id-ID");}' +
'function numf(n){return (Number(n)||0).toLocaleString("id-ID");}' +
'document.querySelectorAll("table.sortable th").forEach(function(th){th.style.cursor="pointer";});' +
'document.querySelectorAll("table.sortable").forEach(function(t){var arah={};' +
't.querySelectorAll("th").forEach(function(th,idx){th.addEventListener("click",function(){' +
'var body=t.tBodies[0];var baris=Array.prototype.slice.call(body.rows);' +
'arah[idx]=!arah[idx];var naik=arah[idx];' +
'baris.sort(function(a,b){var x=a.cells[idx],y=b.cells[idx];' +
'var sx=x.dataset.sort,sy=y.dataset.sort;' +
'if(sx!==undefined&&sy!==undefined){return naik?Number(sx)-Number(sy):Number(sy)-Number(sx);}' +
'return naik?x.textContent.localeCompare(y.textContent):y.textContent.localeCompare(x.textContent);});' +
'baris.forEach(function(r){body.appendChild(r);});});});});' +
'function renderProduk(nama){var d=DATA_PRODUK[nama];var el=document.getElementById("kpi-produk");' +
'if(!d||!el)return;el.innerHTML=' +
'"<div class=\\"kpi\\"><div class=\\"kpi-l\\">Spend +ppn</div><div class=\\"kpi-v\\">"+rupiah(d.spendPpn)+"</div><div class=\\"kpi-s\\">"+numf(d.hari)+" hari aktif</div></div>"+' +
'"<div class=\\"kpi\\"><div class=\\"kpi-l\\">Impresi</div><div class=\\"kpi-v\\">"+numf(d.impression)+"</div><div class=\\"kpi-s\\">CPM "+rupiah(d.cpm)+"</div></div>"+' +
'"<div class=\\"kpi\\"><div class=\\"kpi-l\\">Klik est.</div><div class=\\"kpi-v\\">"+numf(d.klik)+"</div><div class=\\"kpi-s\\">CTR "+(Number(d.ctr)||0).toFixed(2)+"% CPC "+rupiah(d.cpc)+"</div></div>"+' +
'"<div class=\\"kpi\\"><div class=\\"kpi-l\\">IG visit</div><div class=\\"kpi-v\\">"+numf(d.igVisit)+"</div><div class=\\"kpi-s\\">Biaya/visit "+rupiah(d.cpv)+"</div></div>"+' +
'"<div class=\\"kpi\\"><div class=\\"kpi-l\\">Followers IG baru</div><div class=\\"kpi-v\\">"+numf(d.followersIg)+"</div><div class=\\"kpi-s\\">akumulasi bulan ini</div></div>";' +
'document.querySelectorAll("tr[data-produk]").forEach(function(r){' +
'r.style.display=(nama==="SEMUA"||r.dataset.produk===nama)?"":"none";});}' +
'document.querySelectorAll(".seg").forEach(function(b){b.addEventListener("click",function(){' +
'document.querySelectorAll(".seg").forEach(function(x){x.classList.remove("aktif");});' +
'b.classList.add("aktif");renderProduk(b.dataset.produk);});});' +
'<\/script></body></html>';

return [{
  json: {
    html,
    bulanBerjalan: kunciBulan,
    labelBulan,
    perTanggal: tglHariIni,
    hariKe: hariIni,
    hariDalamBulan,
    omsetFaktur: mtdOmset,
    jumlahFaktur: mtdFaktur,
    rataRataPerHari: mtdPerHariBerjalan,
    bandingMulai, bandingAkhir, bandingOmset, bandingFaktur, bandingLengkap,
    fakturTerakhir: mtdTglTerakhir,
    sheetSiap,
    adaIklan,
    skuAktif: invAktif.length,
    skuKosong,
    skuNegatif,
    ukuranKb: Math.round(Buffer.byteLength(html, 'utf8') / 1024),
  },
  binary: {
    data: {
      data: Buffer.from(html, 'utf8').toString('base64'),
      mimeType: 'text/html',
      fileName: 'dashboard-qudamah-' + kunciBulan + '.html',
      fileExtension: 'html',
    },
  },
}];
