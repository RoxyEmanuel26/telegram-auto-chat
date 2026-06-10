import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import crypto from 'crypto';
import { dispatchWebhook } from '../services/webhook.service';
import { logAction } from '../utils/audit';
import { UserRole, CreateWebhookSchema } from 'shared';

// SSRF-safe URL validation helper
const isValidWebhookUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    // Block loopback / local IP ranges
    const localHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1'
    ];
    if (localHosts.includes(hostname)) {
      return false;
    }
    // Block private network ranges (10.x.x.x, 192.168.x.x)
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) {
      return false;
    }
    if (hostname.startsWith('172.')) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const secondOctet = parseInt(parts[1], 10);
        if (secondOctet >= 16 && secondOctet <= 31) {
          return false;
        }
      }
    }
    return true;
  } catch (err) {
    return false;
  }
};

export const getWebhooks = async (req: Request, res: Response): Promise<void> => {
  try {
    const webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        bot: {
          select: { name: true, username: true }
        }
      }
    });

    res.status(200).json({ webhooks });
  } catch (error) {
    logger.error(`Get webhooks error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil daftar webhook' });
  }
};

export const createWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = CreateWebhookSchema.safeParse(req.body);
    if (!validated.success) {
      res.status(400).json({ error: validated.error.errors[0].message });
      return;
    }

    const { name, url, events, botId } = validated.data;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    // SSRF URL Validation
    if (!isValidWebhookUrl(url)) {
      res.status(400).json({ error: 'URL webhook tidak valid (tidak boleh menggunakan localhost atau jaringan privat)' });
      return;
    }

    // Verify bot and ownerId
    const bot = await prisma.telegramBot.findUnique({
      where: { id: botId }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot tidak ditemukan' });
      return;
    }

    // Ownership authorization check
    if (bot.ownerId !== req.user.id && req.user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: 'Forbidden: Anda tidak memiliki hak akses untuk mendaftarkan webhook untuk bot ini' });
      return;
    }

    // Generate random secret
    const secret = crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        name,
        url,
        secret,
        events,
        botId,
        isActive: true
      }
    });

    await logAction(
      req.user.id,
      'WEBHOOK_CREATE',
      'Webhook',
      webhook.id,
      null,
      { name, url, events, botId },
      req.ip,
      req.headers['user-agent']
    );

    res.status(201).json({ message: 'Webhook berhasil didaftarkan', webhook });
  } catch (error) {
    logger.error(`Create webhook error: ${error}`);
    res.status(500).json({ error: 'Gagal mendaftarkan webhook baru' });
  }
};

export const updateWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, url, events, isActive } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const webhook = await prisma.webhook.findUnique({ 
      where: { id },
      include: { bot: true }
    });
    if (!webhook) {
      res.status(404).json({ error: 'Webhook tidak ditemukan' });
      return;
    }

    // Ownership authorization check
    if (webhook.bot.ownerId !== req.user.id && req.user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: 'Forbidden: Anda tidak memiliki hak akses untuk mengubah webhook ini' });
      return;
    }

    // SSRF URL Validation if URL is updated
    if (url !== undefined) {
      if (!isValidWebhookUrl(url)) {
        res.status(400).json({ error: 'URL webhook tidak valid (tidak boleh menggunakan localhost atau jaringan privat)' });
        return;
      }
    }

    const updated = await prisma.webhook.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        url: url !== undefined ? url : undefined,
        events: events !== undefined ? events : undefined,
        isActive: isActive !== undefined ? !!isActive : undefined
      }
    });

    await logAction(
      req.user.id,
      'WEBHOOK_UPDATE',
      'Webhook',
      id,
      { name: webhook.name, url: webhook.url, events: webhook.events, isActive: webhook.isActive },
      { name, url, events, isActive },
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({ message: 'Webhook berhasil diperbarui', webhook: updated });
  } catch (error) {
    logger.error(`Update webhook error: ${error}`);
    res.status(500).json({ error: 'Gagal memperbarui webhook' });
  }
};

export const deleteWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const webhook = await prisma.webhook.findUnique({ 
      where: { id },
      include: { bot: true }
    });
    if (!webhook) {
      res.status(404).json({ error: 'Webhook tidak ditemukan' });
      return;
    }

    // Ownership authorization check
    if (webhook.bot.ownerId !== req.user.id && req.user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: 'Forbidden: Anda tidak memiliki hak akses untuk menghapus webhook ini' });
      return;
    }

    await prisma.webhook.delete({ where: { id } });

    await logAction(
      req.user.id,
      'WEBHOOK_DELETE',
      'Webhook',
      id,
      { name: webhook.name, url: webhook.url },
      null,
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({ message: 'Webhook berhasil dihapus' });
  } catch (error) {
    logger.error(`Delete webhook error: ${error}`);
    res.status(500).json({ error: 'Gagal menghapus webhook' });
  }
};

export const testWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const webhook = await prisma.webhook.findUnique({ 
      where: { id },
      include: { bot: true }
    });
    if (!webhook) {
      res.status(404).json({ error: 'Webhook tidak ditemukan' });
      return;
    }

    // Ownership authorization check
    if (webhook.bot.ownerId !== req.user.id && req.user.role !== UserRole.ADMIN) {
      res.status(403).json({ error: 'Forbidden: Anda tidak memiliki hak akses untuk menguji webhook ini' });
      return;
    }

    // Dispatch simulated test ping
    await dispatchWebhook(webhook.botId, 'webhook.test', {
      message: 'Hello! This is a test webhook payload from TeleHub Broadcast Command Center.',
      verified: true
    });

    res.status(200).json({ message: 'Simulasi webhook ping berhasil dikirim ke antrian pengiriman' });
  } catch (error) {
    logger.error(`Test webhook error: ${error}`);
    res.status(500).json({ error: 'Gagal melakukan tes ping webhook' });
  }
};
