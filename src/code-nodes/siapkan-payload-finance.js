// Node: Siapkan Payload AI
// dataQuality sengaja ditaruh paling depan supaya model membacanya lebih dulu.
const m = $input.first().json;

const dn = m.diagnostikNeraca || {};

return [{
  json: {
    payload: JSON.stringify({
      dataQuality: m.dataQuality,
      periode: m.periode,
      penjualanBulanBerjalan: m.penjualanMTD,
      bulanan: m.bulanan,
      tahunan: m.tahunan,
      rataRataBulanan: m.rataRataBulanan,
      posisi: m.posisi,
      diagnostikNeraca: {
        seimbang: dn.seimbang,
        selisihIdentitas: dn.selisihIdentitas,
        dugaanPenyebab: dn.dugaanPenyebab,
        rekonsiliasiMappingVsLeaf: dn.rekonsiliasiMappingVsLeaf,
        jumlahAkunTidakDikenal: dn.jumlahAkunTidakDikenal,
        totalAkunTidakDikenal: dn.totalAkunTidakDikenal,
        akunTidakDikenal: (dn.akunTidakDikenal || []).slice(0, 8),
        akunPenyusutan: dn.akunPenyusutan,
        jumlahAkunTerambil: dn.jumlahAkunTerambil,
      },
      diagnostikBaseline: {
        modeEksekusi: (m.diagnostik || {}).modeEksekusi,
        sumberBaseline: (m.diagnostik || {}).sumberBaseline,
        tanggalBaseline: (m.bulanan || {}).tanggalBaseline,
        baselineDicari: (m.diagnostik || {}).baselineDicari,
        peringatanStaticData: (m.diagnostik || {}).peringatanStaticData,
      },
    }),
  },
}];
