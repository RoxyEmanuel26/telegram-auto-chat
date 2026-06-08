import { Request, Response } from 'express';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { broadcastQueue } from '../services/queue.service';
import { PostStatus, TargetStatus, ImportStatus } from 'shared';
import { logAction } from '../utils/audit';

export const previewImport = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'File CSV tidak ditemukan' });
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', req.file.filename);
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Parse CSV
    const parsed = Papa.parse(fileContent, {
      header: false,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      res.status(400).json({ error: 'Gagal men-parse file CSV: format tidak valid' });
      return;
    }

    const headers = parsed.data[0] as string[];
    const rows = parsed.data.slice(1) as string[][];

    res.status(200).json({
      filename: req.file.filename,
      originalName: req.file.originalname,
      headers,
      previewRows: rows.slice(0, 5),
      totalRows: rows.length
    });
  } catch (error) {
    logger.error(`Preview import error: ${error}`);
    res.status(500).json({ error: 'Gagal membaca preview CSV' });
  }
};

export const processImport = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      filename,
      mapping, // e.g. { title: 0, content: 1, channels: 2, scheduledAt: 3 } (indexes or names)
      botId,
      importMode, // 'PARTIAL' or 'ATOMIC'
      defaultBehavior // 'DRAFT', 'SCHEDULED', 'SEND_IMMEDIATE'
    } = req.body;

    if (!filename || !mapping || !botId) {
      res.status(400).json({ error: 'Konfigurasi import tidak lengkap' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File log import tidak ditemukan' });
      return;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse(fileContent, {
      header: false,
      skipEmptyLines: true,
    });

    const rows = parsed.data.slice(1) as string[][];

    // Create BulkImport record
    const bulkImport = await prisma.bulkImport.create({
      data: {
        filename,
        originalName: filename,
        totalRows: rows.length,
        status: ImportStatus.PROCESSING,
        uploadedById: req.user.id,
        botId,
      }
    });

    await logAction(
      req.user.id,
      'CSV_IMPORT_START',
      'BulkImport',
      bulkImport.id,
      null,
      { filename, totalRows: rows.length, botId },
      req.ip,
      req.headers['user-agent']
    );

    let successRows = 0;
    let failedRows = 0;
    const errorLogs: Array<{ row: number; error: string }> = [];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      try {
        // Extract fields using mapping indexes
        const title = row[Number(mapping.title)]?.trim();
        const content = row[Number(mapping.content)]?.trim();
        const channelsStr = row[Number(mapping.channels)]?.trim();
        const scheduledAtStr = mapping.scheduledAt !== undefined ? row[Number(mapping.scheduledAt)]?.trim() : undefined;

        if (!title || !content || !channelsStr) {
          throw new Error('Kolom Title, Content, atau Target Channels kosong');
        }

        // Parse channels
        const channelIdsOrUsernames = channelsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
        if (channelIdsOrUsernames.length === 0) {
          throw new Error('Target channel tidak didefinisikan');
        }

        // Find channel records in DB
        const channels = await prisma.telegramChannel.findMany({
          where: {
            OR: [
              { chatId: { in: channelIdsOrUsernames } },
              { username: { in: channelIdsOrUsernames } }
            ]
          }
        });

        if (channels.length === 0) {
          throw new Error(`Target channel tidak ditemukan di database (${channelsStr})`);
        }

        // Parse scheduled time if provided
        let scheduledAt: Date | null = null;
        let postStatus = PostStatus.DRAFT;

        if (scheduledAtStr) {
          const parsedDate = new Date(scheduledAtStr);
          if (isNaN(parsedDate.getTime())) {
            throw new Error(`Format tanggal tidak valid: ${scheduledAtStr}`);
          }
          scheduledAt = parsedDate;
          postStatus = PostStatus.SCHEDULED;
        } else {
          if (defaultBehavior === 'SEND_IMMEDIATE') {
            postStatus = PostStatus.QUEUED;
          } else if (defaultBehavior === 'SCHEDULED') {
            throw new Error('Mode default terjadwal dipilih tetapi tanggal scheduledAt di CSV kosong');
          }
        }

        // Create the post
        const post = await prisma.$transaction(async (tx) => {
          const newPost = await tx.post.create({
            data: {
              title,
              content,
              botId,
              status: postStatus,
              scheduledAt,
              authorId: req.user!.id,
            }
          });

          const targetData = channels.map(ch => ({
            postId: newPost.id,
            channelId: ch.id,
            status: TargetStatus.PENDING
          }));

          await tx.postTarget.createMany({
            data: targetData
          });

          return newPost;
        });

        // Queue immediate or delayed broadcast job
        if (postStatus === PostStatus.QUEUED) {
          await broadcastQueue.add('broadcast-job', { postId: post.id }, { jobId: post.id });
        } else if (postStatus === PostStatus.SCHEDULED && scheduledAt) {
          const delay = scheduledAt.getTime() - Date.now();
          if (delay > 0) {
            await broadcastQueue.add('broadcast-job', { postId: post.id }, { delay, jobId: post.id });
          } else {
            // Send immediately if past
            await prisma.post.update({
              where: { id: post.id },
              data: { status: PostStatus.QUEUED }
            });
            await broadcastQueue.add('broadcast-job', { postId: post.id }, { jobId: post.id });
          }
        }

        successRows++;
      } catch (err: any) {
        failedRows++;
        errorLogs.push({ row: rowNum, error: err.message || 'Error tidak diketahui' });
        
        if (importMode === 'ATOMIC') {
          // If atomic mode, abort and throw error to cancel entire import
          throw new Error(`Import dibatalkan di baris ke-${rowNum}: ${err.message}`);
        }
      }
    }

    // Update bulk import status
    const finalStatus = failedRows > 0 ? (successRows > 0 ? ImportStatus.DONE : ImportStatus.FAILED) : ImportStatus.DONE;
    await prisma.bulkImport.update({
      where: { id: bulkImport.id },
      data: {
        processedRows: successRows + failedRows,
        successRows,
        failedRows,
        status: finalStatus,
        errorLog: errorLogs.length > 0 ? JSON.parse(JSON.stringify(errorLogs)) : null,
        completedAt: new Date()
      }
    });

    await logAction(
      req.user.id,
      'CSV_IMPORT_COMPLETE',
      'BulkImport',
      bulkImport.id,
      null,
      { successRows, failedRows, status: finalStatus },
      req.ip,
      req.headers['user-agent']
    );

    res.status(200).json({
      message: 'Proses import selesai',
      total: rows.length,
      success: successRows,
      failed: failedRows,
      errors: errorLogs
    });
  } catch (error: any) {
    logger.error(`Process import error: ${error}`);
    res.status(500).json({ error: error.message || 'Terjadi kesalahan saat memproses import' });
  }
};

export const getImportHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const history = await prisma.bulkImport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: { name: true }
        },
        bot: {
          select: { name: true, username: true }
        }
      }
    });

    res.status(200).json({ history });
  } catch (error) {
    logger.error(`Get import history error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil riwayat import' });
  }
};
