// ============================================================
// CODE NODE 3 — "Marketing Report"
// Mode: Run Once for All Items
// Input : Merge (Append) dari "Normalisasi Sales" + "Normalisasi Ads"
// Output: 1 item { laporan (HTML Telegram), data (JSON terstruktur) }
// ============================================================

const semua = $input.all().map(i => i.json);
const S = semua.find(x => x._source === 'sales') || {};
const A = semua.find(x => x._source === 'ads') || {};

const bb = S.bulanBerjalan || {};       // Juli 2026
const bl = S.bulanSebelumnya || {};     // Juni 2026
const yy = S.tahunLalu || {};           // Juli 2025

// ---------- formatter ----------
const rp = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const rb = n => {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) >= 1e9) return 'Rp' + (v / 1e9).toFixed(2) + ' M';
  if (Math.abs(v) >= 1e6) return 'Rp' + (v / 1e6).toFixed(1) + ' jt';
  if (Math.abs(v) >= 1e3) return 'Rp' + (v / 1e3).toFixed(0) + ' rb';
  return 'Rp' + v;
};
const angka = n => Math.round(Number(n) || 0).toLocaleString('id-ID');
const pct = n => ((Number(n) || 0) * 100).toFixed(2) + '%';
const dec = (n, d = 2) => (Number(n) || 0).toFixed(d);
const bagi = (a, b) => (Number(b) ? Number(a) / Number(b) : 0);

function delta(sekarang, pembanding) {
  const a = Number(sekarang) || 0, b = Number(pembanding) || 0;
  const selisih = a - b;
  const persen = b ? selisih / b : 0;
  const naik = selisih >= 0;
  return { selisih, persen, naik, tanda: naik ? '▲' : '▼', teks: (naik ? '+' : '') + pct(persen) };
}

// ---------- agregasi iklan ----------
const iklan = Array.isArray(A.iklan) ? A.iklan : [];
const bulanTerbaru = iklan.length
  ? iklan.map(x => x.tanggal.slice(0, 7)).sort().pop()
  : null;
const iklanBulanIni = iklan.filter(x => x.tanggal.slice(0, 7) === bulanTerbaru);

function agregat(list) {
  const r = list.reduce((a, x) => {
    a.spend += x.spend; a.ppn += x.ppn;
    a.impression += x.impression; a.reach += x.reach; a.igVisit += x.igVisit;
    a.chatWa += x.chatWa; a.followersIg += x.followersIg;
    a.followersFanpage += x.followersFanpage;
    return a;
  }, { spend: 0, ppn: 0, impression: 0, reach: 0, igVisit: 0, chatWa: 0, followersIg: 0, followersFanpage: 0 });
  r.spendPpn = r.spend + r.ppn;
  r.ctr = bagi(r.igVisit, r.impression);
  r.cpc = bagi(r.spend, r.igVisit);
  r.cpm = bagi(r.spend, r.impression) * 1000;
  r.frekuensi = bagi(r.impression, r.reach);
  r.hari = new Set(list.map(x => x.tanggal)).size;
  return r;
}
const meta = agregat(iklanBulanIni);

// per produk / campaign
const perProduk = {};
for (const x of iklanBulanIni) {
  const k = x.produk || x.campaign;
  if (!perProduk[k]) perProduk[k] = { produk: k, spend: 0, impression: 0, igVisit: 0, hari: new Set() };
  perProduk[k].spend += x.spend;
  perProduk[k].impression += x.impression;
  perProduk[k].igVisit += x.igVisit;
  perProduk[k].hari.add(x.tanggal);
}
const produkList = Object.values(perProduk).map(p => ({
  produk: p.produk,
  spend: p.spend,
  impression: p.impression,
  igVisit: p.igVisit,
  hari: p.hari.size,
  ctr: bagi(p.igVisit, p.impression),
  cpc: bagi(p.spend, p.igVisit),
  cpm: bagi(p.spend, p.impression) * 1000,
  porsiSpend: bagi(p.spend, meta.spend),
})).sort((a, b) => b.spend - a.spend);

const paling = [...produkList].filter(p => p.igVisit > 0).sort((a, b) => a.cpc - b.cpc);
const campaignTerhemat = paling.slice(0, 3);
const campaignTermahal = paling.slice(-3).reverse();

// ---------- linktree & leads WA ----------
const lt = (A.linktreeHarian || []).filter(x => !bulanTerbaru || x.tanggal.slice(0, 7) === bulanTerbaru);
const funnel = lt.reduce((a, x) => {
  a.views += x.views; a.clicks += x.clicks; a.shopee += x.shopee;
  a.wa += x.wa; a.maps += x.maps; a.tiktok += x.tiktok; a.website += x.website;
  return a;
}, { views: 0, clicks: 0, shopee: 0, wa: 0, maps: 0, tiktok: 0, website: 0 });
funnel.ctr = bagi(funnel.clicks, funnel.views);
funnel.biayaPerView = bagi(meta.spendPpn, funnel.views);
funnel.biayaPerClick = bagi(meta.spendPpn, funnel.clicks);

