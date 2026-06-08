import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to last 50 notifications
    });

    res.status(200).json({ notifications });
  } catch (error) {
    logger.error(`Get notifications error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil notifikasi' });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const notification = await prisma.notification.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!notification) {
      res.status(404).json({ error: 'Notifikasi tidak ditemukan' });
      return;
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });

    res.status(200).json({ success: true, message: 'Notifikasi ditandai telah dibaca' });
  } catch (error) {
    logger.error(`Mark notification as read error: ${error}`);
    res.status(500).json({ error: 'Gagal menandai notifikasi' });
  }
};

export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true }
    });

    res.status(200).json({ success: true, message: 'Semua notifikasi ditandai telah dibaca' });
  } catch (error) {
    logger.error(`Mark all notifications as read error: ${error}`);
    res.status(500).json({ error: 'Gagal memperbarui status notifikasi' });
  }
};
