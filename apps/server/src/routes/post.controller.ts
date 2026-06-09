import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { broadcastQueue } from '../services/queue.service';
import { PostStatus, TargetStatus, RecurrenceType, ParseMode } from 'shared';
import parser from 'cron-parser';

export const createPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title,
      content,
      parseMode,
      botId,
      channelIds,
      mediaType,
      mediaUrl,
      mediaCaption,
      inlineKeyboard,
      disableNotification,
      protectContent,
      disableWebPagePreview,
      status, // DRAFT or SEND_NOW or SCHEDULED
      scheduledAt, // Optional DateTime string
      recurrence // Optional { type: RecurrenceType, cronExpression: string }
    } = req.body;

    if (!title || !content || !botId || !channelIds || !Array.isArray(channelIds) || channelIds.length === 0) {
      res.status(400).json({ error: 'Data post tidak lengkap (Judul, Konten, Bot, dan Channel Target wajib diisi)' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    // Determine initial status based on input parameters
    let initialStatus = PostStatus.DRAFT;
    if (status === 'SEND_NOW') {
      initialStatus = PostStatus.QUEUED;
    } else if (scheduledAt || recurrence) {
      initialStatus = PostStatus.SCHEDULED;
    }

    // Create Post and Targets within a Prisma Transaction
    const post = await prisma.$transaction(async (tx: any) => {
      // 1. Create the Post
      const newPost = await tx.post.create({
        data: {
          title,
          content,
          parseMode: parseMode || ParseMode.HTML,
          botId,
          mediaType: mediaType || 'NONE',
          mediaUrl: mediaUrl || null,
          mediaCaption: mediaCaption || null,
          inlineKeyboard: inlineKeyboard ? JSON.parse(JSON.stringify(inlineKeyboard)) : null,
          disableNotification: !!disableNotification,
          protectContent: !!protectContent,
          disableWebPagePreview: !!disableWebPagePreview,
          status: initialStatus,
          authorId: req.user!.id,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        }
      });

      // 2. Create Post Targets
      const targetData = channelIds.map((channelId: string) => ({
        postId: newPost.id,
        channelId,
        status: TargetStatus.PENDING
      }));

      await tx.postTarget.createMany({
        data: targetData
      });

      // 3. Handle Recurrence if specified
      if (recurrence && recurrence.type && recurrence.cronExpression) {
        let nextRunAt = new Date();
        try {
          const cronInterval = parser.parseExpression(recurrence.cronExpression);
          nextRunAt = cronInterval.next().toDate();
        } catch (err) {
          throw new Error('Format Cron Expression tidak valid');
        }

        await tx.scheduleRecurrence.create({
          data: {
            postId: newPost.id,
            type: recurrence.type as RecurrenceType,
            cronExpression: recurrence.cronExpression,
            nextRunAt,
            isActive: true
          }
        });
      }

      return newPost;
    });

    // 4. Queue immediate OR delayed job
    if (initialStatus === PostStatus.QUEUED) {
      await broadcastQueue.add('broadcast-job', { postId: post.id }, { jobId: post.id });
      logger.info(`Post ${post.id} added to the immediate broadcast queue.`);
    } else if (initialStatus === PostStatus.SCHEDULED && scheduledAt && !recurrence) {
      // Calculate delay in ms
      const delay = new Date(scheduledAt).getTime() - Date.now();
      if (delay > 0) {
        await broadcastQueue.add('broadcast-job', { postId: post.id }, { delay, jobId: post.id });
        logger.info(`Post ${post.id} scheduled for future delivery (delay: ${delay}ms).`);
      } else {
        // If date is in the past, send immediately
        await prisma.post.update({
          where: { id: post.id },
          data: { status: PostStatus.QUEUED }
        });
        await broadcastQueue.add('broadcast-job', { postId: post.id }, { jobId: post.id });
        logger.info(`Post ${post.id} scheduled date was in the past; sent immediately.`);
      }
    }

    res.status(201).json({ message: 'Post berhasil dibuat', post });
  } catch (error: any) {
    logger.error(`Create post error: ${error}`);
    res.status(500).json({ error: error.message || 'Gagal membuat posting' });
  }
};

export const getPosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const posts = await prisma.post.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        bot: {
          select: { name: true, username: true }
        },
        author: {
          select: { name: true }
        },
        recurrences: {
          where: { isActive: true }
        },
        _count: {
          select: { targets: true }
        }
      }
    });

    res.status(200).json({ posts });
  } catch (error) {
    logger.error(`Get posts error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil daftar posting' });
  }
};

export const getPostDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        bot: {
          select: { id: true, name: true, username: true }
        },
        author: {
          select: { name: true }
        },
        recurrences: true,
        targets: {
          include: {
            channel: {
              select: { name: true, username: true, chatId: true }
            }
          }
        }
      }
    });

    if (!post) {
      res.status(404).json({ error: 'Postingan tidak ditemukan' });
      return;
    }

    res.status(200).json({ post });
  } catch (error) {
    logger.error(`Get post detail error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil detail postingan' });
  }
};

