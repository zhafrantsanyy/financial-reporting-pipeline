// ============================================================
// HITUNG METRIK HARIAN
// Prinsip: tidak boleh ada blok yang tampil kosong.
// Setiap angka punya sumber cadangan, dan kalau memang tidak ada
// datanya, yang muncul adalah alasan, bukan nol tanpa keterangan.
// ============================================================

const tgl = $('Siapkan Sesi dan Tanggal').first().json;

// ====== KONFIGURASI NAMA NODE ======
// Boleh diisi beberapa alternatif, yang tidak ada diabaikan diam-diam.
const NODE_MARKETING = ['Rapikan Data Marketing', 'Parse Marketing', 'Baca Data Marketing', 'Baca Data Restock'];
const NODE_INVOICE_MTD = ['Accurate Sales Invoice MTD'];
const NODE_INVOICE_30 = ['Accurate Invoice 30 Hari Detail'];
const NODE_STOK = ['Filter Item Category', 'Accurate Item List', 'Accurate Item'];

// ====== UTILITAS ======
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const rupiah = (n) => 'Rp ' + Math.round(num(n)).toLocaleString('id-ID');
const angka = (n) => Math.round(num(n)).toLocaleString('id-ID');
const des = (n, d) => Number(num(n).toFixed(d === undefined ? 2 : d));
const persen = (a, b) => (num(b) > 0 ? ((num(a) - num(b)) / num(b)) * 100 : null);
const tandaP = (n, d) => (n === null || n === undefined ? '' : (n >= 0 ? '+' : '') + num(n).toFixed(d === undefined ? 1 : d) + '%');
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const keIso = (s) => {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0') : null;
};
const dariIso = (s) => {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : s;
};
const isoTgl = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 90000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const selisihHari = (isoA, isoB) => Math.round((new Date(isoA) - new Date(isoB)) / 86400000);
const labelBulanIso = (iso7) => NAMA_BULAN[Number(String(iso7).slice(5, 7)) - 1] + ' ' + String(iso7).slice(0, 4);
const hariDalamBulanIso = (iso7) => new Date(Number(String(iso7).slice(0, 4)), Number(String(iso7).slice(5, 7)), 0).getDate();

// Node HTTP Accurate terbungkus { s, d: [...] }
function accurate(namaList) {
  const out = [];
  for (const n of [].concat(namaList)) {
    try { for (const i of $(n).all()) if (i && i.json && Array.isArray(i.json.d)) out.push(...i.json.d); } catch (e) {}
  }
  return out;
}
// Node Code dan Google Sheets sudah flat
function flat(namaList) {
  const out = [];
  for (const n of [].concat(namaList)) {
    try { for (const i of $(n).all()) if (i && i.json && Object.keys(i.json).length > 0) out.push(i.json); } catch (e) {}
  }
  return out;
}
// Baris terakhir yang tanggalnya tidak melewati batas, kalau tidak ada ambil yang paling awal
const terdekat = (rows, isoBatas) => {
  const c = rows.filter(r => r.iso && r.iso <= isoBatas);
  if (c.length > 0) return c[c.length - 1];
  return rows.length > 0 ? rows[0] : null;
};
// Jendela N hari terakhir sampai isoAkhir
const jendela = (rows, isoAkhir, n) => {
  const t = [...new Set(rows.filter(r => r.iso && r.iso <= isoAkhir).map(r => r.iso))].sort().slice(-n);
  const set = new Set(t);
  return { tanggal: t, rows: rows.filter(r => set.has(r.iso)) };
};
const rapikan = (rows, kunciTgl) => rows
  .map(r => Object.assign({}, r, { iso: isoTgl(r[kunciTgl || 'tanggal']) }))
  .filter(r => r.iso)
  .sort((a, b) => a.iso.localeCompare(b.iso));

// ============================================================
// SUMBER DATA
// ============================================================
const invoice = accurate(NODE_INVOICE_MTD);
const invoice30 = accurate(NODE_INVOICE_30);
const stok = flat(NODE_STOK);

function ambilMarketing() {
  const kandidat = [];
  for (const n of NODE_MARKETING) {
    try { for (const i of $(n).all()) if (i && i.json) kandidat.push(i.json); } catch (e) {}
  }
  try { for (const i of $input.all()) if (i && i.json) kandidat.push(i.json); } catch (e) {}
  return {
    sales: kandidat.find(r => r && (r._source === 'sales' || r.bulanBerjalan)) || null,
    ads: kandidat.find(r => r && (r._source === 'ads' || Array.isArray(r.iklan))) || null
  };
}
const mkt = ambilMarketing();
const blnKini = (mkt.sales && mkt.sales.bulanBerjalan) || null;
const blnLalu = (mkt.sales && mkt.sales.bulanSebelumnya) || null;
const thnLalu = (mkt.sales && mkt.sales.tahunLalu) || null;

// ============================================================
// SERI HARIAN: ACCURATE DAN MARKETPLACE
// Dua sumber dipakai saling menambal. Accurate untuk invoice resmi,
// sheet marketplace untuk omset harian yang biasanya lebih cepat terisi.
// ============================================================
const nilaiInv = (t) => num(t.totalAmount != null ? t.totalAmount : t.primeAmount);
const petaAcc = new Map();
for (const t of invoice) {
  const iso = keIso(t.transDate) || isoTgl(t.transDate);
  if (!iso) continue;
  if (!petaAcc.has(iso)) petaAcc.set(iso, { iso: iso, omset: 0, trx: 0, pcs: 0 });
  const h = petaAcc.get(iso);
  h.omset += nilaiInv(t);
  h.trx += 1;
}
const seriAcc = [...petaAcc.values()].sort((a, b) => a.iso.localeCompare(b.iso));

const seriMp = [];
for (const sumber of [blnKini, blnLalu]) {
  if (!sumber || !Array.isArray(sumber.harian)) continue;
  for (const r of sumber.harian) {
    const iso = isoTgl(r.tanggal);
    if (!iso) continue;
    seriMp.push({
      iso: iso, omset: num(r.omset), trx: num(r.resi), pcs: num(r.terjual),
      shopee: num(r.shopee), tiktok: num(r.tiktok), lazada: num(r.lazada), lainnya: num(r.lainnya)
    });
  }
}
seriMp.sort((a, b) => a.iso.localeCompare(b.iso));