const wa = (A.leadsWa || []).filter(x => !bulanTerbaru || x.tanggal.slice(0, 7) === bulanTerbaru);
const leads = wa.reduce((a, x) => {
  a.voucher += x.voucher; a.linktree += x.linktree; a.website += x.website;
  a.iklan += x.iklan; a.totalChat += x.totalChatBaru;
  a.closing += x.closing; a.qty += x.qty; a.omset += x.omset;
  return a;
}, { voucher: 0, linktree: 0, website: 0, iklan: 0, totalChat: 0, closing: 0, qty: 0, omset: 0 });
leads.konversi = bagi(leads.closing, leads.totalChat);
leads.aov = bagi(leads.omset, leads.closing);
leads.roas = bagi(leads.omset, meta.spendPpn);

// ---------- metrik penjualan ----------
const rk = bb.ringkasan || {}, rkL = bl.ringkasan || {}, rkY = yy.ringkasan || {};
const aov = bagi(rk.totalOmset, rk.totalTerjual);
const aovL = bagi(rkL.totalOmset, rkL.totalTerjual);

const dOmsetMoM = delta(rk.totalOmset, rkL.totalOmset);
const dOmsetYoY = delta(rk.totalOmset, rkY.totalOmset);
const dTerjualMoM = delta(rk.totalTerjual, rkL.totalTerjual);
const dSpendMoM = delta(rk.spendAdsPpn, rkL.spendAdsPpn);
const dRoasMoM = delta(rk.roasTotal, rkL.roasTotal);
const dBiayaMoM = delta(rk.biayaPromosiPerPcs, rkL.biayaPromosiPerPcs);

// omset harian terbaik / terburuk
const harian = (bb.harian || []).filter(d => d.omset > 0);
const urut = [...harian].sort((a, b) => b.omset - a.omset);
const hariTerbaik = urut[0] || null;
const hariTerburuk = urut[urut.length - 1] || null;
const rataHarian = bagi(harian.reduce((a, d) => a + d.omset, 0), harian.length);

// ---------- insight otomatis ----------
const insight = [];
if (dRoasMoM.selisih < 0) {
  insight.push(`ROAS turun ${dec(Math.abs(dRoasMoM.selisih))} poin vs bulan lalu (${dec(rkL.roasTotal)} ke ${dec(rk.roasTotal)}), sementara spend ${dSpendMoM.teks}. Efisiensi iklan melemah.`);
} else {
  insight.push(`ROAS naik ${dec(dRoasMoM.selisih)} poin ke ${dec(rk.roasTotal)}. Belanja iklan makin efisien.`);
}
if (dBiayaMoM.selisih > 0) {
  insight.push(`Biaya promosi per pcs naik ${rp(dBiayaMoM.selisih)} jadi ${rp(rk.biayaPromosiPerPcs)}. Cek campaign dengan CPC tertinggi.`);
}
if ((bb.tiktok || {}).roas > (bb.shopee || {}).roas) {
  insight.push(`TikTok (ROAS ${dec((bb.tiktok || {}).roas)}) unggul dari Shopee (ROAS ${dec((bb.shopee || {}).roas)}). Pertimbangkan geser porsi budget.`);
} else {
  insight.push(`Shopee (ROAS ${dec((bb.shopee || {}).roas)}) masih lebih efisien dari TikTok (ROAS ${dec((bb.tiktok || {}).roas)}).`);
}
if (campaignTerhemat[0]) {
  insight.push(`Campaign paling murah per visit: ${campaignTerhemat[0].produk} (CPC ${rp(campaignTerhemat[0].cpc)}).`);
}
if (campaignTermahal[0] && campaignTermahal[0].cpc > meta.cpc * 2) {
  insight.push(`${campaignTermahal[0].produk} boros: CPC ${rp(campaignTermahal[0].cpc)} atau ${dec(bagi(campaignTermahal[0].cpc, meta.cpc), 1)}x rata-rata akun.`);
}
if (leads.totalChat && leads.konversi < 0.15) {
  insight.push(`Konversi chat WA cuma ${pct(leads.konversi)} dari ${angka(leads.totalChat)} chat. Follow-up CS perlu dibenahi.`);
}

// ---------- susun laporan (HTML Telegram) ----------
const L = [];
L.push(`<b>LAPORAN MARKETING BRANDCO</b>`);
L.push(`Periode: <b>${bb.periode || '-'}</b> (${bb.hariTerisi || 0} hari)`);
L.push('');

L.push(`<b>1. PENJUALAN</b>`);
L.push(`Omset: <b>${rp(rk.totalOmset)}</b>`);
L.push(`  vs ${bl.periode || 'bln lalu'}: ${dOmsetMoM.tanda} ${dOmsetMoM.teks} (${rb(dOmsetMoM.selisih)})`);
L.push(`  vs ${yy.periode || 'thn lalu'}: ${dOmsetYoY.tanda} ${dOmsetYoY.teks} (${rb(dOmsetYoY.selisih)})`);
L.push(`Produk terjual: ${angka(rk.totalTerjual)} pcs (${dTerjualMoM.tanda} ${dTerjualMoM.teks})`);
L.push(`Resi: ${angka(rk.totalResi)} | AOV: ${rp(aov)} (bln lalu ${rp(aovL)})`);
L.push(`Rata-rata omset/hari: ${rp(rataHarian)}`);
if (hariTerbaik) L.push(`Tertinggi: ${hariTerbaik.tanggal} ${rb(hariTerbaik.omset)} | Terendah: ${hariTerburuk.tanggal} ${rb(hariTerburuk.omset)}`);
L.push('');

