import { Request, Response } from 'express';
import { UserRole } from 'shared';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { encrypt, decrypt } from '../utils/crypto';

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
    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
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
      },
      select: {
        id: true,
        name: true,
        username: true,
        description: true,
        isActive: true,
        createdAt: true
      }
    });

    await logAuditEvent(req.user.id, 'BOT_ADD', 'TelegramBot', bot.id, { newVal: { name, username } });

    res.status(201).json({ message: 'Bot berhasil ditambahkan', bot });
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
    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
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
  } catch (error) {
    logger.error(`Test bot connection error: ${error}`);
    res.status(500).json({ error: 'Gagal melakukan tes koneksi bot' });
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

    await logAuditEvent(req.user.id, 'BOT_DELETE', 'TelegramBot', id, { oldVal: { name: bot.name, username: bot.username } });

    res.status(200).json({ message: 'Bot berhasil dihapus' });
  } catch (error) {
    logger.error(`Delete bot error: ${error}`);
    res.status(500).json({ error: 'Gagal menghapus bot' });
  }
};
