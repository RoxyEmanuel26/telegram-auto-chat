import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { ParseMode, MediaType } from 'shared';
import { logAction } from '../utils/audit';

export const createTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      content,
      parseMode,
      mediaType,
      mediaUrl,
      inlineKeyboard,
      tags,
      category,
      isPublic
    } = req.body;

    if (!name || !content) {
      res.status(400).json({ error: 'Nama dan Konten template wajib diisi' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const template = await prisma.template.create({
      data: {
        name,
        content,
        parseMode: parseMode || ParseMode.MARKDOWN,
        mediaType: mediaType || MediaType.NONE,
        mediaUrl: mediaUrl || null,
        inlineKeyboard: inlineKeyboard ? JSON.parse(JSON.stringify(inlineKeyboard)) : null,
        tags: tags || [],
        category: category || 'Custom',
        isPublic: !!isPublic,
        authorId: req.user.id
      }
    });

    await logAction(req.user.id, 'TEMPLATE_CREATE', 'Template', template.id, null, { name, category, isPublic }, req.ip, req.headers['user-agent']);

    res.status(201).json({ message: 'Template berhasil dibuat', template });
  } catch (error) {
    logger.error(`Create template error: ${error}`);
    res.status(500).json({ error: 'Gagal membuat template baru' });
  }
};

export const getTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    // Fetch public templates OR templates created by the current user
    const templates = await prisma.template.findMany({
      where: {
        OR: [
          { isPublic: true },
          { authorId: req.user.id }
        ]
      },
      orderBy: { usageCount: 'desc' },
      include: {
        author: {
          select: { name: true }
        }
      }
    });

    res.status(200).json({ templates });
  } catch (error) {
    logger.error(`Get templates error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil daftar template' });
  }
};

export const getTemplateDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const template = await prisma.template.findUnique({
      where: { id },
      include: {
        author: {
          select: { name: true }
        }
      }
    });

    if (!template) {
      res.status(404).json({ error: 'Template tidak ditemukan' });
      return;
    }

    res.status(200).json({ template, post: template });
  } catch (error) {
    logger.error(`Get template detail error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil detail template' });
  }
};

export const updateTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      content,
      parseMode,
      mediaType,
      mediaUrl,
      inlineKeyboard,
      tags,
      category,
      isPublic
    } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const template = await prisma.template.findUnique({
      where: { id }
    });

    if (!template) {
      res.status(404).json({ error: 'Template tidak ditemukan' });
      return;
    }

    // Only creator can update
    if (template.authorId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden: Anda bukan pembuat template ini' });
      return;
    }

    const updated = await prisma.template.update({
      where: { id },
      data: {
        name,
        content,
        parseMode: parseMode || undefined,
        mediaType: mediaType || undefined,
        mediaUrl: mediaUrl !== undefined ? mediaUrl : undefined,
        inlineKeyboard: inlineKeyboard !== undefined ? (inlineKeyboard ? JSON.parse(JSON.stringify(inlineKeyboard)) : null) : undefined,
        tags: tags || undefined,
        category: category || undefined,
        isPublic: isPublic !== undefined ? !!isPublic : undefined
      }
    });

    await logAction(
      req.user.id,
      'TEMPLATE_UPDATE',
      'Template',
      id,
      { name: template.name, category: template.category, isPublic: template.isPublic },
      { name, category, isPublic },
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({ message: 'Template berhasil diperbarui', template: updated });
  } catch (error) {
    logger.error(`Update template error: ${error}`);
    res.status(500).json({ error: 'Gagal memperbarui template' });
  }
};

export const deleteTemplate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const template = await prisma.template.findUnique({
      where: { id }
    });

    if (!template) {
      res.status(404).json({ error: 'Template tidak ditemukan' });
      return;
    }

    // Only creator can delete
    if (template.authorId !== req.user.id) {
      res.status(403).json({ error: 'Forbidden: Anda bukan pembuat template ini' });
      return;
    }

    await prisma.template.delete({
      where: { id }
    });

    await logAction(
      req.user.id,
      'TEMPLATE_DELETE',
      'Template',
      id,
      { name: template.name, category: template.category },
      null,
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({ message: 'Template berhasil dihapus' });
  } catch (error) {
    logger.error(`Delete template error: ${error}`);
    res.status(500).json({ error: 'Gagal menghapus template' });
  }
};

export const incrementUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const template = await prisma.template.findUnique({
      where: { id }
    });

    if (!template) {
      res.status(404).json({ error: 'Template tidak ditemukan' });
      return;
    }

    await prisma.template.update({
      where: { id },
      data: {
        usageCount: { increment: 1 }
      }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error(`Increment usage error: ${error}`);
    res.status(500).json({ error: 'Gagal mencatat pemakaian template' });
  }
};
