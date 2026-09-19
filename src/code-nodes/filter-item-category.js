// Endpoint item/list.do tidak mengembalikan field itemCategory (parameter fields diabaikan),
// jadi kategori dikenali dari nama produk.
// Dua level dikeluarkan:
//   brandItem    -> selalu level lini/brand, dipakai untuk agregasi laporan (konsisten)
//   kategoriItem -> kategori penuh kalau namanya cocok, kalau tidak jatuh ke brand

const KATEGORI_DIIZINKAN = [
  'Alfa','Bravo Kurma','Bravo Puzzle','Charlie Anak','Charlie Bulat','Charlie JUMBO',
  'Charlie KIDS','Charlie REG','Charlie Remaja','Delta REG','Delta Remaja','Echo Jumbo',
  'Echo Reguler','Foxtrot','Hotel','India','Mike Panjang','Oscar Reguler',
  'JUMBO Bravo Kurma','JUMBO Mike Panjang','JUMBO Mike Pendek','Jumbo QUEBEC',
  'JUMBO Sierra','JUMBO Uniform','JUMBO Whiskey','Kemko Kilo','Kurta Juliet',
  'Kurta November','Uniform','Victor Papa','Slimfit Golf','Slimfit Lima',
  'Slimfit Romeo','Slimfit Tango','Whiskey REG'
];

// Kata JUMBO, Slimfit, Kurta, Kemko hanya varian, bukan penentu lini.
// VICTOR dan PAPA menunjuk lini yang sama, jadi dipetakan ke satu label.
const BRAND = ['ALFA','BRAVO','CHARLIE','DELTA','ECHO','FOXTROT','GOLF','HOTEL',
  'INDIA','JULIET','KILO','LIMA','MIKE','NOVEMBER','OSCAR','PAPA','QUEBEC',
  'ROMEO','SIERRA','TANGO','UNIFORM','VICTOR','WHISKEY'];
const setBrand = new Set(BRAND);
const ALIAS = { PAPA: 'VICTOR', VICTOR: 'VICTOR' };

const norm = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
const rapi = (t) => t.charAt(0) + t.slice(1).toLowerCase();
// Kategori terpanjang dicek duluan supaya 'JUMBO Mike Panjang' menang atas 'Mike Panjang'
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
