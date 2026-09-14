// PLACEHOLDER NOMOR WHATSAPP RESMI KLIKUMROH
// Ganti [NOMOR_PLACEHOLDER] di bawah dengan nomor WhatsApp resmi yang aktif saat live.
export const WHATSAPP_PHONE_PLACEHOLDER = "6281234567890"; // TODO: Ganti dengan nomor WhatsApp resmi KlikUmroh
export const WHATSAPP_PREFILLED_MESSAGE = "Halo, saya tertarik dengan KlikUmroh untuk travel saya.";
export const WHATSAPP_DEMO_URL = `https://wa.me/${WHATSAPP_PHONE_PLACEHOLDER}?text=${encodeURIComponent(WHATSAPP_PREFILLED_MESSAGE)}`;

export const landingContent = {
  section01Navbar: {
    logo: "KlikUmroh.id",
    menu: [
      { label: "Fitur", href: "#fitur" },
      { label: "Cara Kerja", href: "#cara-kerja" },
      { label: "Sistem Agen", href: "#sistem-agen" },
      { label: "Harga", href: "/harga" },
      { label: "FAQ", href: "#faq" },
    ],
    cta: "Jadwalkan Demo",
  },

  section02Hero: {
    eyebrow: "SISTEM AGEN TRAVEL UMROH",
    headline: "Jangan Biarkan Jaringan Agen Anda Cuma Jadi Grup WhatsApp.",
    subheadline:
      "Beri agen link referral, dashboard, materi promosi, target, dan pencatatan jamaah yang bisa dipantau oleh tim travel. Semuanya berjalan dengan brand travel Anda sendiri.",
    ctaPrimary: "Lihat Demo Sistemnya",
    ctaSecondary: "Lihat Cara Kerjanya",
    microcopy: "Bisa pakai logo, warna, dan domain travel Anda sendiri.",
    imagePlaceholder:
      "Dashboard Travel di laptop, Dashboard Agen di smartphone, Website travel di smartphone kedua, garis alur Agen -> Jamaah -> Travel. Tampilkan elemen UI: Prospek baru, Agen aktif, Closing, Link referral, Saldo komisi, Leaderboard.",
  },

  section03Problem: {
    headline:
      "Yang Sering Jadi Masalah Bukan Kekurangan Agen. Tapi Tidak Ada Sistem yang Membuat Mereka Aktif.",
    intro:
      "Banyak travel sudah punya puluhan bahkan ratusan nama agen di grup WhatsApp. Tapi ketika ditanya siapa yang masih aktif jualan, siapa yang membawa jamaah, atau agen mana yang perlu dibina, jawabannya sering belum jelas.",
    painPoints: [
      {
        title: "Pain Point 01 — Agen terdaftar, tapi tidak benar-benar bergerak:",
        desc: "Grup ramai saat ada paket baru. Beberapa hari kemudian sepi lagi. Travel sulit tahu siapa yang masih aktif dan siapa yang sudah tidak pernah promosi.",
      },
      {
        title: "Pain Point 02 — Agen sering tidak tahu harus mulai dari mana:",
        desc: "Poster sudah dikirim. Tapi caption, script WhatsApp, cara follow-up, dan ide mencari jamaah sering kembali ditanyakan satu per satu.",
      },
      {
        title: "Pain Point 03 — Jamaah masuk, sumbernya tidak selalu jelas:",
        desc: "Ada yang datang dari iklan, organik, WhatsApp, dan rekomendasi agen. Kalau semuanya bercampur, travel sulit tahu channel mana yang sebenarnya bekerja.",
      },
      {
        title: "Pain Point 04 — Pembinaan agen jadi berdasarkan feeling:",
        desc: "Karena data performa tidak kelihatan, reward, event, training, dan budget promosi akhirnya sering diberikan berdasarkan perkiraan.",
      },
    ],
    closing: "KlikUmroh dibuat untuk membereskan bagian ini.",
    imagePlaceholder:
      "Empat card visual ringan (grup WhatsApp agen, poster promosi, chat jamaah, dashboard tanpa data atribusi) — hindari icon SaaS generik.",
  },

  section04Positioning: {
    headline: "KlikUmroh Bukan ERP Travel Baru.",
    body: "Kami tidak mengurus visa, dokumen keberangkatan, akuntansi, hotel, atau operasional harian travel. KlikUmroh fokus pada satu bagian yang sering belum punya sistem sendiri: channel agen dan sumber jamaah.",
    highlight:
      "Kalau ERP Anda mengurus operasional, KlikUmroh mengurus pertumbuhan channel agen.",
    imagePlaceholder:
      "perbandingan dua kolom — ERP Travel (Dokumen, Keuangan, Keberangkatan, Operasional) vs KlikUmroh (Agen, Referral, Jamaah, Follow-up, Komisi, Analytics).",
  },

  section05BeforeAfter: {
    headline: "Dari \"Kirim Poster ke Grup\" Menjadi Channel yang Bisa Dilacak.",
    tanpaSistem:
      "Paket baru dibuat -> poster dikirim ke grup -> agen share sendiri-sendiri -> ada jamaah masuk -> tim follow-up -> sumbernya kadang lupa dicatat.",
    denganKlikUmroh:
      "Agen punya referral link -> jamaah masuk lewat website travel -> sumber agen tercatat -> tim follow-up -> status bergerak sampai closing -> komisi dan performa agen ikut tercatat.",
    supporting:
      "Bukan berarti semua proses harus otomatis. Yang penting, travel punya jejak yang jelas dari jamaah masuk sampai hasil akhirnya.",
    imagePlaceholder:
      "diagram horizontal Sebelum/Sesudah, \"Sebelum\" lebih acak visualnya, \"Sesudah\" lebih runtut.",
  },

  section06HowItWorks: {
    headline: "Begini Alur Sederhananya.",
    steps: [
      {
        step: "Step 01 — Agen punya link sendiri:",
        desc: "Setiap agen mendapatkan referral link unik yang bisa dibagikan ke WhatsApp, Instagram, TikTok, komunitas, atau database pribadi.",
      },
      {
        step: "Step 02 — Jamaah masuk ke website travel:",
        desc: "Yang mereka lihat adalah website milik travel Anda, lengkap dengan paket, profil, legalitas, testimoni, dan branding travel.",
      },
      {
        step: "Step 03 — Sumber agen ikut tercatat:",
        desc: "Ketika jamaah mengisi form minat melalui referral, sistem menyimpan agen yang membawanya.",
      },
      {
        step: "Step 04 — Tim follow-up seperti biasa:",
        desc: "Admin cukup mengubah status: Baru -> Dihubungi -> Tertarik -> Closing / Tidak Lanjut.",
      },
      {
        step: "Step 05 — Travel bisa lihat hasilnya:",
        desc: "Dari sini mulai terlihat agen mana yang membawa jamaah, mana yang aktif, dan di tahap mana prospeknya sering berhenti.",
      },
      {
        step: "Step 06 — Komisi tercatat saat closing:",
        desc: "Ketika admin menandai closing, komisi agen masuk ke catatan sistem sesuai pengaturan travel.",
      },
    ],
    cta: "Lihat Demo Alurnya",
    imagePlaceholder:
      "timeline 6 langkah dengan mini screenshot (Referral link, Halaman paket, Form minat, Pipeline, Funnel agen, Saldo komisi).",
  },

  section07AgentDashboard: {
    eyebrow: "DIBUAT UNTUK DIPAKAI DARI HP",
    headline: "Agen Tidak Butuh Dashboard yang Ribet.",
    subheadline:
      "Yang mereka butuhkan adalah tempat untuk lihat link jualan, jamaah yang masuk, komisi, target, dan posisi mereka. Itu saja yang dibuat menonjol.",
    features: [
      {
        title: "Feature 01 — Link referral langsung kelihatan:",
        desc: "Tinggal salin atau bagikan ke WhatsApp. Tidak perlu cari menu berlapis-lapis.",
      },
      {
        title: "Feature 02 — Jamaah milik agen sendiri:",
        desc: "Agen bisa melihat jamaah yang masuk lewat referral atau yang mereka tambahkan manual setelah chat langsung.",
      },
      {
        title: "Feature 03 — Komisi tidak lagi cuma ditanya lewat admin:",
        desc: "Agen bisa melihat saldo yang sudah tercatat dan potensi komisi dari jamaah yang masih berjalan.",
      },
      {
        title: "Feature 04 — Target bulanan:",
        desc: "Ada progress sederhana supaya agen tahu posisi mereka terhadap target periode berjalan.",
      },
      {
        title: "Feature 05 — Leaderboard:",
        desc: "Agen bisa melihat peringkatnya di jaringan travel tanpa perlu menunggu recap manual dari admin.",
      },
    ],
    imagePlaceholder:
      "smartphone besar menampilkan Halo [Nama], Target bulanan, Siap Cair, Tertunda, Link referral, Jamaah Baru/Diproses/Closing, Peringkat.",
  },

  section08AgentActivation: {
    headline:
      "Masalah Agen Pasif Tidak Selesai Hanya dengan Menambah Jumlah Agen.",
    body: "Setelah agen masuk, mereka tetap butuh bahan jualan, arahan, target, dan alasan untuk terus aktif. Karena itu KlikUmroh tidak berhenti di pendaftaran agen.",
    featureCards: [
      {
        title: "Tips Promosi:",
        desc: "Travel bisa membagikan panduan jualan yang bisa langsung dibaca agen.",
      },
      {
        title: "Script WA:",
        desc: "Agen tidak perlu menyusun balasan dari nol setiap ada calon jamaah bertanya.",
      },
      {
        title: "Sumber Jamaah:",
        desc: "Beri panduan praktis tentang dari mana mereka bisa mulai mencari calon jamaah.",
      },
      {
        title: "Bank Caption:",
        desc: "Caption promosi bisa disiapkan dari satu tempat dan dipakai jaringan agen.",
      },
      {
        title: "Bank Konten:",
        desc: "Foto, video, dan materi promosi bisa disediakan agar agen tidak selalu minta file lewat chat admin.",
      },
      {
        title: "Event & RSVP:",
        desc: "Training, gathering, webinar, dan agenda pembinaan bisa diumumkan dan dipantau dari sistem.",
      },
      {
        title: "Leaderboard & Target:",
        desc: "Travel punya alat sederhana untuk membuat aktivitas agen lebih terlihat dan lebih terarah.",
      },
    ],
    highlight:
      "Tujuannya bukan punya agen sebanyak mungkin. Tujuannya punya lebih banyak agen yang benar-benar aktif.",
    imagePlaceholder:
      "collage 2x2 (Leaderboard, Target, Event, Marketing tools).",
  },

  section09Whitelabel: {
    headline: "Jamaah Melihat Brand Travel Anda. Bukan Brand KlikUmroh.",
    body: "KlikUmroh bekerja di belakang layar. Website publik dan dashboard agen bisa mengikuti identitas travel Anda sendiri.",
    featurePoints: [
      {
        title: "Logo travel Anda:",
        desc: "Bukan portal dengan logo platform pihak ketiga.",
      },
      {
        title: "Warna brand Anda:",
        desc: "Tampilan bisa mengikuti warna utama travel.",
      },
      {
        title: "Website travel Anda:",
        desc: "Paket, profil, legalitas, testimoni, FAQ, dan kontak tetap berada dalam pengalaman brand Anda sendiri.",
      },
      {
        title: "Custom domain:",
        desc: "Gunakan subdomain KlikUmroh atau hubungkan domain milik travel Anda.",
      },
      {
        title: "Dashboard agen ikut brand travel:",
        desc: "Agen merasa masuk ke sistem travel tempat mereka bergabung, bukan ke marketplace umum.",
      },
    ],
    highlight:
      "Sistemnya kami siapkan. Hubungan dengan agen dan jamaah tetap milik travel Anda.",
    imagePlaceholder:
      "3 mockup tenant berbeda dengan logo dan warna berbeda untuk memperjelas konsep whitelabel.",
  },

  section10TravelDashboard: {
    headline:
      "Dari Satu Dashboard, Tim Bisa Lihat Apa yang Sedang Terjadi di Channel Agen.",
    features: [
      {
        title: "Prospek baru:",
        desc: "Lihat siapa yang baru masuk, paket yang diminati, jumlah jamaah, dan sumbernya.",
      },
      {
        title: "Status follow-up:",
        desc: "Admin bisa mengelola proses tanpa CRM yang terlalu berat.",
      },
      {
        title: "Detail agen:",
        desc: "Lihat profil dan funnel masing-masing agen.",
      },
      {
        title: "Pendaftaran agen:",
        desc: "Travel bisa membuka pendaftaran agen gratis atau berbayar sesuai kebijakan sendiri.",
      },
      {
        title: "Komisi:",
        desc: "Nilai komisi per paket dan pencatatan closing berada di bawah kontrol travel.",
      },
      {
        title: "Event dan materi promosi:",
        desc: "Pembinaan agen tidak lagi tercecer di banyak tempat.",
      },
    ],
    imagePlaceholder:
      "desktop dashboard dengan data Prospek baru, Closing rate, Funnel channel, Agen aktif, Leaderboard.",
  },

  section11Analytics: {
    headline: "Kalau Jamaah Masuk, Travel Harus Tahu Datangnya dari Mana.",
    body: "Salah satu alasan KlikUmroh dibuat adalah supaya travel tidak terus mengandalkan tebakan saat menentukan channel mana yang layak dibina atau diberi budget lebih besar.",
    features: [
      {
        title: "Feature 01 — Organik, paid, dan agen bisa dibedakan:",
        desc: "Sumber prospek tidak lagi bercampur dalam satu daftar tanpa konteks.",
      },
      {
        title: "Feature 02 — Funnel per agen:",
        desc: "Travel bisa melihat bukan hanya berapa banyak lead yang dibawa agen, tapi bagaimana lead itu bergerak setelah masuk.",
      },
      {
        title: "Feature 03 — Drop-off lebih mudah kelihatan:",
        desc: "Kalau banyak prospek dari agen tertentu berhenti di tahap yang sama, tim punya bahan untuk mengecek apa yang perlu diperbaiki.",
      },
      {
        title: "Feature 04 — Data untuk menentukan pembinaan berikutnya:",
        desc: "Bukan semua agen harus diperlakukan sama. Data membantu travel tahu siapa yang perlu didorong, dibantu, atau diapresiasi.",
      },
    ],
    imagePlaceholder:
      "dashboard analytics (Sumber prospek: Agen/Organik/Paid, Funnel: Masuk->Dihubungi->Tertarik->Closing, Tabel performa agen). CATATAN: jangan gunakan angka hasil bisnis fiktif di placeholder ini.",
  },

  section12TwoConditions: {
    headline: "Sudah Punya Agen atau Baru Mau Mulai, Dua-Duanya Bisa Masuk.",
    card01: {
      title: "Card 01 — Sudah punya jaringan agen?:",
      desc: "Jangan mulai dari nol. Masukkan jaringan yang sudah ada, beri mereka dashboard, referral link, materi promosi, target, dan tracking yang lebih rapi.",
      cta: "Rapikan Jaringan Agen Saya",
    },
    card02: {
      title: "Card 02 — Belum punya sistem agen?:",
      desc: "Mulai dengan fondasi yang sudah siap: pendaftaran, referral, tracking jamaah, komisi, leaderboard, dan tools pembinaan.",
      cta: "Mulai Bangun Channel Agen",
    },
    imagePlaceholder:
      "dua card besar (existing network: kumpulan avatar agen; start from zero: alur daftar->aktif->share->jamaah masuk).",
  },

  section13Comparison: {
    headline:
      "Yang Berubah Bukan Cara Travel Jualan. Yang Berubah Adalah Cara Semuanya Dicatat dan Dikelola.",
    tableHeaders: {
      before: "Sebelum",
      after: "Dengan KlikUmroh",
    },
    rows: [
      {
        before: "Agen tersimpan di grup WhatsApp",
        after: "Agen punya akun dan dashboard sendiri",
      },
      {
        before: "Poster dan caption dikirim manual lewat chat",
        after: "Materi promosi tersedia di satu tempat",
      },
      {
        before: "Referral sulit dilacak",
        after: "Setiap agen punya referral link unik",
      },
      {
        before: "Sumber jamaah sering lupa dicatat",
        after: "Sumber agen ikut tercatat saat form masuk",
      },
      {
        before: "Progress agen direkap manual",
        after: "Target dan leaderboard bisa dilihat langsung",
      },
      {
        before: "Komisi dicek satu per satu",
        after: "Komisi terhubung dengan closing di sistem",
      },
      {
        before: "Sulit tahu channel yang bekerja",
        after: "Ada analitik organik, paid, dan agen",
      },
      {
        before: "Portal terasa milik pihak ketiga",
        after: "Tampilan mengikuti brand travel",
      },
    ],
    supporting:
      "KlikUmroh tidak meminta travel mengganti seluruh cara kerja. Sistem ini fokus membereskan bagian yang selama ini tercecer.",
  },

  section14Commission: {
    headline: "Agen Bisa Lihat Hasil Kerjanya Tanpa Harus Terus Tanya Admin.",
    body: "Setelah closing dicatat oleh admin travel, komisi masuk ke ledger dan tampil di dashboard agen.",
    agentViewSiapCair: {
      title: "Agent View — Siap Cair:",
      desc: "Komisi dari closing yang sudah tercatat.",
    },
    agentViewTertunda: {
      title: "Agent View — Tertunda:",
      desc: "Potensi komisi dari jamaah yang masih berada di proses follow-up.",
    },
    supporting:
      "Besaran dan aturan komisi tetap mengikuti kebijakan masing-masing travel.",
    imagePlaceholder:
      "smartphone UI (Siap Cair, Tertunda, Riwayat komisi, Ajukan pencairan).",
  },

  section15DataTrust: {
    headline: "Data Antar Travel Tidak Dicampur.",
    body: "Setiap travel berjalan sebagai tenant terpisah. Data agen, prospek, paket, dan aktivitas travel Anda tidak menjadi satu kumpulan bersama travel lain. KlikUmroh juga dirancang dengan access log agar akses staf untuk kebutuhan support dapat dicatat dan diaudit.",
    supportingPoints: [
      "Data tiap travel terisolasi.",
      "Branding tiap travel terpisah.",
      "Akses support dapat dilacak melalui log akses.",
    ],
    imagePlaceholder:
      "diagram tiga tenant terpisah (Travel A, Travel B, Travel C), masing-masing kotak sendiri.",
  },

  section16SocialProof: {
    headline: "Dibuat dari Masalah yang Memang Terjadi di Travel Umroh.",
    body: "KlikUmroh lahir dari temuan di lapangan: ada travel yang sudah mengeluarkan budget besar untuk iklan, sementara jaringan agennya justru membawa jamaah lebih banyak tetapi belum pernah dibina dan diukur dengan serius. Dari situ pertanyaannya sederhana: kalau channel agen ternyata bekerja, kenapa tidak dikelola dengan sistem yang lebih jelas?",
    // TODO: isi testimoni asli dari design partner, jangan pakai data karangan
    placeholderComment:
      "// TODO: isi testimoni asli dari design partner, jangan pakai data karangan",
    formatTemplate: "kutipan + Nama Owner + Nama Travel",
  },

  section17FAQ: {
    headline: "Pertanyaan yang Biasanya Ditanyakan Owner Travel",
    items: [
      {
        question: "Apakah KlikUmroh menggantikan ERP yang sudah kami pakai?",
        answer:
          "Tidak. KlikUmroh fokus pada lead generation, channel agen, referral, follow-up prospek, aktivasi agen, komisi, dan analytics. Sistem operasional seperti dokumen, visa, akuntansi, dan keberangkatan tetap bisa memakai sistem Anda sekarang.",
      },
      {
        question: "Apakah jamaah akan melihat brand KlikUmroh?",
        answer:
          "Fokus pengalaman publik tetap pada brand travel Anda. Logo, warna, website, dan custom domain bisa mengikuti identitas travel.",
      },
      {
        question: "Bagaimana sistem tahu jamaah berasal dari agen mana?",
        answer:
          "Setiap agen punya referral link unik. Ketika calon jamaah masuk melalui referral dan mengisi form minat, sumber agen ikut tercatat.",
      },
      {
        question:
          "Kalau kami sudah punya banyak agen, apakah harus daftar ulang dari nol?",
        answer:
          "Tidak harus membangun jaringannya dari nol. KlikUmroh memang ditujukan juga untuk travel yang sudah punya agen tetapi belum punya sistem pengelolaan dan aktivasi yang rapi.",
      },
      {
        question: "Apakah agen harus pakai laptop?",
        answer:
          "Tidak. Dashboard agen dirancang mobile-first supaya nyaman dipakai dari smartphone.",
      },
      {
        question: "Apakah travel bisa mengatur komisi sendiri?",
        answer:
          "Ya. Nilai komisi per paket dan pengaturan sistem agen berada di bawah kebijakan travel.",
      },
      {
        question: "Apakah data kami bercampur dengan travel lain?",
        answer:
          "Tidak. Setiap travel memiliki tenant dan data yang terisolasi.",
      },
      {
        question: "Kalau lead masuk lewat WhatsApp langsung bagaimana?",
        answer:
          "Agen tetap bisa menambahkan jamaah secara manual dari dashboard agar lead tersebut tidak hilang dari pencatatan funnel.",
      },
    ],
  },

  section18FinalCTA: {
    headline: "Kalau Agen Sudah Ada, Sekarang Tinggal Rapikan Sistemnya.",
    subheadline:
      "Lihat bagaimana KlikUmroh membantu travel mengelola referral, jamaah, aktivitas agen, komisi, dan performa channel dalam satu sistem whitelabel.",
    ctaPrimary: "Jadwalkan Demo KlikUmroh",
    ctaSecondary: "Lihat Fitur Lengkap",
    microcopy: "Demo untuk owner dan tim travel. Bukan untuk calon jamaah.",
    imagePlaceholder:
      "product collage tipis di background (dashboard admin, dashboard agen, website travel), fokus tetap pada CTA.",
  },

  section19Footer: {
    product: {
      title: "Product",
      links: [
        { label: "Fitur", href: "#fitur" },
        { label: "Cara Kerja", href: "#cara-kerja" },
        { label: "Sistem Agen", href: "#sistem-agen" },
        { label: "Harga", href: "/harga" },
      ],
    },
    company: {
      title: "Company",
      links: [
        { label: "Tentang KlikUmroh", href: "#" },
        { label: "Kontak", href: WHATSAPP_DEMO_URL },
        { label: "FAQ", href: "#faq" },
      ],
    },
    legal: {
      title: "Legal",
      links: [
        { label: "Kebijakan Privasi", href: "#" },
        { label: "Syarat & Ketentuan", href: "#" },
      ],
    },
    closingLine: "KlikUmroh.id — Sistem Agen & Affiliate Umroh Whitelabel",
  },

  hargaPage: {
    title: "Harga",
    body: "Harga disesuaikan dengan kebutuhan travel Anda — hubungi kami untuk info lengkap",
    cta: "Jadwalkan Demo",
  },
};
