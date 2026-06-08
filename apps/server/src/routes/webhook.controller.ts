import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import crypto from 'crypto';
import { dispatchWebhook } from '../services/webhook.service';
import { logAction } from '../utils/audit';

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
    const { name, url, events, botId } = req.body;

    if (!name || !url || !events || !botId || !Array.isArray(events) || events.length === 0) {
      res.status(400).json({ error: 'Data webhook tidak lengkap (Nama, URL, Bot, dan minimal 1 Event wajib diisi)' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
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

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      res.status(404).json({ error: 'Webhook tidak ditemukan' });
      return;
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

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      res.status(404).json({ error: 'Webhook tidak ditemukan' });
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

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) {
      res.status(404).json({ error: 'Webhook tidak ditemukan' });
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