// Ringkasan satu seri: hari terakhir, akumulasi bulan hari terakhir itu,
// rata-rata 7 hari, hari terbaik dan terburuk, proyeksi akhir bulan.
function ringkasSeri(seri, label) {
  const isi = seri.filter(r => r.iso <= tgl.isoKemarin && r.omset > 0);
  if (isi.length === 0) return { ada: false, label: label };
  const akhir = isi[isi.length - 1];
  const bulan = akhir.iso.slice(0, 7);
  const seBulan = isi.filter(r => r.iso.slice(0, 7) === bulan);
  const akum = seBulan.reduce((a, r) => a + r.omset, 0);
  const trxBulan = seBulan.reduce((a, r) => a + r.trx, 0);
  const pcsBulan = seBulan.reduce((a, r) => a + r.pcs, 0);
  const hariAktif = seBulan.length;
  const rata = hariAktif > 0 ? akum / hariAktif : 0;
  const j7 = jendela(isi, akhir.iso, 7);
  const omset7 = j7.rows.reduce((a, r) => a + r.omset, 0);
  const rata7 = j7.tanggal.length > 0 ? omset7 / j7.tanggal.length : 0;
  const urutOmset = [...seBulan].sort((a, b) => b.omset - a.omset);
  const hariDlmBulan = hariDalamBulanIso(bulan);
  return {
    ada: true,
    label: label,
    isoTerakhir: akhir.iso,
    tglTerakhir: dariIso(akhir.iso),
    tertinggal: selisihHari(tgl.isoKemarin, akhir.iso),
    omset: akhir.omset,
    trx: akhir.trx,
    pcs: akhir.pcs,
    aov: akhir.trx > 0 ? akhir.omset / akhir.trx : null,
    bulan: bulan,
    labelBulan: labelBulanIso(bulan),
    bulanBerjalan: bulan === String(tgl.isoKemarin).slice(0, 7),
    akum: akum,
    trxBulan: trxBulan,
    pcsBulan: pcsBulan,
    hariAktif: hariAktif,
    hariDalamBulan: hariDlmBulan,
    rata: rata,
    rata7: rata7,
    hari7: j7.tanggal.length,
    devRata: rata > 0 ? des(((akhir.omset - rata) / rata) * 100, 1) : null,
    dev7: rata7 > 0 ? des(((akhir.omset - rata7) / rata7) * 100, 1) : null,
    terbaik: urutOmset[0] || null,
    terburuk: urutOmset.length > 1 ? urutOmset[urutOmset.length - 1] : null,
    proyeksi: rata * hariDlmBulan,
    detail: akhir
  };
}
const sAcc = ringkasSeri(seriAcc, 'Accurate');
const sMp = ringkasSeri(seriMp, 'Sheet marketplace');
// Sumber utama dipilih yang datanya paling baru, bukan yang mana saja yang ada
const sUtama = (sAcc.ada && sMp.ada)
  ? (sAcc.isoTerakhir >= sMp.isoTerakhir ? sAcc : sMp)
  : (sAcc.ada ? sAcc : (sMp.ada ? sMp : null));
const sKedua = sUtama === sAcc ? (sMp.ada ? sMp : null) : (sAcc.ada ? sAcc : null);

// ============================================================
// MARKETING
// ============================================================
const rowsIklan = rapikan(mkt.ads && Array.isArray(mkt.ads.iklan) ? mkt.ads.iklan : [])
  .filter(r => r.iso <= tgl.isoKemarin);
const rowsLinktree = rapikan(mkt.ads && Array.isArray(mkt.ads.linktreeHarian) ? mkt.ads.linktreeHarian : [])
  .filter(r => r.iso <= tgl.isoKemarin);
const rowsLeads = rapikan(mkt.ads && Array.isArray(mkt.ads.leadsWa) ? mkt.ads.leadsWa : [])
  .filter(r => r.iso <= tgl.isoKemarin);

const isoAds = rowsIklan.length > 0 ? rowsIklan[rowsIklan.length - 1].iso : null;
const adsAda = isoAds !== null;
const adsTertinggal = isoAds ? selisihHari(tgl.isoKemarin, isoAds) : null;

// Klik tidak ada kolomnya, direkonstruksi dari ctr x impresi, cadangan spend / cpc
const klikRow = (r) => {
  const k = num(r.ctr) * num(r.impression);
  if (k > 0) return k;
  const c = num(r.cpc);
  return c > 0 ? num(r.spend) / c : 0;
};
function totalIklan(rows) {
  const t = { baris: rows.length, spend: 0, ppn: 0, spendPpn: 0, impresi: 0, reach: 0, klik: 0, igVisit: 0, chatWa: 0, followersIg: 0, followersFanpage: 0 };
  for (const r of rows) {
    t.spend += num(r.spend);
    t.ppn += num(r.ppn);
    t.spendPpn += num(r.spendPpn) || (num(r.spend) + num(r.ppn));
    t.impresi += num(r.impression);
    t.reach += num(r.reach);
    t.klik += klikRow(r);
    t.igVisit += num(r.igVisit);
    t.chatWa += num(r.chatWa);
    t.followersIg += num(r.followersIg);
    t.followersFanpage += num(r.followersFanpage);
  }
  t.klik = Math.round(t.klik);
  t.ctr = t.impresi > 0 ? des((t.klik / t.impresi) * 100) : null;
  t.cpc = t.klik > 0 ? Math.round(t.spendPpn / t.klik) : null;
  t.cpm = t.impresi > 0 ? Math.round((t.spendPpn / t.impresi) * 1000) : null;
  t.frekuensi = t.reach > 0 ? des(t.impresi / t.reach) : null;
  t.cpv = t.igVisit > 0 ? Math.round(t.spendPpn / t.igVisit) : null;
  t.cpf = t.followersIg > 0 ? Math.round(t.spendPpn / t.followersIg) : null;
  return t;
}
const iklanHari = isoAds ? rowsIklan.filter(r => r.iso === isoAds) : [];
const iklanH = totalIklan(iklanHari);

const j7Ads = jendela(rowsIklan, isoAds || tgl.isoKemarin, 7);
const iklan7 = totalIklan(j7Ads.rows);
const spend7Rata = j7Ads.tanggal.length > 0 ? iklan7.spendPpn / j7Ads.tanggal.length : 0;
const devSpend = spend7Rata > 0 ? des(((iklanH.spendPpn - spend7Rata) / spend7Rata) * 100, 1) : null;
const devCpm = (iklan7.cpm && iklanH.cpm) ? des(((iklanH.cpm - iklan7.cpm) / iklan7.cpm) * 100, 1) : null;
const devCtr = (iklan7.ctr && iklanH.ctr) ? des(iklanH.ctr - iklan7.ctr, 2) : null;

