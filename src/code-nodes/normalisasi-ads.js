// ============================================================
// CODE NODE 2 — "Normalisasi Ads"
// Mode: Run Once for All Items
// Input : Google Sheets (sheet META ADS / harian per campaign)
// Output: 1 item { _source:'ads', iklan:[...], linktreeHarian:[...], leadsWa:[...] }
// ============================================================

const rows = $input.all().map(i => i.json);

const BLN = {
  jan:1, feb:2, mar:3, apr:4, mei:5, may:5, jun:6, jul:7,
  agu:8, aug:8, sep:9, okt:10, oct:10, nov:11, des:12, dec:12,
};

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
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // 1.460 -> 1460
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return persen ? n / 100 : n;
}

// Sheet kadang mengirim "6.502" (pemisah ribuan ID) sebagai angka 6.502.
// Metrik volume tidak mungkin pecahan, jadi bulatkan balik ke ribuan.
function volume(v) {
  const n = num(v);
  if (n !== 0 && !Number.isInteger(n) && Math.abs(n) < 1000) {
    return Math.round(n * 1000);
  }
  return Math.round(n);
}

function isKosong(v) { return v === '' || v === null || v === undefined; }

function parseTgl(v, defaultYear) {
  if (isKosong(v)) return null;
  if (typeof v === 'number') return null;
  const s = String(v).trim();
  let m;
  // 13/06/2026
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  // 2026-07-01
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  // 1-Jul / 27 Juli / 01-Jul-2026
  if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})\.?(?:[-\s](\d{2,4}))?$/))) {
    const b = BLN[m[2].slice(0,3).toLowerCase()];
    if (!b) return null;
    let th = m[3] ? parseInt(m[3],10) : defaultYear;
    if (th < 100) th += 2000;
    return `${th}-${String(b).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  }
  return null;
}

// tanggal di kolom Linktree/leads berformat US: 7/1/2026 = 1 Juli 2026
function parseTglUS(v) {
  if (isKosong(v)) return null;
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
}

// "Ahsan | 24 Juli | Instagram" -> produk "Ahsan", objective "Instagram"
function pecahCampaign(nama) {
  const raw = String(nama || '').trim();
  const bagian = raw.split('|').map(s => s.trim()).filter(Boolean);
  let produk = bagian[0] || raw;
  produk = produk
    .replace(/\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?/g, '')
    .replace(/\b\d{1,2}\s*(jan|feb|mar|apr|mei|jun|juni|jul|juli|agu|agust|sep|okt|nov|des)\w*/ig, '')
    .replace(/\b(jan|feb|mar|apr|mei|jun|juni|jul|juli|agu|agust|sep|okt|nov|des)\w*\b/ig, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!produk) produk = bagian[0] || raw;
  // samakan penulisan: PAYDAY / PayDay -> Payday, "Ahsan 2" -> Ahsan
  produk = produk.replace(/\s+\d+$/, '').trim();
  produk = produk.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const objective = bagian.length > 2 ? bagian[bagian.length - 1] : '';
  return { produk, objective, campaign: raw };
}

const TAHUN = 2026;
const iklan = [];
const linktreeHarian = [];
const leadsWa = [];
const linktreeRingkasan = {};   // ringkasan bulan pertama (blok atas)

let skema = 'A';                // A = Followers, B = CTR/CPC
let tglAktif = null;
let tglLtAktif = null;
let tglWaAktif = null;

for (const r of rows) {
  if (!r || typeof r !== 'object') continue;

  // --- baris header ulang di tengah sheet -> ganti skema ---
  if (String(r['Nama Campaign']).trim() === 'Nama Campaign' ||
      String(r['Tanggal']).trim() === 'Tanggal') {
    skema = 'B';
    tglAktif = null;
    continue;
  }

  // ============ 1. tabel iklan harian per campaign ============
  const t = parseTgl(r['Tanggal'], TAHUN);
  if (t) tglAktif = t;                       // forward-fill tanggal
  const namaCamp = String(r['Nama Campaign'] || '').trim();

  if (namaCamp && tglAktif) {
    const { produk, objective, campaign } = pecahCampaign(namaCamp);
    const spend = num(r['Amount Spend']);
    const ppn = num(r['col_11']) || +(spend * 0.11).toFixed(2);
    const impression = volume(r['Impression']);
    const reach = volume(r['Reach']);
    const visit = volume(r['Instagram Visit']);

    iklan.push({
      tanggal: tglAktif,
      campaign,
      produk,
      objective,
      spend,
      ppn,
      spendPpn: +(spend + ppn).toFixed(2),
      impression,
      reach,
      igVisit: visit,
      chatWa: skema === 'A' ? num(r['Chat WA']) : 0,
      followersFanpage: skema === 'A' ? num(r['Followers FanPage']) : 0,
      followersIg: skema === 'A' ? num(r['Followers IG']) : num(r['Chat WA']),
      ctr: skema === 'B' ? num(r['Followers FanPage']) : (impression ? visit / impression : 0),
      cpc: skema === 'B' ? num(r['Followers IG']) : (visit ? spend / visit : 0),
      cpm: impression ? (spend / impression) * 1000 : 0,
      frekuensi: reach ? impression / reach : 0,
      skema,
    });
  }

  // ============ 2. tabel Linktree ============
  if (skema === 'A' && typeof r['Linktree'] === 'string' && r['Linktree'].trim()
      && !isKosong(r['col_16'])) {
    const label = r['Linktree'].trim();
    if (label !== 'Most clicked content') linktreeRingkasan[label] = num(r['col_16']);
  }
  if (skema === 'B') {
    const tlt = parseTglUS(r['Linktree']);
    if (tlt) tglLtAktif = tlt;
    if (tglLtAktif && !isKosong(r['1-30 Juni 2026'])) {
      linktreeHarian.push({
        tanggal: tglLtAktif,
        views: num(r['1-30 Juni 2026']),
        clicks: num(r['col_15']),
        shopee: num(r['col_16']),
        wa: num(r['col_17']),
        maps: num(r['col_18']),
        tiktok: num(r['col_19']),
        website: num(r['col_20']),
      });
      tglLtAktif = null;
    }

    // ============ 3. tabel leads WA / closing ============
    const twa = parseTglUS(r['col_22']);
    if (twa) tglWaAktif = twa;
    if (tglWaAktif && !isKosong(r['col_27'])) {
      leadsWa.push({
        tanggal: tglWaAktif,
        voucher: num(r['col_23']),
        linktree: num(r['col_24']),
        website: num(r['col_25']),
        iklan: num(r['col_26']),
        totalChatBaru: num(r['col_27']),
        closing: num(r['col_28']),
        qty: num(r['col_29']),
        omset: num(r['col_30']),
        sumberClosing: isKosong(r['col_31']) || r['col_31'] === '-' ? null : String(r['col_31']).trim(),
      });
      tglWaAktif = null;
    }
  }
}

return [{
  json: {
    _source: 'ads',
    jumlahBarisIklan: iklan.length,
    iklan,
    linktreeHarian,
    leadsWa,
    linktreeRingkasan,
  },
}];
