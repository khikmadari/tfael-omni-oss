// TFAEL-OMNI — SITREP · data geografis terbundel (tanpa permintaan jaringan)
//
// indonesia-provinsi.json  38 provinsi, dilebur dari 514 kab/kota geoBoundaries gbOpen IDN ADM2
//                          (sumber: BPS, WFP, OCHA ROAP — CC BY 3.0 IGO). Ketelitian garis mengikuti
//                          ukuran provinsi: ±200 m untuk DKI Jakarta/DIY/Bali, ±2 km untuk Maluku/Papua,
//                          supaya tiap provinsi tetap halus saat diperbesar pas ke layar.
// konteks-daratan.json     daratan negara tetangga, Natural Earth 1:50m (domain publik).
// kabkota.json             [nama, kode provinsi, bujur, lintang] titik label tiap kab/kota.

import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import provinsiJson from './geo/indonesia-provinsi.json';
import kabkotaJson from './geo/kabkota.json';
import konteksJson from './geo/konteks-daratan.json';
import { buildGazetteer, type KabRow, type ProvCode } from './geo-names.ts';
import { makeProvinceLocator } from './peringatan.ts';

export interface ProvProps {
  code: ProvCode;
  name: string;
  /** Pusat visual pulau/daratan yang memuat ibu kota provinsi. */
  anchor: [number, number];
}

export const PROVINSI = provinsiJson as unknown as FeatureCollection<MultiPolygon, ProvProps>;
export const KONTEKS = konteksJson as unknown as Feature<MultiPolygon>;

export const PROV_ANCHORS: Record<ProvCode, [number, number]> = Object.fromEntries(
  PROVINSI.features.map(f => [f.properties.code, f.properties.anchor]),
);

export const GAZETTEER = buildGazetteer(kabkotaJson as unknown as KabRow[]);

/** Provinsi yang memuat satu titik (bujur, lintang); null untuk titik di laut atau di luar Indonesia. */
export const PROVINCE_AT = makeProvinceLocator(PROVINSI.features);
