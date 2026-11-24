// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — SITREP · gazetteer nama tempat Indonesia
//
// Mengubah teks berita ("Banjir Aceh Utara", "kebakaran di Tarakan") menjadi lokasi
// tingkat kab/kota atau provinsi. Prinsip: lebih baik "tanpa lokasi" daripada lokasi
// salah — tidak ada koordinat tebakan. Nama yang juga kata umum (Serang, Buru, Pati,
// Karo, Puncak …) hanya diterima bila didahului penanda wilayah.
//
// Modul ini murni (tanpa DOM, tanpa impor JSON) supaya bisa diuji langsung di Node.
// ═══════════════════════════════════════════════════════════════════════

export type ProvCode = string;

/** Baris kabkota.json: [nama ADM2 BPS, kode provinsi, bujur, lintang]. */
export type KabRow = [string, ProvCode, number, number];

export interface Place {
  id: string;
  /** Nama tampil: "Bandung", "Kab. Bandung", "Halmahera Utara". */
  name: string;
  prov: ProvCode;
  lon: number;
  lat: number;
  kind: 'kota' | 'kab';
}

export interface LocMatch {
  prov: ProvCode;
  /** null = hanya diketahui sampai tingkat provinsi. */
  place: Place | null;
  /** Apa yang disebut teks: "Gunung Dukono", "Halmahera Utara", "Jawa Tengah". */
  label: string;
  via: 'judul' | 'ringkasan';
}

// ── 38 provinsi (kode ISO 3166-2:ID tanpa awalan "ID-") ─────────────────
export const PROVINCES: Record<ProvCode, { name: string; keys: string[] }> = {
  AC: { name: 'Aceh', keys: ['aceh', 'nanggroe aceh darussalam'] },
  SU: { name: 'Sumatera Utara', keys: ['sumatera utara', 'sumatra utara', 'sumut'] },
  SB: { name: 'Sumatera Barat', keys: ['sumatera barat', 'sumatra barat', 'sumbar'] },
  RI: { name: 'Riau', keys: ['riau'] },
  JA: { name: 'Jambi', keys: ['jambi'] },
  SS: { name: 'Sumatera Selatan', keys: ['sumatera selatan', 'sumatra selatan', 'sumsel'] },
  BE: { name: 'Bengkulu', keys: ['bengkulu'] },
  LA: { name: 'Lampung', keys: ['lampung'] },
  BB: { name: 'Kepulauan Bangka Belitung', keys: ['kepulauan bangka belitung', 'bangka belitung', 'babel'] },
  KR: { name: 'Kepulauan Riau', keys: ['kepulauan riau', 'kepri'] },
  JK: { name: 'DKI Jakarta', keys: ['dki jakarta', 'jakarta', 'dki', 'daerah khusus jakarta', 'dkj', 'jabodetabek', 'metro jaya', 'kodam jaya', 'balai kota jakarta', 'balai kota dki'] },
  JB: { name: 'Jawa Barat', keys: ['jawa barat', 'jabar'] },
  JT: { name: 'Jawa Tengah', keys: ['jawa tengah', 'jateng'] },
  YO: { name: 'DI Yogyakarta', keys: ['yogyakarta', 'daerah istimewa yogyakarta', 'diy', 'jogja', 'yogya', 'jogjakarta'] },
  JI: { name: 'Jawa Timur', keys: ['jawa timur', 'jatim'] },
  BT: { name: 'Banten', keys: ['banten'] },
  BA: { name: 'Bali', keys: ['bali'] },
  NB: { name: 'Nusa Tenggara Barat', keys: ['nusa tenggara barat', 'ntb'] },
  NT: { name: 'Nusa Tenggara Timur', keys: ['nusa tenggara timur', 'ntt'] },
  KB: { name: 'Kalimantan Barat', keys: ['kalimantan barat', 'kalbar'] },
  KT: { name: 'Kalimantan Tengah', keys: ['kalimantan tengah', 'kalteng'] },
  KS: { name: 'Kalimantan Selatan', keys: ['kalimantan selatan', 'kalsel'] },
  KI: { name: 'Kalimantan Timur', keys: ['kalimantan timur', 'kaltim'] },
  KU: { name: 'Kalimantan Utara', keys: ['kalimantan utara', 'kaltara'] },
  SA: { name: 'Sulawesi Utara', keys: ['sulawesi utara', 'sulut'] },
  ST: { name: 'Sulawesi Tengah', keys: ['sulawesi tengah', 'sulteng'] },
  SN: { name: 'Sulawesi Selatan', keys: ['sulawesi selatan', 'sulsel'] },
  SG: { name: 'Sulawesi Tenggara', keys: ['sulawesi tenggara', 'sultra'] },
  GO: { name: 'Gorontalo', keys: ['gorontalo'] },
  SR: { name: 'Sulawesi Barat', keys: ['sulawesi barat', 'sulbar'] },
  MA: { name: 'Maluku', keys: ['maluku'] },
  MU: { name: 'Maluku Utara', keys: ['maluku utara', 'malut'] },
  PA: { name: 'Papua', keys: ['papua'] },
  PB: { name: 'Papua Barat', keys: ['papua barat'] },
  PD: { name: 'Papua Barat Daya', keys: ['papua barat daya'] },
  PE: { name: 'Papua Pegunungan', keys: ['papua pegunungan'] },
  PS: { name: 'Papua Selatan', keys: ['papua selatan'] },
  PT: { name: 'Papua Tengah', keys: ['papua tengah'] },
};