L.push(`<b>2. EFISIENSI IKLAN (TOTAL)</b>`);
L.push(`Spend ads +ppn: ${rp(rk.spendAdsPpn)} (${dSpendMoM.tanda} ${dSpendMoM.teks})`);
L.push(`ROAS total: <b>${dec(rk.roasTotal)}</b> (bln lalu ${dec(rkL.roasTotal)})`);
L.push(`Biaya promosi/pcs: ${rp(rk.biayaPromosiPerPcs)} (bln lalu ${rp(rkL.biayaPromosiPerPcs)})`);
L.push(`Komisi affiliate: ${rp(rk.komisiAffiliate)} | Koin penjual: ${rp(rk.koinPenjual)}`);
L.push('');

L.push(`<b>3. PER CHANNEL</b>`);
const ch = [
  ['Shopee', bb.shopee || {}, bl.shopee || {}],
  ['TikTok', bb.tiktok || {}, bl.tiktok || {}],
];
for (const [nama, c, cl] of ch) {
  const dr = delta(c.roas, cl.roas);
  L.push(`<b>${nama}</b>: omset ${rb(c.omset)} | ${angka(c.terjual)} pcs`);
  L.push(`  ads ${rb(c.ads)} | ROAS ${dec(c.roas)} (${dr.tanda} ${dec(dr.selisih)}) | ${rp(c.biayaPerPcs)}/pcs`);
}
L.push('');

L.push(`<b>4. META ADS</b>`);
L.push(`Spend +ppn: ${rp(meta.spendPpn)} (${meta.hari} hari aktif)`);
L.push(`Impresi ${angka(meta.impression)} | Reach ${angka(meta.reach)} | Freq ${dec(meta.frekuensi)}`);
L.push(`IG visit ${angka(meta.igVisit)} | CTR ${pct(meta.ctr)} | CPC ${rp(meta.cpc)} | CPM ${rp(meta.cpm)}`);
L.push(`Followers IG baru: ${angka(meta.followersIg)}`);
L.push('');

L.push(`<b>5. TOP CAMPAIGN (by spend)</b>`);
produkList.slice(0, 5).forEach((p, i) => {
  L.push(`${i + 1}. ${p.produk} - ${rb(p.spend)} (${pct(p.porsiSpend)}) | CPC ${rp(p.cpc)} | CTR ${pct(p.ctr)}`);
});
L.push('');

L.push(`<b>6. FUNNEL LINKTREE</b>`);
L.push(`Views ${angka(funnel.views)} -> Clicks ${angka(funnel.clicks)} (CTR ${pct(funnel.ctr)})`);
L.push(`Shopee ${angka(funnel.shopee)} | WA ${angka(funnel.wa)} | Maps ${angka(funnel.maps)} | TikTok ${angka(funnel.tiktok)} | Web ${angka(funnel.website)}`);
L.push(`Biaya/view ${rp(funnel.biayaPerView)} | Biaya/click ${rp(funnel.biayaPerClick)}`);
L.push('');

L.push(`<b>7. LEADS WA</b>`);
L.push(`Chat baru ${angka(leads.totalChat)} (voucher ${angka(leads.voucher)}, linktree ${angka(leads.linktree)}, web ${angka(leads.website)}, iklan ${angka(leads.iklan)})`);
L.push(`Closing ${angka(leads.closing)} | ${angka(leads.qty)} pcs | omset ${rp(leads.omset)}`);
L.push(`Konversi ${pct(leads.konversi)} | AOV ${rp(leads.aov)} | ROAS meta ${dec(leads.roas)}`);
L.push('');

L.push(`<b>8. CATATAN</b>`);
insight.forEach(t => L.push(`- ${t}`));

const laporan = L.join('\n');

return [{
  json: {
    laporan,
    data: {
      periode: bb.periode,
      penjualan: {
        omset: rk.totalOmset, terjual: rk.totalTerjual, resi: rk.totalResi,
        aov, rataHarian, hariTerbaik, hariTerburuk,
        momOmset: dOmsetMoM, yoyOmset: dOmsetYoY, momTerjual: dTerjualMoM,
      },
      iklanTotal: {
        spendPpn: rk.spendAdsPpn, roas: rk.roasTotal,
        biayaPerPcs: rk.biayaPromosiPerPcs,
        komisiAffiliate: rk.komisiAffiliate, koinPenjual: rk.koinPenjual,
        momSpend: dSpendMoM, momRoas: dRoasMoM, momBiaya: dBiayaMoM,
      },
      channel: { shopee: bb.shopee, tiktok: bb.tiktok },
      meta,
      perProduk: produkList,
      campaignTerhemat, campaignTermahal,
      funnelLinktree: funnel,
      leadsWa: leads,
      insight,
    },
  },
}];