// Akumulasi: pakai bulan berjalan, kalau kosong turun ke bulan data iklan terakhir
const bulanAds = isoAds ? isoAds.slice(0, 7) : null;
const iklanMtd = rowsIklan.filter(r => r.iso >= tgl.isoAwalBulan);
const pakaiMtd = iklanMtd.length > 0;
const rowsAkum = pakaiMtd ? iklanMtd : rowsIklan.filter(r => bulanAds && r.iso.slice(0, 7) === bulanAds);
const iklanAkum = totalIklan(rowsAkum);
const hariAkum = new Set(rowsAkum.map(r => r.iso)).size;
const labelAkum = pakaiMtd ? 'MTD ' + tgl.labelBulan : (bulanAds ? 'Akumulasi ' + labelBulanIso(bulanAds) : 'Akumulasi');

// Belanja per lini produk. Kalau kolom produk kosong, jatuh ke nama campaign.
function pecahProduk(rows) {
  const peta = new Map();
  for (const r of rows) {
    const p = (r.produk && String(r.produk).trim()) || (r.campaign && String(r.campaign).trim()) || 'Tanpa nama';
    if (!peta.has(p)) peta.set(p, []);
    peta.get(p).push(r);
  }
  return [...peta.entries()].map(([p, rs]) => {
    const t = totalIklan(rs);
    return {
      produk: p, campaign: rs.length, spendPpn: Math.round(t.spendPpn),
      impresi: t.impresi, reach: t.reach, klik: t.klik, igVisit: t.igVisit,
      ctr: t.ctr, cpm: t.cpm, cpv: t.cpv
    };
  }).sort((a, b) => b.spendPpn - a.spendPpn);
}
// Kalau hari terakhir cuma sedikit campaign, breakdown diambil dari 7 hari
// supaya blok ini tidak nyaris kosong.
const produkHari = pecahProduk(iklanHari);
const produk7 = pecahProduk(j7Ads.rows);
const pakaiProdukHari = produkHari.length >= 3;
const produkTampil = (pakaiProdukHari ? produkHari : produk7).slice(0, 6);
const labelProduk = !adsAda
  ? 'BELANJA PER LINI PRODUK'
  : (pakaiProdukHari
    ? 'Belanja per lini ' + dariIso(isoAds)
    : 'Belanja per lini ' + j7Ads.tanggal.length + ' hari terakhir');
const efisienCpm = [...produkTampil].filter(p => p.cpm).sort((a, b) => a.cpm - b.cpm);

// Omset marketplace di tanggal yang sama dengan data iklan, untuk ROAS sebanding
const mpUntukAds = isoAds ? terdekat(seriMp, isoAds) : null;
const mpCocokTanggal = !!(mpUntukAds && mpUntukAds.iso === isoAds);
const roasMetaHari = (mpUntukAds && mpCocokTanggal && iklanH.spendPpn > 0) ? des(mpUntukAds.omset / iklanH.spendPpn) : null;
const j7Mp = isoAds ? jendela(seriMp, isoAds, 7) : { tanggal: [], rows: [] };
const omset7Mp = j7Mp.rows.reduce((a, r) => a + r.omset, 0);
const roasMeta7 = (omset7Mp > 0 && iklan7.spendPpn > 0) ? des(omset7Mp / iklan7.spendPpn) : null;

// Linktree: tanggal sama, kalau tidak ada ambil terdekat, plus akumulasi 7 hari
const ltHari = isoAds ? terdekat(rowsLinktree, isoAds) : (rowsLinktree.length ? rowsLinktree[rowsLinktree.length - 1] : null);
const j7Lt = ltHari ? jendela(rowsLinktree, ltHari.iso, 7) : { tanggal: [], rows: [] };
const lt7 = j7Lt.rows.reduce((a, r) => ({
  views: a.views + num(r.views), clicks: a.clicks + num(r.clicks), shopee: a.shopee + num(r.shopee),
  wa: a.wa + num(r.wa), maps: a.maps + num(r.maps), tiktok: a.tiktok + num(r.tiktok), website: a.website + num(r.website)
}), { views: 0, clicks: 0, shopee: 0, wa: 0, maps: 0, tiktok: 0, website: 0 });
const ltCtr = (ltHari && num(ltHari.views) > 0) ? des((num(ltHari.clicks) / num(ltHari.views)) * 100, 1) : null;
const lt7Ctr = lt7.views > 0 ? des((lt7.clicks / lt7.views) * 100, 1) : null;
const biayaPerView = (ltHari && num(ltHari.views) > 0 && iklanH.spendPpn > 0) ? Math.round(iklanH.spendPpn / num(ltHari.views)) : null;
const biayaPerView7 = (lt7.views > 0 && iklan7.spendPpn > 0) ? Math.round(iklan7.spendPpn / lt7.views) : null;

// Leads WA: angka hariannya kecil, jadi selalu ditemani akumulasi 7 hari
const waHari = isoAds ? terdekat(rowsLeads, isoAds) : (rowsLeads.length ? rowsLeads[rowsLeads.length - 1] : null);
const j7Wa = waHari ? jendela(rowsLeads, waHari.iso, 7) : { tanggal: [], rows: [] };
const wa7 = j7Wa.rows.reduce((a, r) => ({
  chat: a.chat + num(r.totalChatBaru), voucher: a.voucher + num(r.voucher), linktree: a.linktree + num(r.linktree),
  website: a.website + num(r.website), iklan: a.iklan + num(r.iklan), closing: a.closing + num(r.closing),
  qty: a.qty + num(r.qty), omset: a.omset + num(r.omset)
}), { chat: 0, voucher: 0, linktree: 0, website: 0, iklan: 0, closing: 0, qty: 0, omset: 0 });
const konversiWa = (waHari && num(waHari.totalChatBaru) > 0) ? des((num(waHari.closing) / num(waHari.totalChatBaru)) * 100, 1) : null;
const konversiWa7 = wa7.chat > 0 ? des((wa7.closing / wa7.chat) * 100, 1) : null;
const aovWa7 = wa7.closing > 0 ? wa7.omset / wa7.closing : null;

