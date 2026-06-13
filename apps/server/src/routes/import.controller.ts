import { Request, Response } from 'express';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { broadcastQueue } from '../services/queue.service';
import { PostStatus, TargetStatus, ImportStatus, MediaType } from 'shared';
import { logAction } from '../utils/audit';

const parseGmt7Date = (dateStr: string): Date => {
  const trimmed = dateStr.trim();
  const hasTimezone = /Z|[+-]\d{2}(:?\d{2})?$/.test(trimmed);
  if (!hasTimezone) {
    const formatted = trimmed.replace(' ', 'T');
    const parsed = new Date(formatted + '+07:00');
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(trimmed);
};

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

    // Sanitize filename to prevent Directory Traversal / Arbitrary File Read
    const safeFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), 'uploads', safeFilename);
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

    // Pre-fetch all channels to prevent N+1 queries during loop
    const uniqueChannelsSet = new Set<string>();
    for (const row of rows) {
      const channelsStr = row[Number(mapping.channels)]?.trim();
      if (channelsStr) {
        channelsStr.split(',')
          .map(c => c.trim())
          .filter(c => c.length > 0)
          .forEach(c => uniqueChannelsSet.add(c));
      }
    }
    const allChannelIdentifiers = Array.from(uniqueChannelsSet);

    const dbChannels = allChannelIdentifiers.length > 0
      ? await prisma.telegramChannel.findMany({
          where: {
            OR: [
              { chatId: { in: allChannelIdentifiers } },
              { username: { in: allChannelIdentifiers } }
            ]
          }
        })
      : [];

    const channelMap = new Map<string, any>();
    for (const ch of dbChannels) {
      channelMap.set(ch.chatId, ch);
      if (ch.username) {
        channelMap.set(ch.username, ch);
      }
    }

    // Create BulkImport record
    const bulkImport = await prisma.bulkImport.create({
      data: {
        filename: safeFilename,
        originalName: safeFilename,
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
      { filename: safeFilename, totalRows: rows.length, botId },
      req.ip,
      req.headers['user-agent']
    );

    let successRows = 0;
    let failedRows = 0;
    const errorLogs: Array<{ row: number; error: string }> = [];

    if (importMode === 'ATOMIC') {
      const postsToQueue: Array<{ id: string; status: PostStatus; scheduledAt: Date | null }> = [];
      try {
        await prisma.$transaction(async (tx: any) => {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 1;

            // Extract fields using mapping indexes
            const title = row[Number(mapping.title)]?.trim();
            const content = row[Number(mapping.content)]?.trim();
            const channelsStr = row[Number(mapping.channels)]?.trim();
            const scheduledAtStr = mapping.scheduledAt !== undefined ? row[Number(mapping.scheduledAt)]?.trim() : undefined;
            const mediaUrlStr = mapping.mediaUrl !== undefined ? row[Number(mapping.mediaUrl)]?.trim() : undefined;
            const buttonsStr = mapping.buttons !== undefined ? row[Number(mapping.buttons)]?.trim() : undefined;

            if (!title || !content || !channelsStr) {
              throw new Error(`Kolom Title, Content, atau Target Channels kosong`);
            }

            // Parse channels
            const channelIdsOrUsernames = channelsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
            if (channelIdsOrUsernames.length === 0) {
              throw new Error(`Target channel tidak didefinisikan`);
            }

            // Find channel records in the pre-fetched map
            const channels = channelIdsOrUsernames
              .map(idOrUsername => channelMap.get(idOrUsername))
              .filter((c): c is any => !!c);

            if (channels.length === 0) {
              throw new Error(`Target channel tidak ditemukan di database (${channelsStr})`);
            }

            // Parse scheduled time if provided
            let scheduledAt: Date | null = null;
            let postStatus = PostStatus.DRAFT;

            if (scheduledAtStr) {
              const parsedDate = parseGmt7Date(scheduledAtStr);
              if (isNaN(parsedDate.getTime())) {
                throw new Error(`Format tanggal tidak valid: ${scheduledAtStr}`);
              }
              scheduledAt = parsedDate;
              postStatus = PostStatus.SCHEDULED;
            } else {
              if (defaultBehavior === 'SEND_IMMEDIATE') {
                postStatus = PostStatus.QUEUED;
              } else if (defaultBehavior === 'SCHEDULED') {
                throw new Error(`Mode default terjadwal dipilih tetapi tanggal scheduledAt di CSV kosong`);
              }
            }

            // Determine media type from URL extension
            let mediaType = MediaType.NONE;
            let mediaUrl: string | null = null;
            if (mediaUrlStr) {
              mediaUrl = mediaUrlStr;
              const lowerUrl = mediaUrlStr.toLowerCase();
              if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/)) {
                mediaType = MediaType.PHOTO;
              } else if (lowerUrl.match(/\.(mp4|avi|mov|mkv|webm)$/)) {
                mediaType = MediaType.VIDEO;
              } else if (lowerUrl.match(/\.(mp3|ogg|wav|flac|aac)$/)) {
                mediaType = MediaType.AUDIO;
              } else {
                mediaType = MediaType.PHOTO; // Default to PHOTO for URLs
              }
            }

            // Parse inline keyboard buttons: format "Nama1|URL1;Nama2|URL2"
            let inlineKeyboard: any = null;
            if (buttonsStr) {
              const btnPairs = buttonsStr.split(';').map(b => b.trim()).filter(b => b.length > 0);
              const buttons = btnPairs.map(pair => {
                const [text, url] = pair.split('|').map(s => s.trim());
                return text && url ? { text, url } : null;
              }).filter((b): b is { text: string; url: string } => b !== null);
              if (buttons.length > 0) {
                inlineKeyboard = { inline_keyboard: [buttons] };
              }
            }

            // Create the post
            const newPost = await tx.post.create({
              data: {
                title,
                content,
                botId,
                status: postStatus,
                scheduledAt,
                authorId: req.user!.id,
                mediaType,
                mediaUrl,
                inlineKeyboard: inlineKeyboard ? JSON.parse(JSON.stringify(inlineKeyboard)) : null,
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

            postsToQueue.push({ id: newPost.id, status: postStatus, scheduledAt });
          }
        });

        // Queue immediate or delayed broadcast jobs only after transaction commits successfully
        for (const post of postsToQueue) {
          if (post.status === PostStatus.QUEUED) {
            await broadcastQueue.add('broadcast-job', { postId: post.id }, { jobId: post.id });
          } else if (post.status === PostStatus.SCHEDULED && post.scheduledAt) {
            const delay = post.scheduledAt.getTime() - Date.now();
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
        }

        successRows = rows.length;
      } catch (err: any) {
        failedRows = rows.length;
        errorLogs.push({ row: 0, error: err.message || 'Import ATOMIC gagal' });

        await prisma.bulkImport.update({
          where: { id: bulkImport.id },
          data: {
            processedRows: rows.length,
            successRows: 0,
            failedRows: rows.length,
            status: ImportStatus.FAILED,
            errorLog: JSON.parse(JSON.stringify(errorLogs)),
            completedAt: new Date()
          }
        });

        await logAction(
          req.user.id,
          'CSV_IMPORT_COMPLETE',
          'BulkImport',
          bulkImport.id,
          null,
          { successRows: 0, failedRows: rows.length, status: ImportStatus.FAILED },
          req.ip,
          req.headers['user-agent']
        );

        const msg = process.env.NODE_ENV === 'production'
          ? 'Terjadi kesalahan saat memproses import mode ATOMIC'
          : (err.message || 'Terjadi kesalahan saat memproses import mode ATOMIC');

        res.status(400).json({
          error: msg,
          total: rows.length,
          success: 0,
          failed: rows.length,
          errors: errorLogs
        });
        return;
      }
    } else {
      // PARTIAL mode: each row runs in its own transaction
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 1;

        try {
          // Extract fields using mapping indexes
          const title = row[Number(mapping.title)]?.trim();
          const content = row[Number(mapping.content)]?.trim();
          const channelsStr = row[Number(mapping.channels)]?.trim();
          const scheduledAtStr = mapping.scheduledAt !== undefined ? row[Number(mapping.scheduledAt)]?.trim() : undefined;
          const mediaUrlStr = mapping.mediaUrl !== undefined ? row[Number(mapping.mediaUrl)]?.trim() : undefined;
          const buttonsStr = mapping.buttons !== undefined ? row[Number(mapping.buttons)]?.trim() : undefined;

          if (!title || !content || !channelsStr) {
            throw new Error('Kolom Title, Content, atau Target Channels kosong');
          }

          // Parse channels
          const channelIdsOrUsernames = channelsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
          if (channelIdsOrUsernames.length === 0) {
            throw new Error('Target channel tidak didefinisikan');
          }

          // Find channel records in the pre-fetched map (0 query cost)
          const channels = channelIdsOrUsernames
            .map(idOrUsername => channelMap.get(idOrUsername))
            .filter((c): c is any => !!c);

          if (channels.length === 0) {
            throw new Error(`Target channel tidak ditemukan di database (${channelsStr})`);
          }

          // Parse scheduled time if provided
          let scheduledAt: Date | null = null;
          let postStatus = PostStatus.DRAFT;

          if (scheduledAtStr) {
            const parsedDate = parseGmt7Date(scheduledAtStr);
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

          // Determine media type from URL extension
          let mediaType = MediaType.NONE;
          let mediaUrl: string | null = null;
          if (mediaUrlStr) {
            mediaUrl = mediaUrlStr;
            const lowerUrl = mediaUrlStr.toLowerCase();
            if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/)) {
              mediaType = MediaType.PHOTO;
            } else if (lowerUrl.match(/\.(mp4|avi|mov|mkv|webm)$/)) {
              mediaType = MediaType.VIDEO;
            } else if (lowerUrl.match(/\.(mp3|ogg|wav|flac|aac)$/)) {
              mediaType = MediaType.AUDIO;
            } else {
              mediaType = MediaType.PHOTO; // Default to PHOTO for URLs
            }
          }

          // Parse inline keyboard buttons: format "Nama1|URL1;Nama2|URL2"
          let inlineKeyboard: any = null;
          if (buttonsStr) {
            const btnPairs = buttonsStr.split(';').map(b => b.trim()).filter(b => b.length > 0);
            const buttons = btnPairs.map(pair => {
              const [text, url] = pair.split('|').map(s => s.trim());
              return text && url ? { text, url } : null;
            }).filter((b): b is { text: string; url: string } => b !== null);
            if (buttons.length > 0) {
              inlineKeyboard = { inline_keyboard: [buttons] };
            }
          }

          // Create the post
          const post = await prisma.$transaction(async (tx: any) => {
            const newPost = await tx.post.create({
              data: {
                title,
                content,
                botId,
                status: postStatus,
                scheduledAt,
                authorId: req.user!.id,
                mediaType,
                mediaUrl,
                inlineKeyboard: inlineKeyboard ? JSON.parse(JSON.stringify(inlineKeyboard)) : null,
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
    const msg = process.env.NODE_ENV === 'production'
      ? 'Terjadi kesalahan saat memproses import'
      : (error.message || 'Terjadi kesalahan saat memproses import');
    res.status(500).json({ error: msg });
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
