import { Request, Response } from 'express';
import { UserRole } from 'shared';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { encrypt, decrypt } from '../utils/crypto';
import fs from 'fs';
import path from 'path';

let TELEGRAM_API_URL = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
if (TELEGRAM_API_URL && !TELEGRAM_API_URL.startsWith('http://') && !TELEGRAM_API_URL.startsWith('https://')) {
  TELEGRAM_API_URL = `https://${TELEGRAM_API_URL}`;
}
if (TELEGRAM_API_URL.endsWith('/')) {
  TELEGRAM_API_URL = TELEGRAM_API_URL.slice(0, -1);
}

// Helper to log audit events
const logAuditEvent = async (userId: string, action: string, resource: string, resourceId: string, extra: any = {}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        newValue: extra.newVal || undefined,
        oldValue: extra.oldVal || undefined,
      }
    });
  } catch (err) {
    logger.error(`Audit log creation failed: ${err}`);
  }
};

// Ensure uploads/avatars directory exists
const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

/**
 * Fetch the Telegram bot's profile photo and cache it locally as a file.
 * Returns the relative URL path to the cached avatar, or null if no photo found.
 */
const fetchAndCacheBotAvatar = async (token: string, botDbId: string): Promise<string | null> => {
  try {
    const botUserId = token.split(':')[0];

    // 1. Get bot's profile photos from Telegram
    const photosRes = await fetch(`${TELEGRAM_API_URL}/bot${token}/getUserProfilePhotos?user_id=${botUserId}`);
    const photosData: any = await photosRes.json();

    if (!photosData.ok || !photosData.result || photosData.result.total_count === 0) {
      logger.info(`Bot ${botDbId}: No profile photo found on Telegram.`);
      return null;
    }

    // Get the best quality photo (last in the sizes array = largest)
    const photoSizes = photosData.result.photos[0];
    const photo = photoSizes[photoSizes.length - 1] || photoSizes[0];
    const fileId = photo.file_id;

    // 2. Get file path from Telegram
    const fileRes = await fetch(`${TELEGRAM_API_URL}/bot${token}/getFile?file_id=${fileId}`);
    const fileData: any = await fileRes.json();

    if (!fileData.ok || !fileData.result?.file_path) {
      logger.warn(`Bot ${botDbId}: Could not get file path for profile photo.`);
      return null;
    }

    const filePath = fileData.result.file_path;
    const ext = path.extname(filePath) || '.jpg';

    // 3. Download the actual image from Telegram
    const imageRes = await fetch(`${TELEGRAM_API_URL}/file/bot${token}/${filePath}`);
    if (!imageRes.ok) {
      logger.warn(`Bot ${botDbId}: Failed to download profile photo from Telegram (status ${imageRes.status}).`);
      return null;
    }

    // 4. Save to local filesystem
    const filename = `${botDbId}${ext}`;
    const localPath = path.join(AVATAR_DIR, filename);
    const arrayBuffer = await imageRes.arrayBuffer();
    fs.writeFileSync(localPath, Buffer.from(arrayBuffer));

    logger.info(`Bot ${botDbId}: Profile photo cached to ${localPath}`);
    return `/uploads/avatars/${filename}`;
  } catch (err: any) {
    logger.error(`fetchAndCacheBotAvatar error for bot ${botDbId}: ${err.message || err}`);
    return null;
  }
};

export const addBot = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, name, description } = req.body;

    if (!token || !name) {
      res.status(400).json({ error: 'Token bot dan Nama internal wajib diisi' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    // 1. Verify token with Telegram Bot API
    const telegramRes = await fetch(`${TELEGRAM_API_URL}/bot${token}/getMe`);
    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
      res.status(400).json({ error: 'Token Telegram Bot tidak valid atau tidak dapat diakses' });
      return;
    }

    const { username, first_name } = telegramData.result;

    // 2. Check if bot already exists
    const existing = await prisma.telegramBot.findFirst({
      where: { username }
    });

    if (existing) {
      res.status(400).json({ error: `Bot @${username} sudah terdaftar di sistem` });
      return;
    }

    // 3. Encrypt Bot Token
    const encryptedToken = encrypt(token);

    // 4. Save to DB
    const bot = await prisma.telegramBot.create({
      data: {
        name,
        token: encryptedToken,
        username,
        description: description || null,
        ownerId: req.user.id,
        isActive: true,
      }
    });

    // 5. Fetch and cache the Telegram profile photo
    let avatarUrl: string | null = null;
    try {
      avatarUrl = await fetchAndCacheBotAvatar(token, bot.id);
    } catch (e) {
      logger.warn(`Could not fetch avatar during bot registration: ${e}`);
    }

    // If no avatar fetched, use the dynamic proxy endpoint as fallback
    if (!avatarUrl) {
      avatarUrl = `/bots/${bot.id}/avatar`;
    }

    // 6. Update DB with avatar URL
    const updatedBot = await prisma.telegramBot.update({
      where: { id: bot.id },
      data: { avatarUrl },
      select: {
        id: true,
        name: true,
        username: true,
        description: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true
      }
    });

    await logAuditEvent(req.user.id, 'BOT_ADD', 'TelegramBot', bot.id, { newVal: { name, username } });

    res.status(201).json({ message: 'Bot berhasil ditambahkan', bot: updatedBot });
  } catch (error: any) {
    logger.error(`Add bot error: ${error}`);
    res.status(500).json({ error: `Terjadi kesalahan internal saat menambahkan bot: ${error.message || error}` });
  }
};