// Rekap bulanan dari sheet marketing
const rk = (blnKini && blnKini.ringkasan) || {};
const rkLalu = (blnLalu && blnLalu.ringkasan) || {};
const rkThn = (thnLalu && thnLalu.ringkasan) || {};
const momOmset = persen(rk.totalOmset, rkLalu.totalOmset);
const yoyOmset = persen(rk.totalOmset, rkThn.totalOmset);
const momSpend = persen(rk.spendAdsPpn, rkLalu.spendAdsPpn);
const momPcs = persen(rk.totalTerjual, rkLalu.totalTerjual);
const deltaRoas = (num(rk.roasTotal) > 0 && num(rkLalu.roasTotal) > 0) ? des(num(rk.roasTotal) - num(rkLalu.roasTotal)) : null;
const deltaBiayaPcs = persen(rk.biayaPromosiPerPcs, rkLalu.biayaPromosiPerPcs);

// ============================================================
// INVENTORI
// ============================================================
const terjualPeta = {};
for (const trx of invoice30) {
  const detail = trx.detailItem || trx.detailItems || trx.detail || [];
  if (!Array.isArray(detail)) continue;
  for (const d of detail) {
    const kode = d.itemNo || (d.item && (d.item.no || d.item.name)) || d.detailName;
    if (kode) terjualPeta[kode] = (terjualPeta[kode] || 0) + num(d.quantity);
  }
}
const adaVelocity = Object.keys(terjualPeta).length > 0;

const skuList = stok.map(it => {
  const q = num(it.availableToSell != null ? it.availableToSell : it.quantity);
  const rata = (terjualPeta[it.no] || terjualPeta[it.name] || 0) / 30;
  return {
    kode: it.no || '',
    sku: it.name || it.no || '',
    brand: it.brandItem || it.kategoriItem || 'Tanpa kategori',
    kategori: it.kategoriItem || 'Tanpa kategori',
    satuan: it.unit1Name || 'PCS',
    stok: q,
    rataTerjualHarian: des(rata),
    hariKecukupan: rata > 0 ? des(q / rata, 1) : null
  };
});
const totalStok = skuList.reduce((a, s) => a + s.stok, 0);
const skuKosong = skuList.filter(s => s.stok <= 0);
const skuIsi = skuList.filter(s => s.stok > 0);

const petaBrand = new Map();
for (const s of skuList) {
  if (!petaBrand.has(s.brand)) petaBrand.set(s.brand, { brand: s.brand, stok: 0, sku: 0, kosong: 0, jual: 0 });
  const a = petaBrand.get(s.brand);
  a.stok += s.stok; a.sku += 1; a.jual += s.rataTerjualHarian;
  if (s.stok <= 0) a.kosong += 1;
}
const brandList = [...petaBrand.values()].map(a => ({
  brand: a.brand,
  stok: des(a.stok),
  jumlahSku: a.sku,
  skuKosong: a.kosong,
  persenKosong: a.sku > 0 ? Math.round((a.kosong / a.sku) * 100) : 0,
  stokPerSku: a.sku > 0 ? des(a.stok / a.sku, 1) : 0,
  rataTerjualHarian: des(a.jual),
  hariKecukupan: a.jual > 0 ? des(a.stok / a.jual, 1) : null
}));
// Ambang 5 SKU dilonggarkan otomatis kalau hasilnya kosong
let rawanKosong = brandList.filter(a => a.skuKosong > 0 && a.jumlahSku >= 5)
  .sort((x, y) => y.persenKosong - x.persenKosong || y.skuKosong - x.skuKosong).slice(0, 8);
let labelRawan = 'Lini paling banyak varian kosong (minimal 5 SKU)';
if (rawanKosong.length === 0) {
  rawanKosong = brandList.filter(a => a.skuKosong > 0)
    .sort((x, y) => y.skuKosong - x.skuKosong || y.persenKosong - x.persenKosong).slice(0, 8);
  labelRawan = 'Lini dengan varian kosong';
}
if (rawanKosong.length === 0) {
  rawanKosong = [...brandList].sort((x, y) => x.stokPerSku - y.stokPerSku).slice(0, 5);
  labelRawan = 'Lini dengan stok per SKU paling tipis (tidak ada varian kosong)';
}
const stokTerbesar = [...brandList].sort((x, y) => y.stok - x.stok).slice(0, 5);

// Kalau velocity ada pakai hari kecukupan, kalau tidak pakai stok absolut terendah
const kritis = adaVelocity
  ? skuIsi.filter(s => s.hariKecukupan !== null && s.hariKecukupan < 14).sort((a, b) => a.hariKecukupan - b.hariKecukupan).slice(0, 10)
  : [...skuIsi].sort((a, b) => a.stok - b.stok).slice(0, 10);
const labelKritis = adaVelocity
  ? 'SKU kecukupan di bawah 14 hari'
  : 'SKU stok paling tipis (velocity belum tersedia, diurut dari stok terkecil)';
const topLaku = adaVelocity
  ? skuList.filter(s => s.rataTerjualHarian > 0).sort((a, b) => b.rataTerjualHarian - a.rataTerjualHarian).slice(0, 5)
  : [...skuIsi].sort((a, b) => b.stok - a.stok).slice(0, 5);
const labelTopLaku = adaVelocity ? 'Tercepat terjual 30 hari' : 'SKU stok terbesar';

// Cocokkan lini yang diiklankan ke lini stok. Semua kata nama produk iklan
// harus ada di nama lini, supaya Charlie Jumbo tidak tercocok ke Charlie REG.
const cocokLini = [];
for (const p of produkTampil) {
  const kata = String(p.produk).toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (kata.length === 0) continue;
  const cocok = brandList.filter(b => {
    const nama = String(b.brand).toLowerCase();
    return kata.every(w => nama.includes(w));
  });
  if (cocok.length === 0) { cocokLini.push({ produk: p.produk, spendPpn: p.spendPpn, adaStok: false }); continue; }
  const stokLini = cocok.reduce((a, b) => a + b.stok, 0);
  const kosongLini = cocok.reduce((a, b) => a + b.skuKosong, 0);
  const skuLini = cocok.reduce((a, b) => a + b.jumlahSku, 0);
  cocokLini.push({
    produk: p.produk, spendPpn: p.spendPpn, adaStok: true,
    stok: des(stokLini), jumlahSku: skuLini, skuKosong: kosongLini,
    persenKosong: skuLini > 0 ? Math.round((kosongLini / skuLini) * 100) : 0
  });
}
const cocokAdaStok = cocokLini.filter(c => c.adaStok);
let iklanVsStok = cocokAdaStok.filter(c => c.persenKosong >= 30 || c.stok <= 0).sort((a, b) => b.spendPpn - a.spendPpn).slice(0, 5);
let labelIklanStok = 'Lini yang diiklankan tapi stoknya rawan';
if (iklanVsStok.length === 0 && cocokAdaStok.length > 0) {
  iklanVsStok = [...cocokAdaStok].sort((a, b) => b.spendPpn - a.spendPpn).slice(0, 5);
  labelIklanStok = 'Lini yang diiklankan dan posisi stoknya (semua masih aman)';
}
const iklanTanpaStok = cocokLini.filter(c => !c.adaStok).map(c => c.produk);