// ── Nama tampil modern untuk ejaan/nama lama di data BPS 2020 ───────────
const DISPLAY: Record<string, string> = {
  'Banyu Asin': 'Banyuasin',
  'Batang Hari': 'Batanghari',
  'Gunung Kidul': 'Gunungkidul',
  'Karang Asem': 'Karangasem',
  'Kota Banjar Baru': 'Banjarbaru',
  'Kota Baru': 'Kotabaru',
  'Kota Pangkal Pinang': 'Pangkalpinang',
  'Kota Pematang Siantar': 'Pematangsiantar',
  'Kota Sawah Lunto': 'Sawahlunto',
  'Kota Tanjung Balai': 'Tanjungbalai',
  'Kota Tanjung Pinang': 'Tanjungpinang',
  'Labuhan Batu': 'Labuhanbatu',
  'Labuhan Batu Selatan': 'Labuhanbatu Selatan',
  'Labuhan Batu Utara': 'Labuhanbatu Utara',
  'Mahakam Hulu': 'Mahakam Ulu',
  'Maluku Tenggara Barat': 'Kepulauan Tanimbar',
  'Mamuju Utara': 'Pasangkayu',
  'Pangkajene Dan Kepulauan': 'Pangkajene dan Kepulauan',
  'Siau Tagulandang Biaro': 'Kepulauan Sitaro',
  'Toba Samosir': 'Toba',
  'Toli-Toli': 'Tolitoli',
  'Tulangbawang': 'Tulang Bawang',
};