export const getBots = async (req: Request, res: Response): Promise<void> => {
  try {
    const bots = await prisma.telegramBot.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        username: true,
        description: true,
        isActive: true,
        avatarUrl: true,
        createdAt: true,
        _count: {
          select: { channels: true }
        }
      }
    });

    res.status(200).json({ bots });
  } catch (error) {
    logger.error(`Get bots error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil daftar bot' });
  }
};

export const testConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const bot = await prisma.telegramBot.findUnique({
      where: { id }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot tidak ditemukan' });
      return;
    }

    // Decrypt the token
    const token = decrypt(bot.token);

    // Call Telegram getMe
    const telegramRes = await fetch(`${TELEGRAM_API_URL}/bot${token}/getMe`);
    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
      // Update bot status to inactive if connection fails
      await prisma.telegramBot.update({
        where: { id: bot.id },
        data: { isActive: false }
      });
      res.status(200).json({
        success: false,
        error: telegramData.description || 'Koneksi gagal'
      });
      return;
    }

    res.status(200).json({
      success: true,
      botInfo: telegramData.result
    });
  } catch (error: any) {
    logger.error(`Test bot connection error: ${error}`);
    res.status(500).json({ error: `Gagal melakukan tes koneksi bot: ${error.message || error}` });
  }
};

export const deleteBot = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const bot = await prisma.telegramBot.findUnique({
      where: { id }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot tidak ditemukan' });
      return;
    }

    // Role verification (only ADMIN or Bot Owner can delete)
    if (req.user.role !== UserRole.ADMIN && bot.ownerId !== req.user.id) {
      res.status(403).json({ error: 'Akses ditolak: Anda bukan admin atau pemilik bot ini' });
      return;
    }

    await prisma.telegramBot.delete({
      where: { id }
    });

    // Clean up cached avatar file(s)
    try {
      const avatarFiles = fs.readdirSync(AVATAR_DIR).filter(f => f.startsWith(id));
      for (const f of avatarFiles) {
        fs.unlinkSync(path.join(AVATAR_DIR, f));
      }
    } catch (e) {
      logger.warn(`Could not clean up avatar file for bot ${id}: ${e}`);
    }

    await logAuditEvent(req.user.id, 'BOT_DELETE', 'TelegramBot', id, { oldVal: { name: bot.name, username: bot.username } });

    res.status(200).json({ message: 'Bot berhasil dihapus' });
  } catch (error: any) {
    logger.error(`Delete bot error: ${error}`);
    res.status(500).json({ error: `Gagal menghapus bot: ${error.message || error}` });
  }
};

export const getBotAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const bot = await prisma.telegramBot.findUnique({
      where: { id }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot tidak ditemukan' });
      return;
    }

    // Check if we have a cached avatar file on disk
    const avatarFiles = fs.readdirSync(AVATAR_DIR).filter(f => f.startsWith(id));
    if (avatarFiles.length > 0) {
      const cachedFilePath = path.join(AVATAR_DIR, avatarFiles[0]);
      const ext = path.extname(avatarFiles[0]).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(cachedFilePath);
      return;
    }

    // No cached avatar — try to fetch from Telegram and cache it
    let token: string;
    try {
      token = decrypt(bot.token);
    } catch {
      res.status(404).json({ error: 'Gagal mendekripsi token bot' });
      return;
    }

    const avatarUrl = await fetchAndCacheBotAvatar(token, id);
    if (avatarUrl) {
      // Update the DB with the new cached static path
      await prisma.telegramBot.update({
        where: { id },
        data: { avatarUrl }
      });

      // Serve the newly cached file
      const newFiles = fs.readdirSync(AVATAR_DIR).filter(f => f.startsWith(id));
      if (newFiles.length > 0) {
        const newFilePath = path.join(AVATAR_DIR, newFiles[0]);
        const ext = path.extname(newFiles[0]).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.png': 'image/png', '.gif': 'image/gif',
          '.webp': 'image/webp'
        };
        res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(newFilePath);
        return;
      }
    }

    // Fallback: No avatar available
    res.status(404).json({ error: 'Avatar tidak ditemukan di Telegram' });
  } catch (error: any) {
    logger.error(`Get bot avatar error: ${error}`);
    res.status(500).json({ error: `Terjadi kesalahan internal saat mengambil avatar: ${error.message || error}` });
  }
};

/**
 * Manually trigger a refresh of a bot's cached avatar photo from Telegram.
 */
export const refreshBotAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const bot = await prisma.telegramBot.findUnique({
      where: { id }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot tidak ditemukan' });
      return;
    }

    let token: string;
    try {
      token = decrypt(bot.token);
    } catch {
      res.status(400).json({ error: 'Gagal mendekripsi token bot' });
      return;
    }

    // Delete old cached avatar file(s)
    const oldFiles = fs.readdirSync(AVATAR_DIR).filter(f => f.startsWith(id));
    for (const f of oldFiles) {
      fs.unlinkSync(path.join(AVATAR_DIR, f));
    }

    // Fetch fresh avatar from Telegram
    const avatarUrl = await fetchAndCacheBotAvatar(token, id);

    if (avatarUrl) {
      await prisma.telegramBot.update({
        where: { id },
        data: { avatarUrl }
      });
      res.status(200).json({ message: 'Avatar berhasil diperbarui', avatarUrl });
    } else {
      // No photo on Telegram, clear the avatar
      await prisma.telegramBot.update({
        where: { id },
        data: { avatarUrl: null }
      });
      res.status(200).json({ message: 'Bot tidak memiliki foto profil di Telegram', avatarUrl: null });
    }
  } catch (error: any) {
    logger.error(`Refresh bot avatar error: ${error}`);
    res.status(500).json({ error: `Gagal memperbarui avatar: ${error.message || error}` });
  }
};