// ============================================================
// PESAN
// ============================================================
const L = [];
const blok = (judul, baris, kosong) => {
  L.push('');
  L.push(judul);
  const isi = (baris || []).filter(b => b !== null && b !== undefined && b !== '');
  if (isi.length > 0) L.push(...isi);
  else L.push(kosong || 'Data belum tersedia.');
};

L.push('LAPORAN HARIAN ' + tgl.labelTanggal);

// ---------- SALES ----------
const bSales = [];
if (sUtama) {
  const s = sUtama;
  bSales.push('Sumber utama: ' + s.label + ', data terakhir ' + s.tglTerakhir + (s.tertinggal === 0 ? ' (terkini)' : ' (tertinggal ' + s.tertinggal + ' hari dari ' + tgl.tglKemarin + ')'));
  bSales.push('Omset ' + s.tglTerakhir + ': ' + rupiah(s.omset) + (s.trx > 0 ? ' dari ' + angka(s.trx) + (s.label === 'Accurate' ? ' invoice' : ' resi') : '') + (s.pcs > 0 ? ', ' + angka(s.pcs) + ' pcs' : ''));
  if (s.aov) bSales.push('Rata-rata per transaksi: ' + rupiah(s.aov));
  if (s.detail && s.detail.shopee !== undefined) {
    bSales.push('Sebaran channel: Shopee ' + angka(s.detail.shopee) + ', TikTok ' + angka(s.detail.tiktok) + ', Lazada ' + angka(s.detail.lazada) + ', lainnya ' + angka(s.detail.lainnya) + ' pcs');
  }
  bSales.push('Akumulasi ' + s.labelBulan + ': ' + rupiah(s.akum) + ' dari ' + s.hariAktif + ' hari transaksi' + (s.pcsBulan > 0 ? ', ' + angka(s.pcsBulan) + ' pcs' : ''));
  bSales.push('Rata-rata per hari transaksi: ' + rupiah(s.rata) + ', 7 hari terakhir ' + rupiah(s.rata7) + '/hari');
  bSales.push('Hari terakhir vs rata-rata bulan: ' + tandaP(s.devRata) + ', vs rata 7 hari: ' + tandaP(s.dev7));
  if (s.terbaik) bSales.push('Hari terbaik ' + s.labelBulan + ': ' + dariIso(s.terbaik.iso) + ' ' + rupiah(s.terbaik.omset) + (s.terburuk ? ' | terendah: ' + dariIso(s.terburuk.iso) + ' ' + rupiah(s.terburuk.omset) : ''));
  bSales.push('Proyeksi akhir ' + s.labelBulan + ': ' + rupiah(s.proyeksi) + ' (' + s.hariAktif + ' dari ' + s.hariDalamBulan + ' hari terisi)');
  if (!s.bulanBerjalan) bSales.push('Catatan: belum ada data untuk ' + tgl.labelBulan + ', angka di atas memakai bulan terakhir yang terisi.');
  if (sKedua) {
    bSales.push('Pembanding ' + sKedua.label + ': data terakhir ' + sKedua.tglTerakhir + ', omset ' + rupiah(sKedua.omset) + ', akumulasi ' + sKedua.labelBulan + ' ' + rupiah(sKedua.akum));
    if (sKedua.bulan === s.bulan) {
      const selisih = persen(s.akum, sKedua.akum);
      if (selisih !== null) bSales.push('Selisih akumulasi ' + s.label + ' terhadap ' + sKedua.label + ': ' + tandaP(selisih) + '. Wajar kalau cakupan channel keduanya berbeda.');
    }
  }
}
blok('SALES', bSales, seriAcc.length === 0 && seriMp.length === 0
  ? 'Tidak ada data penjualan dari Accurate maupun sheet marketing. Cek node invoice dan node marketing.'
  : 'Ada baris data tapi belum ada omset di atas nol sampai ' + tgl.tglKemarin + '.');

// ---------- MARKETING ----------
const bMkt = [];
if (adsAda) {
  bMkt.push('Data iklan terakhir: ' + dariIso(isoAds) + (adsTertinggal === 0 ? ' (terkini)' : ' (tertinggal ' + adsTertinggal + ' hari)') + ', ' + iklanHari.length + ' campaign aktif');
  bMkt.push('Belanja: ' + rupiah(iklanH.spendPpn) + ' (net ' + rupiah(iklanH.spend) + ' plus PPN ' + rupiah(iklanH.ppn) + ')' + (devSpend !== null ? ', ' + tandaP(devSpend) + ' vs rata 7 hari ' + rupiah(spend7Rata) + '/hari' : ''));
  bMkt.push('Impresi ' + angka(iklanH.impresi) + ', jangkauan ' + angka(iklanH.reach) + (iklanH.frekuensi ? ', frekuensi ' + iklanH.frekuensi + 'x' : ''));
  bMkt.push('Klik ' + angka(iklanH.klik) + (iklanH.ctr ? ', CTR ' + iklanH.ctr + '%' : '') + (devCtr !== null ? ' (' + (devCtr >= 0 ? '+' : '') + devCtr + ' poin vs 7 hari)' : '') + (iklanH.cpc ? ', CPC ' + rupiah(iklanH.cpc) : ''));
  bMkt.push('CPM ' + (iklanH.cpm ? rupiah(iklanH.cpm) : 'belum terhitung') + (devCpm !== null ? ' (' + tandaP(devCpm) + ' vs rata 7 hari ' + rupiah(iklan7.cpm) + ')' : ''));
  bMkt.push('Kunjungan IG ' + angka(iklanH.igVisit) + (iklanH.cpv ? ' (biaya per visit ' + rupiah(iklanH.cpv) + ')' : '') + ', followers IG +' + angka(iklanH.followersIg) + (iklanH.cpf ? ' (biaya per follower ' + rupiah(iklanH.cpf) + ')' : '') + ', fanpage +' + angka(iklanH.followersFanpage));
  bMkt.push(iklanH.chatWa > 0
    ? 'Chat WA dari iklan: ' + angka(iklanH.chatWa)
    : 'Chat WA dari iklan belum terisi di sheet, pakai blok leads WA di bawah sebagai gantinya.');
  if (mpUntukAds) {
    bMkt.push('Omset marketplace ' + dariIso(mpUntukAds.iso) + ': ' + rupiah(mpUntukAds.omset) + ' dari ' + angka(mpUntukAds.trx) + ' resi, ' + angka(mpUntukAds.pcs) + ' pcs' + (mpCocokTanggal ? '' : ' (tanggal terdekat yang tersedia)'));
    if (roasMetaHari) bMkt.push('ROAS Meta harian: ' + roasMetaHari + 'x' + (roasMeta7 ? ', 7 hari ' + roasMeta7 + 'x' : '') + '. Pembandingnya omset total, sedangkan belanja hanya Meta, jadi angka ini bukan ROAS murni.');
    else if (roasMeta7) bMkt.push('ROAS Meta 7 hari: ' + roasMeta7 + 'x (harian tidak bisa dihitung karena tanggal omset dan iklan tidak bertemu).');
  }
  if (hariAkum > 0) {
    bMkt.push(labelAkum + ' (' + hariAkum + ' hari iklan): belanja ' + rupiah(iklanAkum.spendPpn) + ', impresi ' + angka(iklanAkum.impresi) + (iklanAkum.cpm ? ', CPM ' + rupiah(iklanAkum.cpm) : '') + ', IG visit ' + angka(iklanAkum.igVisit) + ', followers IG +' + angka(iklanAkum.followersIg));
    if (!pakaiMtd) bMkt.push('Catatan: belum ada baris iklan untuk ' + tgl.labelBulan + ', akumulasi memakai bulan data terakhir.');
  }
}
blok('MARKETING META ADS', bMkt, (!mkt.ads && !mkt.sales)
  ? 'Data marketing tidak terbaca. Cek nama node pada konstanta NODE_MARKETING di awal kode.'
  : 'Tidak ada baris iklan bertanggal sampai ' + tgl.tglKemarin + '.');

