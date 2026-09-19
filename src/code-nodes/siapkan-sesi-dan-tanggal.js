const src = $input.first().json;
const d = src.d || src;
const host = d.host || src.host || '';
const session = d.session || src.session || '';
if (!host) { throw new Error('Host Accurate tidak ditemukan pada respons open-db.do'); }

const zona = 'Asia/Jakarta';
const kemarin = $now.setZone(zona).minus({ days: 1 });
const awalBulan = kemarin.startOf('month');
const awalVelocity = kemarin.minus({ days: 29 });

// Accurate butuh dd/MM/yyyy, Google Sheets biasanya yyyy-MM-dd.
// Keduanya disediakan supaya tidak ada node yang menebak format.
const fmt = (x) => x.toFormat('dd/MM/yyyy');
const iso = (x) => x.toFormat('yyyy-MM-dd');

return [{ json: {
  host: String(host).replace(/\/$/, ''),
  session: session,
  tglKemarin: fmt(kemarin),
  tglAwalBulan: fmt(awalBulan),
  tglAwalVelocity: fmt(awalVelocity),
  isoKemarin: iso(kemarin),
  isoAwalBulan: iso(awalBulan),
  isoAwalVelocity: iso(awalVelocity),
  hariBerjalan: kemarin.day,
  hariDalamBulan: kemarin.daysInMonth,
  labelTanggal: kemarin.setLocale('id').toFormat('cccc, dd LLLL yyyy'),
  labelBulan: kemarin.setLocale('id').toFormat('LLLL yyyy')
} }];