// ── Alias → nama ADM2 ───────────────────────────────────────────────────
//   "~frasa"        ejaan lain / singkatan: yang ditampilkan tetap nama kab/kotanya
//   "frasa"         tempat di dalam kab/kota itu: yang ditampilkan frasanya ("Timika")
//   "frasa=Label"   sama, dengan label khusus ("Bandara Soekarno-Hatta")
const ALIASES: Record<string, string[]> = {
  // Jakarta dan sekitarnya
  'Kota Jakarta Barat': ['~jakbar', 'cengkareng', 'kalideres', 'daan mogot', 'grogol', 'slipi', 'kebon jeruk', 'palmerah'],
  'Kota Jakarta Pusat': ['~jakpus', 'monas', 'istana merdeka', 'istana negara', 'bundaran hi', 'patung kuda', 'tanah abang', 'menteng', 'kemayoran', 'gambir', 'pasar senen', 'senayan', 'gedung dpr', 'kompleks parlemen', 'gelora bung karno', 'cempaka putih', 'sawah besar'],
  'Kota Jakarta Selatan': ['~jaksel', 'kemang', 'tebet', 'pancoran', 'kebayoran', 'cilandak', 'pasar minggu', 'jagakarsa', 'blok m', 'lebak bulus', 'pondok indah', 'mampang', 'stasiun manggarai', 'pintu air manggarai'],
  'Kota Jakarta Timur': ['~jaktim', 'cawang', 'kramat jati', 'cakung', 'jatinegara', 'pulogadung', 'pulo gadung', 'duren sawit', 'ciracas', 'pasar rebo', 'rawamangun', 'halim perdanakusuma=Bandara Halim Perdanakusuma', 'bandara halim=Bandara Halim Perdanakusuma'],
  'Kota Jakarta Utara': ['~jakut', 'kelapa gading', 'penjaringan', 'pluit', 'ancol', 'cilincing', 'koja', 'sunter', 'muara angke', 'muara baru', 'tanjung priok', 'priok=Tanjung Priok', 'pantai indah kapuk'],
  'Kepulauan Seribu': ['~pulau seribu'],
  'Kota Tangerang': ['soekarno hatta=Bandara Soekarno-Hatta', 'soetta=Bandara Soekarno-Hatta', 'bandara soetta=Bandara Soekarno-Hatta'],
  'Kota Tangerang Selatan': ['~tangsel', 'ciputat', 'pamulang', 'serpong', 'bintaro'],
  'Tangerang': ['tigaraksa'],
  'Lebak': ['rangkasbitung'],
  'Kota Cilegon': ['pelabuhan merak'],
  // Jawa Barat
  'Bogor': ['cibinong', 'sentul', 'puncak bogor=Puncak', 'kawasan puncak=Puncak', 'jalur puncak=Puncak', 'gunung salak'],
  'Bekasi': ['cikarang'],
  'Bandung': ['soreang'],
  'Bandung Barat': ['lembang', 'tangkuban parahu=Gunung Tangkuban Parahu', 'tangkuban perahu=Gunung Tangkuban Parahu'],
  'Sukabumi': ['pelabuhan ratu=Palabuhanratu', 'palabuhanratu', 'pelabuhanratu=Palabuhanratu'],
  'Sumedang': ['jatinangor'],
  'Majalengka': ['kertajati=Bandara Kertajati'],
  'Garut': ['papandayan=Gunung Papandayan'],
  'Tasikmalaya': ['galunggung=Gunung Galunggung'],
  'Cianjur': ['gunung gede', 'gede pangrango=Gunung Gede Pangrango'],
  'Kuningan': ['ciremai=Gunung Ciremai'],
  // Jawa Tengah & DIY
  'Banyumas': ['purwokerto', 'gunung slamet'],
  'Semarang': ['ungaran'],
  'Kota Semarang': ['tanjung emas=Pelabuhan Tanjung Emas'],
  'Tegal': ['slawi'],
  'Magelang': ['borobudur'],
  'Temanggung': ['gunung sumbing', 'gunung sindoro', 'gunung sundoro=Gunung Sindoro'],
  'Wonosobo': ['dieng'],
  'Karanganyar': ['gunung lawu'],
  'Boyolali': ['merbabu=Gunung Merbabu'],
  'Kota Surakarta': ['solo'],
  'Jepara': ['karimunjawa'],
  'Cilacap': ['nusakambangan'],
  'Sleman': ['merapi=Gunung Merapi', 'prambanan'],
  'Kota Yogyakarta': ['malioboro'],
  'Gunung Kidul': ['~gunung kidul'],
  'Kulon Progo': ['~kulonprogo'],
  // Jawa Timur
  'Malang': ['kepanjen'],
  'Lumajang': ['semeru=Gunung Semeru'],
  'Probolinggo': ['bromo=Gunung Bromo'],
  'Kediri': ['kelud=Gunung Kelud'],
  'Banyuwangi': ['gunung raung', 'kawah ijen', 'gunung ijen=Kawah Ijen', 'pelabuhan ketapang'],
  'Pasuruan': ['gunung arjuno', 'welirang=Gunung Welirang'],
  'Sidoarjo': ['bandara juanda'],
  'Kota Surabaya': ['tanjung perak=Pelabuhan Tanjung Perak'],
  'Pamekasan': ['madura'],
  'Gresik': ['bawean=Pulau Bawean'],
  // Bali & Nusa Tenggara
  'Buleleng': ['singaraja'],
  'Badung': ['kuta', 'nusa dua', 'canggu', 'seminyak', 'ngurah rai=Bandara Ngurah Rai'],
  'Gianyar': ['ubud'],
  'Kota Denpasar': ['sanur'],
  'Klungkung': ['nusa penida'],
  'Jembrana': ['gilimanuk'],
  'Bangli': ['gunung batur', 'danau batur', 'kintamani'],
  'Karang Asem': ['~karang asem', 'gunung agung'],
  'Lombok Barat': ['~lobar', 'senggigi'],
  'Lombok Tengah': ['~loteng', 'mandalika', 'kuta mandalika=Mandalika', 'praya', 'lombok'],
  'Lombok Timur': ['~lotim', 'rinjani=Gunung Rinjani'],
  'Lombok Utara': ['gili trawangan'],
  'Dompu': ['gunung tambora'],
  'Bima': ['sangeang api=Gunung Sangeang Api'],
  'Manggarai Barat': ['labuan bajo', 'pulau komodo', 'taman nasional komodo'],
  'Manggarai': ['ruteng'],
  'Sikka': ['maumere', 'gunung egon', 'rokatenda=Gunung Rokatenda'],
  'Flores Timur': ['~flotim', 'larantuka', 'lewotobi=Gunung Lewotobi'],
  'Lembata': ['lewotolok=Gunung Ile Lewotolok', 'ile lewotolok=Gunung Ile Lewotolok'],
  'Ende': ['kelimutu', 'flores'],
  'Ngada': ['bajawa', 'inerie=Gunung Inerie'],
  'Belu': ['atambua'],
  'Sumba Timur': ['waingapu'],
  'Sumba Tengah': ['pulau sumba'],
  'Rote Ndao': ['pulau rote'],
  // Kalimantan
  'Kapuas Hulu': ['putussibau'],
  'Kotawaringin Barat': ['~kobar', 'pangkalan bun'],
  'Kotawaringin Timur': ['~kotim', 'sampit'],
  'Kota Palangka Raya': ['~palangkaraya'],
  'Kota Banjar Baru': ['~banjar baru'],
  'Tanah Bumbu': ['~tanbu', 'batulicin'],
  'Kutai Kartanegara': ['~kukar', 'tenggarong'],
  'Kutai Timur': ['~kutim', 'sangatta'],
  'Kutai Barat': ['~kubar'],
  'Mahakam Hulu': ['~mahakam hulu', '~mahulu'],
  'Berau': ['tanjung redeb', 'derawan'],
  'Bulungan': ['tanjung selor'],
  'Nunukan': ['sebatik'],
  'Penajam Paser Utara': ['penajam', 'ikn', 'ibu kota nusantara=IKN'],
  // Sulawesi
  'Minahasa': ['tondano'],
  'Minahasa Selatan': ['~minsel'],
  'Minahasa Utara': ['~minut'],
  'Minahasa Tenggara': ['soputan=Gunung Soputan'],
  'Kota Tomohon': ['lokon=Gunung Lokon'],
  'Siau Tagulandang Biaro': ['~sitaro', '~siau tagulandang biaro', '~kepulauan siau tagulandang biaro', 'karangetang=Gunung Karangetang', 'gunung ruang'],
  'Kepulauan Sangihe': ['~sangihe', 'tahuna', 'gunung awu'],
  'Kepulauan Talaud': ['~talaud'],
  'Bolaang Mongondow': ['~bolmong'],
  'Bolaang Mongondow Selatan': ['~bolsel'],
  'Bolaang Mongondow Timur': ['~boltim'],
  'Bolaang Mongondow Utara': ['~bolmut'],
  'Banggai': ['luwuk'],
  'Tojo Una-Una': ['~touna', 'ampana', 'togean=Kepulauan Togean'],
  'Parigi Moutong': ['~parimo'],
  'Morowali Utara': ['~morut'],
  'Bone': ['watampone'],
  'Wajo': ['sengkang'],
  'Gowa': ['sungguminasa'],
  'Luwu Utara': ['~lutra', 'masamba'],
  'Luwu Timur': ['~lutim', 'malili', 'sorowako'],
  'Tana Toraja': ['toraja', '~tator', 'makale'],
  'Toraja Utara': ['rantepao'],
  'Pangkajene Dan Kepulauan': ['~pangkep', '~pangkajene'],
  'Sidenreng Rappang': ['~sidrap'],
  'Polewali Mandar': ['~polman', '~polewali'],
  'Kepulauan Selayar': ['~selayar'],
  'Kota Parepare': ['~pare pare'],
  'Kota Baubau': ['~bau bau'],
  'Muna': ['raha'],
  'Konawe Selatan': ['~konsel'],
  'Konawe Utara': ['~konut'],
  // Maluku & Maluku Utara
  'Halmahera Utara': ['~halut', 'tobelo', 'dukono=Gunung Dukono'],
  'Halmahera Barat': ['~halbar', 'jailolo', 'gunung ibu', 'gamkonora=Gunung Gamkonora'],
  'Halmahera Tengah': ['~halteng', 'halmahera'],
  'Halmahera Selatan': ['~halsel'],
  'Halmahera Timur': ['~haltim'],
  'Kota Ternate': ['gamalama=Gunung Gamalama'],
  'Kota Tidore Kepulauan': ['~tidore', 'sofifi'],
  'Pulau Morotai': ['~morotai'],
  'Pulau Taliabu': ['~taliabu'],
  'Maluku Tengah': ['~malteng', 'masohi', 'banda neira', 'banda api=Gunung Banda Api', 'pulau seram'],
  'Maluku Tenggara': ['~malra', 'kepulauan kei'],
  'Maluku Tenggara Barat': ['~tanimbar', 'saumlaki'],
  'Maluku Barat Daya': ['pulau wetar'],
  'Kepulauan Aru': ['dobo'],
  'Buru': ['namlea', 'pulau buru'],
  'Buru Selatan': ['~bursel'],
  // Papua
  'Mimika': ['timika', 'tembagapura'],
  'Jayawijaya': ['wamena'],
  'Biak Numfor': ['~biak'],
  'Kepulauan Yapen': ['~yapen', 'serui'],
  'Pegunungan Bintang': ['oksibil'],
  'Yahukimo': ['dekai'],
  'Puncak': ['ilaga'],
  'Intan Jaya': ['sugapa'],
  'Nduga': ['kenyam'],
  'Asmat': ['agats'],
  'Teluk Bintuni': ['~bintuni'],
  'Jayapura': ['sentani'],
  'Kota Jayapura': ['abepura'],
  // Sumatera
  'Natuna': ['ranai'],
  'Kepulauan Anambas': ['~anambas'],
  'Kepulauan Mentawai': ['~mentawai', 'siberut=Pulau Siberut'],
  'Kepulauan Meranti': ['~meranti', 'selatpanjang'],
  'Kota Batam': ['rempang=Pulau Rempang', 'hang nadim=Bandara Hang Nadim'],
  'Kota Tanjung Pinang': ['~tanjung pinang'],
  'Kota Pangkal Pinang': ['~pangkal pinang'],
  'Karimun': ['tanjung balai karimun'],
  'Aceh Barat': ['meulaboh'],
  'Aceh Tengah': ['takengon'],
  'Aceh Utara': ['lhoksukon'],
  'Aceh Besar': ['seulawah=Gunung Seulawah'],
  'Gayo Lues': ['gunung leuser'],
  'Pidie': ['sigli'],
  'Kota Lhokseumawe': ['~lhok seumawe'],
  'Labuhan Batu': ['rantauprapat'],
  'Labuhan Batu Selatan': ['~labusel'],
  'Labuhan Batu Utara': ['~labura'],
  'Karo': ['kabanjahe', 'berastagi', 'sinabung=Gunung Sinabung', 'sibayak=Gunung Sibayak'],
  'Toba Samosir': ['~tobasa', 'balige'],
  'Samosir': ['danau toba'],
  'Simalungun': ['parapat'],
  'Deli Serdang': ['~deliserdang', 'kualanamu=Bandara Kualanamu', 'sibolangit', 'lubuk pakam'],
  'Serdang Bedagai': ['~sergai'],
  'Tapanuli Selatan': ['~tapsel'],
  'Tapanuli Tengah': ['~tapteng'],
  'Tapanuli Utara': ['~taput', 'tarutung'],
  'Mandailing Natal': ['~mandailing', 'panyabungan'],
  'Humbang Hasundutan': ['~humbahas'],
  'Padang Lawas Utara': ['~paluta'],
  'Kota Pematang Siantar': ['~pematang siantar', '~siantar'],
  'Kota Padangsidimpuan': ['~padang sidempuan', '~padangsidempuan', '~padang sidimpuan'],
  'Kota Gunungsitoli': ['~gunung sitoli'],
  'Kota Tebing Tinggi': ['~tebingtinggi'],
  'Kota Tanjung Balai': ['~tanjung balai'],
  'Agam': ['marapi=Gunung Marapi', 'singgalang=Gunung Singgalang', 'lubuk basung'],
  'Solok': ['gunung talang'],
  'Pesisir Selatan': ['~pessel', 'painan'],
  'Tanah Datar': ['batusangkar'],
  'Lima Puluh Kota': ['~limapuluh kota', '~50 kota'],
  'Kota Bukittinggi': ['~bukit tinggi'],
  'Kota Padang Panjang': ['~padangpanjang'],
  'Kota Sawah Lunto': ['~sawah lunto'],
  'Kampar': ['bangkinang'],
  'Indragiri Hilir': ['~inhil', 'tembilahan'],
  'Indragiri Hulu': ['~inhu', 'rengat'],
  'Rokan Hilir': ['~rohil', 'bagansiapiapi'],
  'Rokan Hulu': ['~rohul'],
  'Kuantan Singingi': ['~kuansing'],
  'Pelalawan': ['pangkalan kerinci'],
  'Batang Hari': ['~batang hari'],
  'Tanjung Jabung Barat': ['~tanjabbar', 'kuala tungkal'],
  'Tanjung Jabung Timur': ['~tanjabtim'],
  'Kota Sungai Penuh': ['~sungaipenuh'],
  'Banyu Asin': ['~banyu asin'],
  'Musi Banyuasin': ['~muba', 'sekayu'],
  'Musi Rawas Utara': ['~muratara'],
  'Ogan Komering Ilir': ['kayuagung', 'kayu agung=Kayuagung'],
  'Ogan Komering Ulu': ['baturaja'],
  'Ogan Komering Ulu Timur': ['~oku timur'],
  'Ogan Komering Ulu Selatan': ['~oku selatan'],
  'Ogan Ilir': ['indralaya'],
  'Kota Pagar Alam': ['~pagaralam', 'gunung dempo'],
  'Kota Lubuklinggau': ['~lubuk linggau'],
  'Rejang Lebong': ['curup'],
  'Lampung Selatan': ['~lamsel', 'kalianda', 'bakauheni', 'krakatau=Gunung Anak Krakatau', 'anak krakatau=Gunung Anak Krakatau'],
  'Lampung Tengah': ['~lamteng'],
  'Lampung Timur': ['~lamtim'],
  'Lampung Barat': ['~lambar'],
  'Lampung Utara': ['kotabumi'],
  'Kota Bandar Lampung': ['~bandarlampung'],
  'Tulang Bawang Barat': ['~tubaba'],
  'Bangka': ['sungailiat'],
  'Belitung': ['tanjungpandan', 'tanjung pandan=Tanjungpandan'],
};