// ---------- PER LINI ----------
const bProduk = produkTampil.map(p => '- ' + p.produk + ': ' + rupiah(p.spendPpn) + ', impresi ' + angka(p.impresi) + (p.ctr ? ', CTR ' + p.ctr + '%' : '') + (p.cpm ? ', CPM ' + rupiah(p.cpm) : '') + (p.igVisit > 0 ? ', IG visit ' + angka(p.igVisit) : ''));
if (efisienCpm.length >= 2) {
  bProduk.push('CPM termurah: ' + efisienCpm[0].produk + ' ' + rupiah(efisienCpm[0].cpm) + ' | termahal: ' + efisienCpm[efisienCpm.length - 1].produk + ' ' + rupiah(efisienCpm[efisienCpm.length - 1].cpm));
}
blok(labelProduk, bProduk, 'Belum ada baris iklan yang bisa dipecah per lini.');

// ---------- LINKTREE ----------
const bLt = [];
if (ltHari) {
  bLt.push(dariIso(ltHari.iso) + ': ' + angka(ltHari.views) + ' view, ' + angka(ltHari.clicks) + ' klik' + (ltCtr !== null ? ' (rasio klik ' + ltCtr + '%)' : '') + (biayaPerView ? ', biaya per view ' + rupiah(biayaPerView) : ''));
  bLt.push('Tujuan klik: Shopee ' + angka(ltHari.shopee) + ', WA ' + angka(ltHari.wa) + ', Maps ' + angka(ltHari.maps) + ', TikTok ' + angka(ltHari.tiktok) + ', Website ' + angka(ltHari.website));
  if (j7Lt.tanggal.length > 1) {
    bLt.push(j7Lt.tanggal.length + ' hari terakhir: ' + angka(lt7.views) + ' view, ' + angka(lt7.clicks) + ' klik' + (lt7Ctr !== null ? ' (rasio ' + lt7Ctr + '%)' : '') + (biayaPerView7 ? ', biaya per view ' + rupiah(biayaPerView7) : ''));
    bLt.push('Tujuan klik 7 hari: Shopee ' + angka(lt7.shopee) + ', WA ' + angka(lt7.wa) + ', Maps ' + angka(lt7.maps) + ', TikTok ' + angka(lt7.tiktok) + ', Website ' + angka(lt7.website));
  }
}
blok('FUNNEL LINKTREE', bLt, 'Sheet linktree harian tidak terbaca atau belum ada isinya.');

// ---------- LEADS WA ----------
const bWa = [];
if (waHari) {
  bWa.push(dariIso(waHari.iso) + ': ' + angka(waHari.totalChatBaru) + ' chat baru (voucher ' + angka(waHari.voucher) + ', iklan ' + angka(waHari.iklan) + ', linktree ' + angka(waHari.linktree) + ', website ' + angka(waHari.website) + ')');
  bWa.push('Closing ' + angka(waHari.closing) + (konversiWa !== null ? ' (konversi ' + konversiWa + '%)' : '') + ', ' + angka(waHari.qty) + ' pcs, ' + rupiah(waHari.omset) + (waHari.sumberClosing ? ', sumber: ' + waHari.sumberClosing : ''));
  if (j7Wa.tanggal.length > 1) {
    bWa.push(j7Wa.tanggal.length + ' hari terakhir: ' + angka(wa7.chat) + ' chat, ' + angka(wa7.closing) + ' closing' + (konversiWa7 !== null ? ' (konversi ' + konversiWa7 + '%)' : '') + ', ' + angka(wa7.qty) + ' pcs, ' + rupiah(wa7.omset) + (aovWa7 ? ', nilai per closing ' + rupiah(aovWa7) : ''));
    bWa.push('Sumber chat 7 hari: voucher ' + angka(wa7.voucher) + ', iklan ' + angka(wa7.iklan) + ', linktree ' + angka(wa7.linktree) + ', website ' + angka(wa7.website));
  }
}
blok('LEADS WHATSAPP', bWa, 'Sheet leads WA tidak terbaca atau belum ada isinya.');

