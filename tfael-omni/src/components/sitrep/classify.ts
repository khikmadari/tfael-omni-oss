// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · klasifikasi jenis laporan dari teks berita
//
// Pencocokan per KATA utuh ("demo" tidak cocok dengan "demokrasi", "api" tidak
// cocok dengan "napi"). Judul diperiksa dulu; ringkasan hanya untuk kata kunci
// kuat (bertanda "!"). Berita luar negeri dan berita non-kejadian (simulasi,
// antisipasi, anggaran …) tidak dihitung sebagai insiden.
// ═══════════════════════════════════════════════════════════════════════

import { tokenize } from './geo-names.ts';

export type Category = 'bencana' | 'kebakaran' | 'kecelakaan' | 'keamanan' | 'unras' | 'lain';

export const INCIDENT_CATEGORIES: Category[] = ['bencana', 'kebakaran', 'kecelakaan', 'keamanan', 'unras'];

export const CATEGORY_LABEL: Record<Category, string> = {
  bencana: 'Bencana alam',
  kebakaran: 'Kebakaran',
  kecelakaan: 'Kecelakaan',
  keamanan: 'Kriminal & keamanan',
  unras: 'Unjuk rasa & kerusuhan',
  lain: 'Berita lain',
};

export interface Classified {
  cat: Category;
  /** Jenis spesifik: "Banjir", "Erupsi", "Narkoba" … (kosong untuk berita lain). */
  label: string;
  via: 'judul' | 'ringkasan' | null;
  /** Kejadian di luar negeri (tidak dihitung insiden nasional). */
  foreign: boolean;
}

interface Rule {
  cat: Category;
  label: string;
  /** Awalan "!" = kata kunci kuat, boleh dicocokkan dari ringkasan. */
  phrases: string[];
  notAfter?: Record<string, string[]>;
}