/** Butuh penanda apa pun di depannya ("di", "Polres", "Kabupaten" …). */
const NEEDS_CUE = new Set([
  'batang', 'bima', 'buru', 'kudus', 'pati', 'karo', 'lingga', 'agam', 'sigi', 'kaur', 'landak', 'kapuas',
  'serang', 'solo', 'toba', 'meranti', 'penajam', 'raha',
]);
/** Butuh penanda pemerintahan ("Kabupaten", "Bupati", "Polres" …): "di Puncak" belum cukup. */
const NEEDS_ADMIN = new Set([
  'puncak', 'kuningan', 'manggarai', 'malaka', 'kota baru', 'gunung mas', 'batu bara', 'pesisir barat',
  'pesisir selatan', 'loteng',
]);

/** Tak pernah berdiri sendiri (hanya lewat "Kota X" / "Kabupaten X"). */
const NO_BARE = new Set(['banjar', 'metro', 'batu']);

/** Frasa yang dicocokkan lalu DIBUANG: negara tetangga, pulau/kawasan tanpa provinsi tunggal, merek. */
const STOP_PHRASES = [
  'papua nugini', 'papua new guinea', 'timor leste', 'timor timur', 'kalimantan', 'borneo', 'sumatera',
  'sumatra', 'sulawesi', 'jawa', 'nusa tenggara', 'selat malaka', 'selat sunda', 'selat bali', 'selat madura',
  'bali united', 'malut united', 'madura united', 'semen padang', 'jawa pos', 'krakatau steel',
  'sabang sampai merauke', 'sabang merauke',
];

