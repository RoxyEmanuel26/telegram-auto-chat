import { PrismaClient, ParseMode, MediaType } from '@prisma/client';

const prisma = new PrismaClient();

const defaultTemplates = [
  // Category: NSFW
  {
    name: 'Promo Konten Eksklusif (Premium)',
    content: '🔥 <b>NEW EXCLUSIVE CONTENT DROP!</b> 🔥\n\nHai sayang! Video terbaruku yang paling ditunggu-tunggu sudah rilis hari ini! 🙈\n\nDapatkan akses penuh ke video durasi panjang tanpa sensor dan obrolan chat pribadi 1-on-1 langsung denganku.\n\nHubungi bot ini atau klik link di bawah untuk bergabung ke VIP Channel sekarang! 👇',
    category: 'NSFW',
    parseMode: ParseMode.HTML,
    mediaType: MediaType.PHOTO,
    mediaUrl: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=800&auto=format&fit=crop&q=60', // Placeholder image URL
    isPublic: true,
  },
  {
    name: 'Penawaran PPV Interaktif',
    content: '💋 <b>SPECIAL PPV OFFER! 💋</b>\n\nHanya untuk 50 orang tercepat malam ini! Aku punya video super hot yang belum pernah dipublikasikan di mana pun.\n\nMau tahu apa yang aku lakukan saat sendirian di kamar mandi? 🛁\n\nBalas pesan ini atau klik tombol di bawah untuk membuka kunci konten sekarang sebelum kehabisan slot promo!',
    category: 'NSFW',
    parseMode: ParseMode.HTML,
    mediaType: MediaType.PHOTO,
    mediaUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&auto=format&fit=crop&q=60',
    isPublic: true,
  },
  {
    name: 'Teaser Konten VIP & Benefit',
    content: '✨ <b>BENEFIT GABUNG VIP CHANNEL</b> ✨\n\nMau lebih dekat denganku setiap hari? Ini yang akan kamu dapatkan di VIP member group:\n• Update foto & video tanpa sensor setiap hari 📸\n• Custom request foto/video manja 🧸\n• Chat pribadi prioritas langsung denganku 💬\n• Live streaming eksklusif mingguan 🎥\n\nYuk gabung sekarang dan rasakan sensasinya! Klik link di bawah untuk bergabung.',
    category: 'NSFW',
    parseMode: ParseMode.HTML,
    mediaType: MediaType.PHOTO,
    mediaUrl: 'https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop&q=60',
    isPublic: true,
  },

  // Category: Cosplay NSFW
  {
    name: 'Teaser Cosplay Anime Seksi',
    content: '🌸 <b>COSPLAY EXCLUSIVE SHOWCASE</b> 🌸\n\nKarakter anime favoritmu kini hadir dalam versi yang jauh lebih berani dan nakal! ⛩️✨\n\nAku baru saja menyelesaikan photoshoot terbaru mengenakan kostum Waifu impianmu dengan sentuhan seksi tanpa sensor.\n\nLihat seluruh galeri foto HD (20+ foto) dan video balik layar pembuatan kostumnya di platform VIP-ku! 👇',
    category: 'Cosplay NSFW',
    parseMode: ParseMode.HTML,
    mediaType: MediaType.PHOTO,
    mediaUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=60',
    isPublic: true,
  },
  {
    name: 'Request Kostum Waifu Nakal',
    content: '🎮 <b>VOTE KOSTUM WAIFU BERIKUTNYA!</b> 🎮\n\nHalo sayang! Di cosplay project bulan ini, aku ingin kamu yang menentukan kostum nakal apa yang harus aku pakai selanjutnya!\n\nPilihan kostum:\n1. Maid Seksi Klasik 🧹\n2. Bunny Girl Manja 🐰\n3. Uniform Sekolah Nakal 🎒\n\nSemua foto dan video hasil photoshoot akan dibagikan eksklusif untuk VIP members. Klik tombol di bawah untuk memberikan suaramu!',
    category: 'Cosplay NSFW',
    parseMode: ParseMode.HTML,
    mediaType: MediaType.PHOTO,
    mediaUrl: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=800&auto=format&fit=crop&q=60',
    isPublic: true,
  },
  {
    name: 'Behind The Scenes Cosplay (BTS)',
    content: '📸 <b>BEHIND THE SCENES SNEAK PEEK!</b> 📸\n\nHari ini seru banget! Aku baru saja menyelesaikan photoshoot cosplay yang super hot. Ini ada sedikit bocoran video balik layar (BTS) pas aku ganti kostum dan pose manja di studio.\n\nVideo BTS durasi penuh 15 menit dan galeri foto mentahnya hanya tersedia untuk pelanggan setia bulan ini.\n\nGabung sekarang lewat tombol di bawah dan nikmati semua kontennya! 🥰',
    category: 'Cosplay NSFW',
    parseMode: ParseMode.HTML,
    mediaType: MediaType.VIDEO,
    mediaUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', // Safe sample video URL
    isPublic: true,
  }
];

async function main() {
  console.log('Starting template seeding...');

  // 1. Get or create a default user
  let user = await prisma.user.findFirst();
  
  if (!user) {
    console.log('No user found in the database. Creating a default system administrator...');
    user = await prisma.user.create({
      data: {
        email: 'admin@telehub.com',
        name: 'System Admin',
        password: '$2b$10$tZ2y542B7l.i11lZkC9vfe3m0yG3dM3G3dM3G3dM3G3dM3G3dM3G3', // Dummy hash
        role: 'ADMIN'
      }
    });
  }

  console.log(`Templates will be associated with author ID: ${user.id} (${user.name})`);

  let createdCount = 0;
  let skippedCount = 0;

  for (const tpl of defaultTemplates) {
    const existing = await prisma.template.findFirst({
      where: {
        name: tpl.name,
        category: tpl.category
      }
    });

    if (existing) {
      console.log(`Template "${tpl.name}" in category "${tpl.category}" already exists. Skipping.`);
      skippedCount++;
      continue;
    }

    await prisma.template.create({
      data: {
        name: tpl.name,
        content: tpl.content,
        category: tpl.category,
        parseMode: tpl.parseMode,
        mediaType: tpl.mediaType,
        mediaUrl: tpl.mediaUrl,
        isPublic: tpl.isPublic,
        authorId: user.id
      }
    });
    console.log(`Created template: "${tpl.name}" in category "${tpl.category}"`);
    createdCount++;
  }

  console.log(`Seeding finished. Created: ${createdCount}, Skipped: ${skippedCount}`);
}

main()
  .catch((e) => {
    console.error('Error seeding templates:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