const RULES: Rule[] = [
  // ── Bencana alam ──
  { cat: 'bencana', label: 'Banjir', phrases: ['!banjir bandang', '!banjir rob', '!banjir', 'kebanjiran', 'tanggul jebol'] },
  { cat: 'bencana', label: 'Longsor', phrases: ['!tanah longsor', '!longsor'] },
  { cat: 'bencana', label: 'Erupsi', phrases: ['!erupsi', 'meletus', 'awan panas', 'guguran lava', 'lahar dingin'] },
  { cat: 'bencana', label: 'Tsunami', phrases: ['!tsunami'] },
  { cat: 'bencana', label: 'Gempa', phrases: ['!gempa bumi', '!gempa'] },
  { cat: 'bencana', label: 'Cuaca ekstrem', phrases: ['!puting beliung', '!cuaca ekstrem', 'angin kencang', 'angin puyuh', 'gelombang tinggi', 'hujan es', 'badai'], notAfter: { badai: ['phk', 'cedera', 'kritik'] } },
  { cat: 'bencana', label: 'Kekeringan', phrases: ['kekeringan', 'krisis air bersih'] },
  { cat: 'bencana', label: 'Tanah bergerak', phrases: ['tanah bergerak', 'pergerakan tanah', 'tanah ambles', 'likuefaksi', 'abrasi'] },
  // ── Kebakaran ──
  { cat: 'kebakaran', label: 'Karhutla', phrases: ['!karhutla', '!kebakaran hutan', '!kebakaran lahan'] },
  { cat: 'kebakaran', label: 'Kebakaran', phrases: ['!kebakaran', 'terbakar', 'dilalap api', 'si jago merah'], notAfter: { terbakar: ['emosi', 'semangat', 'cemburu', 'amarah'] } },
  // ── Kecelakaan ──
  { cat: 'kecelakaan', label: 'Kapal tenggelam', phrases: ['kapal tenggelam', 'kapal karam', 'kapal terbalik', 'perahu terbalik', 'perahu tenggelam'] },
  { cat: 'kecelakaan', label: 'Kecelakaan', phrases: ['!kecelakaan', '!lakalantas', '!laka lantas', '!tabrakan', 'tabrak lari', 'menabrak', 'ditabrak', 'tertabrak', 'terlindas', 'terguling', 'rem blong', 'masuk jurang', 'kereta anjlok', 'pesawat jatuh', 'helikopter jatuh', 'tergelincir'] },
  { cat: 'kecelakaan', label: 'Tenggelam', phrases: ['tenggelam', 'hanyut', 'terseret arus'] },
  { cat: 'kecelakaan', label: 'Ledakan', phrases: ['ledakan', 'meledak'], notAfter: { ledakan: ['penduduk', 'kasus', 'covid', 'pengangguran', 'wisatawan', 'penumpang', 'jumlah'] } },
  // "ambruk"/"roboh"/"jatuh" sendirian terlalu sering kiasan (IHSG ambruk, harga jatuh): hanya bersama bendanya
  { cat: 'kecelakaan', label: 'Bangunan runtuh', phrases: ['jembatan ambruk', 'jembatan runtuh', 'jembatan putus', 'atap ambruk', 'bangunan ambruk', 'bangunan runtuh', 'gedung ambruk', 'gedung runtuh', 'tembok roboh', 'tembok ambruk', 'plafon ambruk', 'rumah ambruk', 'rumah roboh', 'musala ambruk', 'masjid ambruk', 'sekolah ambruk', 'kelas ambruk', 'panggung ambruk', 'panggung roboh', 'tribun ambruk', 'tribun roboh', 'turap ambruk', 'talud ambruk', 'tiang roboh', 'menara roboh', 'baliho roboh', 'reklame roboh', 'pohon tumbang', 'tertimpa pohon'] },
  { cat: 'kecelakaan', label: 'Kecelakaan kerja', phrases: ['!kecelakaan kerja', 'crane jatuh', 'crane ambruk', 'crane roboh', 'crane tumbang', 'tertimpa crane', 'tertimpa alat berat', 'lift jatuh', 'jatuh dari lantai', 'jatuh dari ketinggian', 'tersengat listrik', 'tersetrum'] },
  // ── Kriminal & keamanan ──
  { cat: 'keamanan', label: 'Terorisme', phrases: ['!teroris', '!terorisme', 'densus 88', 'bom bunuh diri', 'teror bom', 'bom rakitan', 'bom molotov', 'ledakan bom'] },
  { cat: 'keamanan', label: 'Penembakan', phrases: ['!penembakan', '!kontak tembak', '!baku tembak', '!kkb', 'ditembak', 'menembak', 'tertembak', 'opm'] },
  { cat: 'keamanan', label: 'Pembunuhan', phrases: ['!pembunuhan', 'dibunuh', 'membunuh', 'mutilasi'] },
  { cat: 'keamanan', label: 'Penculikan', phrases: ['penculikan', 'diculik', 'penyanderaan', 'disandera'] },
  { cat: 'keamanan', label: 'Perampokan', phrases: ['!perampokan', 'dirampok', 'merampok', 'begal', 'pembegalan', 'dibegal', 'curanmor', 'pencurian', 'jambret', 'penjambretan', 'dijambret'] },
  { cat: 'keamanan', label: 'Penganiayaan', phrases: ['penganiayaan', 'dianiaya', 'menganiaya', 'pengeroyokan', 'dikeroyok', 'penusukan', 'ditusuk', 'pembacokan', 'dibacok', 'penikaman', 'ditikam', 'kdrt'] },
  { cat: 'keamanan', label: 'Kekerasan seksual', phrases: ['pemerkosaan', 'diperkosa', 'kekerasan seksual', 'pencabulan', 'dicabuli', 'pelecehan seksual'] },
  { cat: 'keamanan', label: 'Narkoba', phrases: ['!narkoba', '!narkotika', 'sabu', 'ganja', 'ekstasi', 'pil koplo'], notAfter: { sabu: ['raijua'] } },
  { cat: 'keamanan', label: 'Penyelundupan', phrases: ['!penyelundupan', 'menyelundupkan', 'diselundupkan', 'selundupkan', 'selundupan'] },
  { cat: 'keamanan', label: 'Perdagangan orang', phrases: ['perdagangan orang', 'tppo'] },
  // ── Unjuk rasa & kerusuhan ──
  { cat: 'unras', label: 'Unjuk rasa', phrases: ['!unjuk rasa', '!demonstrasi', 'demonstran', 'demo', 'aksi massa', 'aksi demo', 'aksi damai', 'long march', 'geruduk', 'menggeruduk', 'digeruduk'], notAfter: { demo: ['masak', 'memasak', 'day', 'slot', 'produk', 'aplikasi', 'game', 'gim', 'makeup', 'kosmetik'] } },
  { cat: 'unras', label: 'Mogok', phrases: ['mogok kerja', 'mogok massal', 'mogok nasional', 'aksi mogok', 'mogok makan'] },
  { cat: 'unras', label: 'Kerusuhan', phrases: ['!kerusuhan', 'rusuh', 'ricuh', 'kericuhan', 'amuk massa', 'anarkis', 'penjarahan', 'dijarah'] },
  { cat: 'unras', label: 'Bentrok', phrases: ['!bentrokan', '!tawuran', 'bentrok'] },
  { cat: 'unras', label: 'Blokade jalan', phrases: ['blokade jalan', 'blokir jalan', 'memblokade', 'palang jalan'] },
];