/** Kata sebelum nama tempat yang menandakan itu BUKAN lokasi (kuliner, klub bola, "Al-Jabar"). */
const NEVER_BEFORE = new Set([
  'al', 'nasi', 'sate', 'soto', 'coto', 'bakso', 'mie', 'mi', 'tahu', 'kopi', 'batik', 'pempek', 'gudeg',
  'rendang', 'dodol', 'bika', 'pisang', 'jeruk', 'sapi', 'apel', 'lumpia', 'brem', 'kerupuk', 'tenun',
  'songket', 'kuliner', 'masakan', 'rm', 'restoran', 'warung', 'lontong', 'bubur', 'kue', 'roti', 'bebek',
  'pecel', 'getuk', 'bakpia', 'tempe', 'keripik', 'sambal', 'khas', 'ala', 'kain', 'reog', 'gamelan', 'tari',
  'bahasa', 'suku', 'adat',
  'persib', 'persija', 'arema', 'psm', 'persebaya', 'psis', 'persik', 'persita', 'pss', 'persis',
  'persipura', 'psms', 'persiraja', 'persela', 'persiba', 'psim', 'psbs', 'persijap', 'deltras', 'persikabo',
]);
const NEVER_AFTER = new Set(['united', 'fc']);

const KEY_NOT_BEFORE: Record<string, string[]> = {
  malang: ['nasib', 'bernasib', 'sungguh', 'pria', 'wanita', 'bocah', 'gadis', 'anak', 'nenek', 'kakek', 'korban'],
  palu: ['ketok', 'ketuk', 'mengetok', 'mengetuk', 'diketok', 'diketuk'],
};
const KEY_NOT_AFTER: Record<string, string[]> = {
  medan: ['berat', 'perang', 'magnet', 'sulit', 'terjal', 'tempur', 'laga', 'pertempuran', 'juang', 'listrik', 'ekstrem', 'curam'],
  malang: ['nian', 'melintang', 'benar'],
  padang: ['rumput', 'pasir', 'savana', 'golf', 'bulan', 'lamun'],
  palu: ['hakim', 'sidang', 'godam'],
  batang: ['pohon', 'kayu', 'besi', 'rokok', 'emas', 'tubuh', 'sungai'],
  'kota metro': ['jaya', 'tv'],
};

