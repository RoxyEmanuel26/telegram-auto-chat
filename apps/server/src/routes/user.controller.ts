import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { UserRole } from 'shared';
import { logAction } from '../utils/audit';

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true
      }
    });

    res.status(200).json({ users });
  } catch (error) {
    logger.error(`Get users error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil daftar pengguna' });
  }
};

export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !Object.values(UserRole).includes(role)) {
      res.status(400).json({ error: 'Role tidak valid' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      return;
    }

    // Don't allow changing own role to avoid lockout
    if (user.id === req.user?.id) {
      res.status(400).json({ error: 'Anda tidak dapat mengubah role Anda sendiri' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, name: true, role: true }
    });

    await logAction(
      req.user!.id,
      'USER_ROLE_UPDATE',
      'User',
      id,
      { role: user.role },
      { role },
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({ message: 'Role pengguna berhasil diperbarui', user: updated });
  } catch (error) {
    logger.error(`Update user role error: ${error}`);
    res.status(500).json({ error: 'Gagal memperbarui role pengguna' });
  }
};

export const updateUserStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive === undefined) {
      res.status(400).json({ error: 'Status isActive wajib disertakan' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      return;
    }

    // Don't allow deactivating self
    if (user.id === req.user?.id) {
      res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, name: true, isActive: true }
    });

    await logAction(
      req.user!.id,
      'USER_STATUS_UPDATE',
      'User',
      id,
      { isActive: user.isActive },
      { isActive },
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({ message: `Status pengguna berhasil diubah`, user: updated });
  } catch (error) {
    logger.error(`Update user status error: ${error}`);
    res.status(500).json({ error: 'Gagal mengubah status aktif pengguna' });
  }
};

export const getAuditLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    res.status(200).json({ logs });
  } catch (error) {
    logger.error(`Get audit logs error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil log audit' });
  }
};