/** Berita tentang rencana/kebijakan, bukan kejadian. */
const NON_EVENT = new Set([
  'simulasi', 'latihan', 'antisipasi', 'mengantisipasi', 'mitigasi', 'cegah', 'mencegah', 'pencegahan',
  'sosialisasi', 'edukasi', 'anggaran', 'ruu', 'wacana', 'peringati', 'memperingati', 'seminar', 'webinar',
  'film', 'sinetron', 'novel',
]);

const FOREIGN_1 = new Set([
  'jepang', 'china', 'tiongkok', 'cina', 'taiwan', 'korea', 'india', 'pakistan', 'bangladesh', 'nepal',
  'afghanistan', 'iran', 'irak', 'israel', 'palestina', 'gaza', 'lebanon', 'suriah', 'yaman', 'saudi', 'qatar',
  'dubai', 'turki', 'turkiye', 'rusia', 'ukraina', 'inggris', 'prancis', 'jerman', 'italia', 'spanyol',
  'portugal', 'belanda', 'belgia', 'swiss', 'yunani', 'polandia', 'amerika', 'kanada', 'meksiko', 'brasil',
  'argentina', 'australia', 'malaysia', 'singapura', 'thailand', 'filipina', 'vietnam', 'myanmar', 'kamboja',
  'laos', 'brunei', 'mesir', 'sudan', 'nigeria', 'kongo', 'ethiopia', 'kenya', 'somalia', 'libya', 'maroko',
  'eropa', 'afrika',
]);
const FOREIGN_2 = new Set(['hong kong', 'sri lanka', 'timor leste', 'papua nugini', 'selandia baru', 'afrika selatan', 'arab saudi']);

interface Key { tokens: string[]; rule: Rule; strong: boolean; key: string }

const INDEX: Map<string, Key[]> = (() => {
  const idx = new Map<string, Key[]>();
  for (const rule of RULES) {
    for (const raw of rule.phrases) {
      const strong = raw.startsWith('!');
      const key = strong ? raw.slice(1) : raw;
      const tokens = key.split(' ');
      const arr = idx.get(tokens[0]);
      const k = { tokens, rule, strong, key };
      if (arr) arr.push(k); else idx.set(tokens[0], [k]);
    }
  }
  for (const arr of idx.values()) arr.sort((a, b) => b.tokens.length - a.tokens.length);
  return idx;
})();

function firstHit(tokens: string[], strongOnly: boolean): Rule | null {
  for (let i = 0; i < tokens.length; i++) {
    const list = INDEX.get(tokens[i]);
    if (!list) continue;
    for (const k of list) {
      if (strongOnly && !k.strong) continue;
      if (i + k.tokens.length > tokens.length) continue;
      let ok = true;
      for (let j = 1; j < k.tokens.length; j++) if (tokens[i + j] !== k.tokens[j]) { ok = false; break; }
      if (!ok) continue;
      const next = tokens[i + k.tokens.length] ?? '';
      if (k.rule.notAfter?.[k.key]?.includes(next)) continue;
      return k.rule;
    }
  }
  return null;
}

function isForeign(rawTitle: string, tokens: string[]): boolean {
  if (/(^|[^A-Za-z])AS([^A-Za-z]|$)/.test(rawTitle)) return true;
  for (let i = 0; i < tokens.length; i++) {
    if (FOREIGN_1.has(tokens[i])) return true;
    if (i + 1 < tokens.length && FOREIGN_2.has(`${tokens[i]} ${tokens[i + 1]}`)) return true;
  }
  return false;
}

const NONE: Classified = { cat: 'lain', label: '', via: null, foreign: false };

export function classify(title: string, summary = ''): Classified {
  const t = tokenize(title).filter(x => x !== ',');
  const foreign = isForeign(title, t);
  let rule = firstHit(t, false);
  let via: 'judul' | 'ringkasan' = 'judul';
  if (!rule && summary) {
    rule = firstHit(tokenize(summary).filter(x => x !== ','), true);
    via = 'ringkasan';
  }
  if (!rule) return foreign ? { ...NONE, foreign } : NONE;
  if (foreign || t.some(x => NON_EVENT.has(x))) return { cat: 'lain', label: '', via: null, foreign };
  return { cat: rule.cat, label: rule.label, via, foreign: false };
}