// ── Penanda wilayah ────────────────────────────────────────────────────
/** Lembaga yang menempel pada nama kab/kota: cukup kuat untuk nama ambigu. */
const STRICT_ADMIN = new Set([
  'kabupaten', 'kab', 'kota', 'pemkab', 'pemkot', 'pemda', 'bupati', 'wabup', 'walikota', 'wawali', 'dprd',
  'polres', 'polresta', 'polrestabes', 'kapolres', 'kapolresta', 'kapolrestabes', 'wakapolres',
  'kodim', 'dandim', 'kejari', 'kajari', 'pn', 'bpbd', 'lapas', 'rutan', 'rsud', 'kpu', 'bawaslu',
]);
const STRICT_ADMIN_2 = new Set(['wali kota', 'wakil bupati', 'pengadilan negeri', 'kejaksaan negeri', 'kantor sar']);
const ADMIN = new Set([
  'korem', 'danrem', 'lanal', 'lanud', 'imigrasi', 'basarnas', 'damkar', 'dishub', 'dinkes', 'disdik', 'polsek',
  'bandara', 'pelabuhan', 'terminal', 'stasiun', 'kecamatan', 'wilayah', 'kawasan', 'daerah', 'perairan', 'warga',
  'provinsi', 'prov', 'pemprov', 'gubernur', 'wagub', 'polda', 'kapolda', 'wakapolda', 'kodam', 'pangdam',
  'kejati', 'kajati', 'sekda', 'gunung', 'pulau', 'kepulauan', 'se',
]);
const ADMIN_2 = new Set(['wakil gubernur', 'pengadilan tinggi', 'kejaksaan tinggi', 'kota administrasi', 'kabupaten administrasi']);
/** Cabang lembaga ("OJK Cirebon", "BNN Jambi"). */
const SOFT = new Set([
  'ojk', 'bi', 'bps', 'bnn', 'bnnp', 'bnnk', 'kemenag', 'bpjs', 'pln', 'pdam', 'kpp', 'cukai', 'kantor', 'cabang',
  'universitas', 'bmkg', 'pmi', 'kadin', 'apindo',
]);
const DIRECTION = new Set(['ke', 'dari', 'asal', 'menuju', 'tujuan', 'rute']);

interface KeyEntry {
  tokens: string[];
  /** null = frasa henti. */
  prov: ProvCode | null;
  place: Place | null;
  label: string;
  /** 1 provinsi · 2 nama khas · 3 perlu penanda · 4 perlu penanda pemerintahan. */
  tier: 1 | 2 | 3 | 4;
  /** Kunci sudah memuat kata "kota"/"kabupaten". */
  explicit: boolean;
}

export interface Gazetteer {
  places: Place[];
  byFirst: Map<string, KeyEntry[]>;
  /** Nama dirapatkan tanpa spasi ("halmaheraselatan") → entri; untuk string wilayah BMKG. */
  compact: Map<string, KeyEntry>;
}

export const provName = (code: ProvCode): string => PROVINCES[code]?.name ?? code;

export function tokenize(text: string): string[] {
  const s = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/,/g, ' , ')
    .replace(/[^a-z0-9,]+/g, ' ')
    .trim();
  return s ? s.split(/\s+/) : [];
}

const phrase = (s: string): string[] => tokenize(s).filter(t => t !== ',');
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function titleCase(s: string): string {
  const small = new Set(['dan', 'di', 'ke']);
  const upper = new Set(['ikn', 'hi', 'dpr', 'm']);
  return s.split(' ').map((w, i) => (upper.has(w) ? w.toUpperCase() : small.has(w) && i > 0 ? w : cap(w))).join(' ');
}

const tierOf = (key: string): 2 | 3 | 4 => (NEEDS_ADMIN.has(key) ? 4 : NEEDS_CUE.has(key) ? 3 : 2);
const isKotaRow = (adm2: string): boolean => adm2.startsWith('Kota ') && adm2 !== 'Kota Baru';