// ---------- REKAP BULANAN ----------
const bBulan = [];
if (blnKini) {
  bBulan.push('Periode ' + blnKini.periode + ', ' + blnKini.hariTerisi + ' hari terisi');
  bBulan.push('Omset ' + rupiah(rk.totalOmset) + ' dari ' + angka(rk.totalResi) + ' resi, ' + angka(rk.totalTerjual) + ' pcs' + (momOmset !== null ? ' | vs ' + blnLalu.periode + ' ' + tandaP(momOmset) : '') + (yoyOmset !== null ? ' | vs ' + thnLalu.periode + ' ' + tandaP(yoyOmset) : ''));
  if (momPcs !== null) bBulan.push('Produk terjual ' + tandaP(momPcs) + ' dibanding ' + blnLalu.periode);
  bBulan.push('Belanja iklan semua channel ' + rupiah(rk.spendAdsPpn) + (momSpend !== null ? ' (' + tandaP(momSpend) + ')' : '') + ', ROAS total ' + des(rk.roasTotal) + 'x' + (deltaRoas !== null ? ' (' + (deltaRoas >= 0 ? '+' : '') + deltaRoas + ' poin)' : ''));
  bBulan.push('Biaya promosi per pcs ' + rupiah(rk.biayaPromosiPerPcs) + (deltaBiayaPcs !== null ? ' (' + tandaP(deltaBiayaPcs) + ')' : '') + ', komisi affiliate ' + rupiah(rk.komisiAffiliate));
  if (blnKini.shopee) bBulan.push('Shopee: ' + rupiah(blnKini.shopee.omset) + ', ' + angka(blnKini.shopee.terjual) + ' pcs, ads ' + rupiah(blnKini.shopee.ads) + ', ROAS ' + des(blnKini.shopee.roas) + 'x, biaya per pcs ' + rupiah(blnKini.shopee.biayaPerPcs));
  if (blnKini.tiktok) bBulan.push('TikTok: ' + rupiah(blnKini.tiktok.omset) + ', ' + angka(blnKini.tiktok.terjual) + ' pcs, ads ' + rupiah(blnKini.tiktok.ads) + ', ROAS ' + des(blnKini.tiktok.roas) + 'x, biaya per pcs ' + rupiah(blnKini.tiktok.biayaPerPcs));
  if (blnKini.meta) bBulan.push('Meta: ' + rupiah(blnKini.meta.total) + ', impresi ' + angka(blnKini.meta.impresi) + ', visit ' + angka(blnKini.meta.visit) + ', followers IG +' + angka(blnKini.meta.followersIg));
  if (blnKini.linktree) bBulan.push('Linktree bulanan: ' + angka(blnKini.linktree.totalView) + ' view, ' + angka(blnKini.linktree.totalClick) + ' klik, biaya per klik ' + rupiah(blnKini.linktree.cpcTotal));
}
blok('REKAP BULANAN MARKETPLACE', bBulan, 'Objek rekap bulanan tidak ada di input marketing.');

// ---------- INVENTORI ----------
const bInv = [];
if (skuList.length > 0) {
  bInv.push('SKU ' + angka(skuList.length) + ' | Lini ' + angka(brandList.length) + ' | Total stok ' + angka(totalStok) + ' pcs | Rata-rata ' + des(totalStok / skuList.length, 1) + ' pcs per SKU');
  bInv.push('SKU kosong ' + angka(skuKosong.length) + ' dari ' + angka(skuList.length) + ' (' + Math.round(skuKosong.length / skuList.length * 100) + '%), SKU terisi ' + angka(skuIsi.length));
  if (!adaVelocity) bInv.push('Kecukupan stok per SKU belum bisa dihitung karena data di ERP Accurate tidak mengembalikan detail item. Semua daftar di bawah memakai stok absolut.');
}
blok('INVENTORI PRODUK', bInv, 'Node stok tidak mengembalikan item. Cek nama node pada NODE_STOK dan filter kategorinya.');

blok(labelRawan, rawanKosong.map(a => '- ' + a.brand + ': ' + a.skuKosong + ' dari ' + a.jumlahSku + ' SKU kosong (' + a.persenKosong + '%), sisa ' + angka(a.stok) + ' pcs'), 'Tidak ada data lini untuk dinilai.');

blok(labelKritis, kritis.map(k => '- ' + k.sku + ': sisa ' + angka(k.stok) + ' ' + k.satuan + (adaVelocity ? ', jual ' + k.rataTerjualHarian + '/hari, habis ' + k.hariKecukupan + ' hari' : ' (lini ' + k.brand + ')')), 'Tidak ada SKU dengan stok di atas nol.');

blok(labelTopLaku, topLaku.map(t => '- ' + t.sku + (adaVelocity ? ': ' + t.rataTerjualHarian + '/hari, sisa ' + angka(t.stok) : ': ' + angka(t.stok) + ' ' + t.satuan + ', lini ' + t.brand)), 'Belum ada SKU yang bisa diurutkan.');

const bIklanStok = iklanVsStok.map(c => '- ' + c.produk + ': belanja ' + rupiah(c.spendPpn) + ', sisa ' + angka(c.stok) + ' pcs, ' + c.skuKosong + ' dari ' + c.jumlahSku + ' SKU kosong (' + c.persenKosong + '%)');
if (iklanTanpaStok.length > 0) bIklanStok.push('Tidak ketemu lini stoknya: ' + iklanTanpaStok.join(', ') + '. Biasanya karena nama campaign berbeda dari nama kategori di Accurate.');
blok(labelIklanStok, bIklanStok, 'Belum ada lini iklan yang bisa dicocokkan ke data stok.');

blok('STOK TERBESAR PER LINI', stokTerbesar.map(a => '- ' + a.brand + ': ' + angka(a.stok) + ' pcs dari ' + a.jumlahSku + ' SKU (' + a.stokPerSku + ' pcs per SKU)'), 'Tidak ada data lini.');