export const reschedulePost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;

    if (!scheduledAt) {
      res.status(400).json({ error: 'Jadwal baru (scheduledAt) wajib diisi' });
      return;
    }

    const post = await prisma.post.findUnique({
      where: { id },
      include: { recurrences: true }
    });

    if (!post) {
      res.status(404).json({ error: 'Post tidak ditemukan' });
      return;
    }

    if (post.status !== PostStatus.SCHEDULED) {
      res.status(400).json({ error: 'Hanya postingan berseri JADWAL yang dapat di-reschedule' });
      return;
    }

    // 1. Remove old job from queue
    const oldJob = await broadcastQueue.getJob(post.id);
    if (oldJob) {
      await oldJob.remove();
    }

    // 2. Calculate new delay
    const delay = new Date(scheduledAt).getTime() - Date.now();

    // 3. Update DB
    await prisma.post.update({
      where: { id: post.id },
      data: {
        scheduledAt: new Date(scheduledAt)
      }
    });

    // 4. Add new delayed job to BullMQ
    if (delay > 0) {
      await broadcastQueue.add('broadcast-job', { postId: post.id }, { delay, jobId: post.id });
      logger.info(`Post ${post.id} successfully rescheduled for future delivery.`);
    } else {
      // Send immediately if past date
      await prisma.post.update({
        where: { id: post.id },
        data: { status: PostStatus.QUEUED }
      });
      await broadcastQueue.add('broadcast-job', { postId: post.id }, { jobId: post.id });
    }

    res.status(200).json({ message: 'Postingan berhasil dijadwalkan ulang' });
  } catch (error) {
    logger.error(`Reschedule post error: ${error}`);
    res.status(500).json({ error: 'Gagal menjadwalkan ulang postingan' });
  }
};

export const cancelScheduledPost = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id }
    });

    if (!post) {
      res.status(404).json({ error: 'Post tidak ditemukan' });
      return;
    }

    // 1. Remove job from BullMQ
    const job = await broadcastQueue.getJob(post.id);
    if (job) {
      await job.remove();
      logger.info(`Removed scheduled BullMQ job for post ${post.id}`);
    }

    // 2. Deactivate recurrence if exists
    await prisma.scheduleRecurrence.updateMany({
      where: { postId: post.id },
      data: { isActive: false }
    });

    // 3. Set post status to CANCELLED in DB
    await prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.CANCELLED }
    });

    res.status(200).json({ message: 'Penjadwalan postingan berhasil dibatalkan' });
  } catch (error) {
    logger.error(`Cancel schedule error: ${error}`);
    res.status(500).json({ error: 'Gagal membatalkan jadwal postingan' });
  }
};

export const retryFailedTargets = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: { targets: true }
    });

    if (!post) {
      res.status(404).json({ error: 'Post tidak ditemukan' });
      return;
    }

    // Reset failed targets back to PENDING
    const failedTargetIds = post.targets
      .filter((t: any) => t.status === TargetStatus.FAILED)
      .map((t: any) => t.id);

    if (failedTargetIds.length === 0) {
      res.status(400).json({ error: 'Tidak ada target pengiriman yang gagal untuk di-retry' });
      return;
    }

    await prisma.postTarget.updateMany({
      where: { id: { in: failedTargetIds } },
      data: { status: TargetStatus.PENDING, errorMessage: null }
    });

    // Update Post status to QUEUED
    await prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.QUEUED }
    });

    // Trigger queue job
    await broadcastQueue.add('broadcast-job', { postId: post.id }, { jobId: post.id });

    res.status(200).json({ message: 'Pengiriman ulang berhasil dimasukkan ke dalam antrian' });
  } catch (error) {
    logger.error(`Retry failed targets error: ${error}`);
    res.status(500).json({ error: 'Gagal melakukan retry pengiriman' });
  }
};