export function buildGazetteer(rows: KabRow[]): Gazetteer {
  const keyMap = new Map<string, KeyEntry>();
  const put = (ph: string, e: Omit<KeyEntry, 'tokens'>) => {
    const tokens = phrase(ph);
    if (tokens.length) keyMap.set(tokens.join(' '), { ...e, tokens });
  };

  // 1) kab/kota dari data BPS
  const places: Place[] = [];
  const byAdm2 = new Map<string, Place>();
  const baseOf = (adm2: string) => (isKotaRow(adm2) ? adm2.slice(5) : adm2);
  const keyOf = (s: string) => phrase(s).join(' ');
  const kotaBases = new Set(rows.filter(r => isKotaRow(r[0])).map(r => keyOf(baseOf(r[0]))));
  const kabBases = new Set(rows.filter(r => !isKotaRow(r[0])).map(r => keyOf(r[0])));

  for (const [adm2, prov, lon, lat] of rows) {
    const isKota = isKotaRow(adm2);
    const base = baseOf(adm2);
    const disp = DISPLAY[adm2] ?? base;
    const baseKey = keyOf(base);
    const homonym = isKota ? kabBases.has(baseKey) : kotaBases.has(baseKey);
    const place: Place = {
      id: `${prov}:${adm2}`,
      name: !isKota && homonym ? `Kab. ${disp}` : disp,
      prov, lon, lat,
      kind: isKota ? 'kota' : 'kab',
    };
    places.push(place);
    byAdm2.set(adm2, place);

    for (const v of new Set([baseKey, keyOf(disp)])) {
      // nama polos: bila ada kota & kabupaten senama, yang dimaksud berita hampir selalu kotanya
      if (!NO_BARE.has(v) && (isKota || !homonym)) put(v, { prov, place, label: place.name, tier: tierOf(v), explicit: false });
      if (isKota) {
        put(`kota ${v}`, { prov, place, label: place.name, tier: 2, explicit: true });
      } else {
        put(`kabupaten ${v}`, { prov, place, label: place.name, tier: 2, explicit: true });
        put(`kab ${v}`, { prov, place, label: place.name, tier: 2, explicit: true });
      }
    }
  }

  // 2) alias
  for (const [adm2, list] of Object.entries(ALIASES)) {
    const place = byAdm2.get(adm2);
    if (!place) throw new Error(`Alias menunjuk kab/kota yang tidak ada di data: ${adm2}`);
    for (const raw of list) {
      const spelling = raw.startsWith('~');
      const [ph, custom] = (spelling ? raw.slice(1) : raw).split('=');
      const k = keyOf(ph);
      put(k, { prov: place.prov, place, label: spelling ? place.name : custom ?? titleCase(k), tier: tierOf(k), explicit: false });
    }
  }

  // 3) provinsi — menimpa kab/kota senama ("Gorontalo", "Jambi", "Bengkulu" → tingkat provinsi)
  for (const [code, p] of Object.entries(PROVINCES)) {
    for (const k of p.keys) put(k, { prov: code, place: null, label: p.name, tier: 1, explicit: false });
  }

  // 4) frasa henti
  for (const s of STOP_PHRASES) put(s, { prov: null, place: null, label: '', tier: 1, explicit: false });

  const byFirst = new Map<string, KeyEntry[]>();
  const compact = new Map<string, KeyEntry>();
  for (const e of keyMap.values()) {
    const arr = byFirst.get(e.tokens[0]);
    if (arr) arr.push(e); else byFirst.set(e.tokens[0], [e]);
    if (e.prov && !e.explicit) compact.set(e.tokens.join(''), e);
  }
  for (const arr of byFirst.values()) arr.sort((a, b) => b.tokens.length - a.tokens.length);

  return { places, byFirst, compact };
}

interface Candidate {
  entry: KeyEntry;
  score: number;
}

function matchAt(g: Gazetteer, tokens: string[], i: number): KeyEntry | null {
  const list = g.byFirst.get(tokens[i]);
  if (!list) return null;
  for (const e of list) {
    if (i + e.tokens.length > tokens.length) continue;
    let ok = true;
    for (let k = 1; k < e.tokens.length; k++) if (tokens[i + k] !== e.tokens[k]) { ok = false; break; }
    if (ok) return e;
  }
  return null;
}

function scan(g: Gazetteer, tokens: string[], inSummary: boolean): Candidate[] {
  const out: Candidate[] = [];
  let i = 0;
  while (i < tokens.length) {
    const hit = matchAt(g, tokens, i);
    if (!hit) { i++; continue; }
    const end = i + hit.tokens.length;
    if (hit.prov) {
      const prev = i >= 1 ? tokens[i - 1] : '';
      const prev2 = i >= 2 ? `${tokens[i - 2]} ${tokens[i - 1]}` : '';
      const next = end < tokens.length ? tokens[end] : '';
      const key = hit.tokens.join(' ');
      const blocked =
        NEVER_BEFORE.has(prev) || NEVER_AFTER.has(next) ||
        (KEY_NOT_BEFORE[key]?.includes(prev) ?? false) || (KEY_NOT_AFTER[key]?.includes(next) ?? false);
      if (!blocked) {
        const strict = hit.explicit || STRICT_ADMIN.has(prev) || STRICT_ADMIN_2.has(prev2);
        const admin = strict || ADMIN.has(prev) || ADMIN_2.has(prev2);
        const at = prev === 'di';
        const weak = SOFT.has(prev) || DIRECTION.has(prev);
        // aposisi ("…, Jakarta Barat, …") hanya dipercaya untuk nama khas, bukan nama ambigu
        const apposition = prev === ',';
        // "Cirebon, Jawa Barat": nama diikuti provinsinya sendiri
        let confirmed = false;
        if (next === ',' && hit.place && end + 1 < tokens.length) {
          const after = matchAt(g, tokens, end + 1);
          confirmed = !!after && after.prov === hit.prov && !after.place;
        }
        const anyCue = admin || at || weak || confirmed;
        const accept =
          hit.tier === 4 ? strict || confirmed :
          hit.tier === 3 ? anyCue :
          inSummary ? anyCue || apposition : true;
        if (accept) {
          const cue = at ? 3 : admin || confirmed ? 2 : weak || apposition ? 1 : 0;
          out.push({ entry: hit, score: cue * 2 + (hit.place ? 1 : 0) });
        }
      }
    }
    i = end;
  }
  return out;
}

