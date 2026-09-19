// Endpoint item/list.do tidak mengembalikan field itemCategory (parameter fields diabaikan),
// jadi kategori dikenali dari nama produk.
// Dua level dikeluarkan:
//   brandItem    -> selalu level lini/brand, dipakai untuk agregasi laporan (konsisten)
//   kategoriItem -> kategori penuh kalau namanya cocok, kalau tidak jatuh ke brand

const KATEGORI_DIIZINKAN = [
  'Abqori','Adnan Kurma','Adnan Puzzle','Ahsan Anak','Ahsan Bulat','Ahsan JUMBO',
  'Ahsan KIDS','Ahsan REG','Ahsan Remaja','Alfan REG','Alfan Remaja','Althaff Jumbo',
  'Althaff Reguler','Arkan','Asyraf','Ayyas','Ghazwan Panjang','Jubah Reguler',
  'JUMBO Adnan Kurma','JUMBO Ghazwan Panjang','JUMBO Ghazwan Pendek','Jumbo QAID',
  'JUMBO Qassam','JUMBO Qotadah','JUMBO Syamil','Kemko Farouq','Kurta Bassam',
  'Kurta Haneef','Qotadah','Shabrina Nahla','Slimfit Arsalan','Slimfit Ghaisan',
  'Slimfit Qashwa','Slimfit Qayyim','Syamil REG'
];

// Kata JUMBO, Slimfit, Kurta, Kemko hanya varian, bukan penentu lini.
// SHABRINA dan NAHLA menunjuk lini yang sama, jadi dipetakan ke satu label.
const BRAND = ['ABQORI','ADNAN','AHSAN','ALFAN','ALTHAFF','ARKAN','ARSALAN','ASYRAF',
  'AYYAS','BASSAM','FAROUQ','GHAISAN','GHAZWAN','HANEEF','JUBAH','NAHLA','QAID',
  'QASHWA','QASSAM','QAYYIM','QOTADAH','SHABRINA','SYAMIL'];
const setBrand = new Set(BRAND);
const ALIAS = { NAHLA: 'SHABRINA', SHABRINA: 'SHABRINA' };

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const rapi = (t) => t.charAt(0) + t.slice(1).toLowerCase();
// Kategori terpanjang dicek duluan supaya 'JUMBO Ghazwan Panjang' menang atas 'Ghazwan Panjang'
const kategoriUrut = [...KATEGORI_DIIZINKAN].sort((a, b) => b.length - a.length);

function cariKategori(teks) {
  for (const k of kategoriUrut) if (teks.startsWith(norm(k))) return k;
  return null;
}
function cariBrand(teks) {
  const token = teks.replace(/[(),\/]/g, ' ').split(/[\s-]+/).filter(Boolean);
  for (const t of token) if (setBrand.has(t)) return ALIAS[t] || t;
  return null;
}

// Bongkar pembungkus Accurate { s: true, d: [...] }
const baris = [];
for (const item of $input.all()) {
  const b = item.json;
  if (Array.isArray(b?.d)) baris.push(...b.d);
  else if (b) baris.push(b);
}

const lolos = [];
const tertolak = new Map();

for (const row of baris) {
  const teks = norm(row.name || row.no);
  const kategori = cariKategori(teks);
  const brand = cariBrand(teks);

  if (kategori || brand) {
    const labelBrand = brand ? rapi(brand) : kategori;
    lolos.push({ json: { ...row, brandItem: labelBrand, kategoriItem: kategori || labelBrand } });
  } else {
    const key = teks.split(' ').slice(0, 2).join(' ') || '(tanpa nama)';
    tertolak.set(key, (tertolak.get(key) || 0) + 1);
  }
}

console.log('Baris masuk:', baris.length, '| lolos:', lolos.length, '| tertolak:', baris.length - lolos.length);
console.log('Contoh yang dibuang:', [...tertolak.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));

return lolos;