// ============================================================
// OUTPUT
// ============================================================
return [{ json: {
  pesan: L.join('\n'),
  ringkas: {
    tanggalLaporan: tgl.tglKemarin,
    sumberUtama: sUtama ? sUtama.label : null,
    sales: sUtama ? {
      sumber: sUtama.label,
      tanggalDataTerakhir: sUtama.tglTerakhir,
      tertinggalHari: sUtama.tertinggal,
      dataTerkini: sUtama.tertinggal === 0,
      omsetTerakhir: sUtama.omset,
      transaksiTerakhir: sUtama.trx,
      pcsTerakhir: sUtama.pcs,
      aov: sUtama.aov,
      bulan: sUtama.labelBulan,
      bulanBerjalan: sUtama.bulanBerjalan,
      akumulasi: sUtama.akum,
      pcsBulan: sUtama.pcsBulan,
      hariAktif: sUtama.hariAktif,
      hariDalamBulan: sUtama.hariDalamBulan,
      rataHariAktif: sUtama.rata,
      rata7Hari: sUtama.rata7,
      deviasiRataPersen: sUtama.devRata,
      deviasi7HariPersen: sUtama.dev7,
      hariTerbaik: sUtama.terbaik ? { tanggal: dariIso(sUtama.terbaik.iso), omset: sUtama.terbaik.omset } : null,
      hariTerburuk: sUtama.terburuk ? { tanggal: dariIso(sUtama.terburuk.iso), omset: sUtama.terburuk.omset } : null,
      proyeksi: sUtama.proyeksi
    } : null,
    salesPembanding: sKedua ? {
      sumber: sKedua.label, tanggalDataTerakhir: sKedua.tglTerakhir,
      omsetTerakhir: sKedua.omset, bulan: sKedua.labelBulan, akumulasi: sKedua.akum
    } : null,
    marketing: {
      tersedia: adsAda,
      sumberTerbaca: { sales: !!blnKini, ads: !!mkt.ads, barisIklan: rowsIklan.length, barisLinktree: rowsLinktree.length, barisLeads: rowsLeads.length },
      tanggalData: isoAds,
      tertinggalHari: adsTertinggal,
      harian: adsAda ? {
        campaign: iklanHari.length, spend: Math.round(iklanH.spend), ppn: Math.round(iklanH.ppn),
        spendPpn: Math.round(iklanH.spendPpn), impresi: iklanH.impresi, reach: iklanH.reach,
        klik: iklanH.klik, igVisit: iklanH.igVisit, chatWa: iklanH.chatWa,
        followersIg: iklanH.followersIg, followersFanpage: iklanH.followersFanpage,
        ctr: iklanH.ctr, cpc: iklanH.cpc, cpm: iklanH.cpm, cpv: iklanH.cpv, cpf: iklanH.cpf,
        frekuensi: iklanH.frekuensi, roasMeta: roasMetaHari
      } : null,
      rata7Hari: j7Ads.tanggal.length > 0 ? {
        hari: j7Ads.tanggal.length, spendPpnPerHari: Math.round(spend7Rata),
        ctr: iklan7.ctr, cpm: iklan7.cpm, cpv: iklan7.cpv, roasMeta: roasMeta7,
        deviasiSpendPersen: devSpend, deviasiCpmPersen: devCpm, deviasiCtrPoin: devCtr
      } : null,
      akumulasi: {
        label: labelAkum, bulanBerjalan: pakaiMtd, hariIklan: hariAkum,
        spendPpn: Math.round(iklanAkum.spendPpn), impresi: iklanAkum.impresi, reach: iklanAkum.reach,
        klik: iklanAkum.klik, igVisit: iklanAkum.igVisit, followersIg: iklanAkum.followersIg,
        ctr: iklanAkum.ctr, cpm: iklanAkum.cpm, cpv: iklanAkum.cpv
      },
      perLini: { basis: pakaiProdukHari ? 'harian' : '7hari', data: produkTampil },
      marketplaceHari: mpUntukAds ? {
        tanggal: dariIso(mpUntukAds.iso), tanggalSamaDenganIklan: mpCocokTanggal,
        omset: mpUntukAds.omset, resi: mpUntukAds.trx, terjual: mpUntukAds.pcs,
        shopee: mpUntukAds.shopee, tiktok: mpUntukAds.tiktok, lazada: mpUntukAds.lazada, lainnya: mpUntukAds.lainnya
      } : null,
      linktree: ltHari ? {
        tanggal: dariIso(ltHari.iso), views: num(ltHari.views), clicks: num(ltHari.clicks), ctr: ltCtr,
        shopee: num(ltHari.shopee), wa: num(ltHari.wa), maps: num(ltHari.maps),
        tiktok: num(ltHari.tiktok), website: num(ltHari.website), biayaPerView: biayaPerView,
        tujuh: Object.assign({}, lt7, { hari: j7Lt.tanggal.length, ctr: lt7Ctr, biayaPerView: biayaPerView7 })
      } : null,
      leadsWa: waHari ? {
        tanggal: dariIso(waHari.iso), chatBaru: num(waHari.totalChatBaru), voucher: num(waHari.voucher),
        linktree: num(waHari.linktree), website: num(waHari.website), iklan: num(waHari.iklan),
        closing: num(waHari.closing), qty: num(waHari.qty), omset: num(waHari.omset),
        konversi: konversiWa, sumberClosing: waHari.sumberClosing || null,
        tujuh: Object.assign({}, wa7, { hari: j7Wa.tanggal.length, konversi: konversiWa7, aov: aovWa7 })
      } : null,
      bulanan: blnKini ? {
        periode: blnKini.periode, hariTerisi: blnKini.hariTerisi,
        omset: num(rk.totalOmset), resi: num(rk.totalResi), terjual: num(rk.totalTerjual),
        spendAdsPpn: num(rk.spendAdsPpn), metaAds: num(rk.metaAds), komisiAffiliate: num(rk.komisiAffiliate),
        biayaPromosiPerPcs: Math.round(num(rk.biayaPromosiPerPcs)), roasTotal: des(rk.roasTotal),
        shopee: blnKini.shopee || null, tiktok: blnKini.tiktok || null, meta: blnKini.meta || null,
        linktree: blnKini.linktree || null,
        momOmsetPersen: momOmset === null ? null : des(momOmset, 1),
        yoyOmsetPersen: yoyOmset === null ? null : des(yoyOmset, 1),
        momSpendPersen: momSpend === null ? null : des(momSpend, 1),
        momPcsPersen: momPcs === null ? null : des(momPcs, 1),
        deltaRoas: deltaRoas, periodeLalu: blnLalu ? blnLalu.periode : null,
        periodeTahunLalu: thnLalu ? thnLalu.periode : null
      } : null
    },
    inventori: {
      totalSku: skuList.length,
      totalLini: brandList.length,
      totalStok: des(totalStok),
      skuKosong: skuKosong.length,
      skuTerisi: skuIsi.length,
      adaDataVelocity: adaVelocity,
      basisDaftar: adaVelocity ? 'velocity' : 'stok absolut',
      liniRawan: { label: labelRawan, data: rawanKosong },
      skuKritis: { label: labelKritis, data: kritis },
      topSku: { label: labelTopLaku, data: topLaku },
      iklanVsStok: { label: labelIklanStok, data: iklanVsStok, tanpaPadanan: iklanTanpaStok },
      stokTerbesarPerLini: stokTerbesar
    }
  }
} }];