/** Skor tertinggi menang; seri → yang disebut lebih dulu. */
function pick(cands: Candidate[], onlyProv?: ProvCode): KeyEntry | null {
  let best: Candidate | null = null;
  for (const c of cands) {
    if (onlyProv && (c.entry.prov !== onlyProv || !c.entry.place)) continue;
    if (!best || c.score > best.score) best = c;
  }
  return best ? best.entry : null;
}

/**
 * Lokasi sebuah berita. Judul dulu; ringkasan dipakai bila judul tidak menyebut tempat,
 * atau untuk mempertajam provinsi di judul menjadi kab/kota di provinsi yang sama.
 */
export function locate(g: Gazetteer, title: string, summary = ''): LocMatch | null {
  const t = pick(scan(g, tokenize(title), false));
  const sCands = summary ? scan(g, tokenize(summary), true) : [];
  if (t && t.prov) {
    if (!t.place) {
      const sharper = pick(sCands, t.prov);
      if (sharper && sharper.prov) return { prov: sharper.prov, place: sharper.place, label: sharper.label, via: 'ringkasan' };
    }
    return { prov: t.prov, place: t.place, label: t.label, via: 'judul' };
  }
  const s = pick(sCands);
  return s && s.prov ? { prov: s.prov, place: s.place, label: s.label, via: 'ringkasan' } : null;
}

// ── String wilayah BMKG: "116 km TimurLaut HALMAHERASELATAN-MALUT" ──────
const BMKG_DIR: Record<string, string> = {
  utara: 'utara', selatan: 'selatan', timur: 'timur', barat: 'barat', timurlaut: 'timur laut',
  tenggara: 'tenggara', baratdaya: 'barat daya', baratlaut: 'barat laut',
};
const BMKG_PROV: Record<string, ProvCode> = {
  aceh: 'AC', sumut: 'SU', sumbar: 'SB', riau: 'RI', kepri: 'KR', jambi: 'JA', sumsel: 'SS', bengkulu: 'BE',
  lampung: 'LA', babel: 'BB', banten: 'BT', dki: 'JK', jakarta: 'JK', jabar: 'JB', jateng: 'JT', diy: 'YO',
  jatim: 'JI', bali: 'BA', ntb: 'NB', ntt: 'NT', kalbar: 'KB', kalteng: 'KT', kalsel: 'KS', kaltim: 'KI',
  kaltara: 'KU', sulut: 'SA', sulteng: 'ST', sulsel: 'SN', sultra: 'SG', gorontalo: 'GO', sulbar: 'SR',
  maluku: 'MA', malut: 'MU', papua: 'PA', papuabarat: 'PB', papuabaratdaya: 'PD', papuapegunungan: 'PE',
  papuaselatan: 'PS', papuatengah: 'PT',
};

const expandBmkg = (s: string): string =>
  s.replace(/brtdaya/g, 'baratdaya').replace(/brt/g, 'barat').replace(/pgngn/g, 'pegunungan')
    .replace(/papuasel$/, 'papuaselatan').replace(/papuatgh$/, 'papuatengah');

/** "116 km TimurLaut HALMAHERASELATAN-MALUT" → "116 km timur laut Halmahera Selatan, Maluku Utara". */
export function parseBmkgWilayah(g: Gazetteer, raw: string): { text: string; prov: ProvCode | null } {
  const src = (raw || '').trim();
  const m = /^(\d+(?:[.,]\d+)?)\s*km\s+([A-Za-z]+)\s+(.+)$/.exec(src);
  if (!m) {
    const loc = src ? locate(g, src) : null;
    return { text: src || 'Lokasi tidak disebut', prov: loc ? loc.prov : null };
  }
  const dir = BMKG_DIR[m[2].toLowerCase()] ?? m[2].toLowerCase();
  let prov: ProvCode | null = null;
  const names: string[] = [];
  for (const part of m[3].split('-')) {
    const c = expandBmkg(part.toLowerCase().replace(/kep\./g, 'kepulauan').replace(/[^a-z]/g, ''));
    if (!c) continue;
    if (BMKG_PROV[c]) { prov = BMKG_PROV[c]; names.push(provName(prov)); continue; }
    const direct = g.compact.get(c);
    if (direct?.prov) {
      prov = prov ?? direct.prov;
      names.push(direct.label.replace(/^Kab\. /, ''));
      continue;
    }
    // "KEBARMANOKWARI" → "Kebar, Manokwari": cari nama kab/kota dikenal di ujung string
    let split = '';
    for (let cut = 3; cut <= c.length - 5 && !split; cut++) {
      const tail = g.compact.get(c.slice(cut));
      if (tail?.prov && tail.place) {
        prov = prov ?? tail.prov;
        split = `${cap(c.slice(0, cut))}, ${tail.label.replace(/^Kab\. /, '')}`;
      }
    }
    if (split) { names.push(split); continue; }
    const pre = /^(pulau|kepulauan|kota|tanjung|teluk|gunung|laut|selat)(.+)$/.exec(c);
    names.push(pre ? `${cap(pre[1])} ${cap(pre[2])}` : cap(c));
  }
  return { text: `${m[1].replace('.', ',')} km ${dir} ${names.join(', ')}`, prov };
}
