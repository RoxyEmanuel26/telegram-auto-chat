import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { decrypt } from '../utils/crypto';
import { PostStatus, TargetStatus, MediaType } from 'shared';
import { dispatchWebhook } from './webhook.service';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// Setup Redis connection for BullMQ
const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null
});

export const broadcastQueue = new Queue('post-broadcast', {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    }
  }
});

// Helper: send direct request to Telegram API
const sendTelegramRequest = async (token: string, method: string, payload: any) => {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
};

// BullMQ Worker to process broadcasts
const worker = new Worker(
  'post-broadcast',
  async (job: Job) => {
    const { postId } = job.data;
    logger.info(`Starting broadcast job for Post ID: ${postId}`);

    // 1. Fetch Post details
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        bot: true,
        targets: {
          include: { channel: true }
        }
      }
    });

    if (!post) {
      logger.error(`Post not found: ${postId}`);
      throw new Error('Post not found');
    }

    // 2. Set status to SENDING
    await prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.SENDING }
    });

    // Decrypt the bot token
    const token = decrypt(post.bot.token);

    // Parse inline keyboard markup
    let replyMarkup: any = undefined;
    if (post.inlineKeyboard) {
      try {
        const parsedKeyboard = typeof post.inlineKeyboard === 'string' 
          ? JSON.parse(post.inlineKeyboard) 
          : post.inlineKeyboard;
        
        if (parsedKeyboard && Array.isArray(parsedKeyboard.inline_keyboard)) {
          replyMarkup = parsedKeyboard;
        } else if (Array.isArray(parsedKeyboard)) {
          replyMarkup = { inline_keyboard: parsedKeyboard };
        }
      } catch (err) {
        logger.error(`Failed to parse inline keyboard: ${err}`);
      }
    }

    let successCount = 0;
    let failedCount = 0;

    // 3. Loop through targets and send
    for (const target of post.targets) {
      if (target.status !== TargetStatus.PENDING) {
        continue; // Skip already sent/failed targets if retrying
      }

      const chatId = target.channel.chatId;
      let method = 'sendMessage';
      let payload: any = {
        chat_id: chatId,
        reply_markup: replyMarkup,
        disable_notification: post.disableNotification,
        protect_content: post.protectContent,
      };

      // Handle message payload based on media type
      if (post.mediaType === MediaType.NONE) {
        method = 'sendMessage';
        payload.text = post.content;
        payload.parse_mode = 'HTML';
        if (post.disableWebPagePreview) {
          payload.disable_web_page_preview = true;
        }
      } else if (post.mediaType === MediaType.PHOTO && post.mediaUrl) {
        method = 'sendPhoto';
        payload.photo = post.mediaUrl;
        payload.caption = post.mediaCaption || post.content;
        payload.parse_mode = 'HTML';
      } else if (post.mediaType === MediaType.VIDEO && post.mediaUrl) {
        method = 'sendVideo';
        payload.video = post.mediaUrl;
        payload.caption = post.mediaCaption || post.content;
        payload.parse_mode = 'HTML';
      } else if (post.mediaType === MediaType.DOCUMENT && post.mediaUrl) {
        method = 'sendDocument';
        payload.document = post.mediaUrl;
        payload.caption = post.mediaCaption || post.content;
        payload.parse_mode = 'HTML';
      } else if (post.mediaType === MediaType.AUDIO && post.mediaUrl) {
        method = 'sendAudio';
        payload.audio = post.mediaUrl;
        payload.caption = post.mediaCaption || post.content;
        payload.parse_mode = 'HTML';
      } else if (post.mediaType === MediaType.VOICE && post.mediaUrl) {
        method = 'sendVoice';
        payload.voice = post.mediaUrl;
        payload.caption = post.mediaCaption || post.content;
        payload.parse_mode = 'HTML';
      }

      try {
        const responseData = await sendTelegramRequest(token, method, payload);

        if (responseData.ok) {
          // Success
          await prisma.postTarget.update({
            where: { id: target.id },
            data: {
              status: TargetStatus.SENT,
              telegramMessageId: responseData.result.message_id,
              sentAt: new Date()
            }
          });
          successCount++;
        } else {
          // Telegram API returned an error
          await prisma.postTarget.update({
            where: { id: target.id },
            data: {
              status: TargetStatus.FAILED,
              errorMessage: responseData.description || 'Gagal mengirim pesan',
              retryCount: target.retryCount + 1,
              lastRetryAt: new Date()
            }
          });
          failedCount++;
          logger.warn(`Telegram send failed for chat ${chatId}: ${responseData.description}`);
        }
      } catch (err: any) {
        // Network/Connection error
        await prisma.postTarget.update({
          where: { id: target.id },
          data: {
            status: TargetStatus.FAILED,
            errorMessage: err.message || 'Kesalahan jaringan server',
            retryCount: target.retryCount + 1,
            lastRetryAt: new Date()
          }
        });
        failedCount++;
        logger.error(`Network error sending to chat ${chatId}: ${err}`);
      }
    }

    // 4. Update final Post status
    let finalStatus: PostStatus = PostStatus.SENT;
    if (successCount === 0 && failedCount > 0) {
      finalStatus = PostStatus.FAILED;
    } else if (successCount > 0 && failedCount > 0) {
      finalStatus = PostStatus.PARTIAL_SENT;
    }

    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: finalStatus,
        sentAt: new Date()
      }
    });

    // Create system notification for post author
    const notificationTitle = finalStatus === PostStatus.SENT 
      ? `Siaran "${post.title}" Sukses Dikirim`
      : `Siaran "${post.title}" Gagal Sebagian/Seluruhnya`;

    const notificationMessage = finalStatus === PostStatus.SENT
      ? `Pesan siaran Anda "${post.title}" berhasil dikirim ke ${successCount} target channel.`
      : `Pesan siaran Anda "${post.title}" selesai dikirim dengan status ${finalStatus} (${successCount} sukses, ${failedCount} gagal).`;

    await prisma.notification.create({
      data: {
        userId: post.authorId,
        type: finalStatus === PostStatus.SENT ? 'POST_SENT' : 'POST_FAILED',
        title: notificationTitle,
        message: notificationMessage,
        metadata: { postId: post.id, successCount, failedCount }
      }
    }).catch((err: any) => logger.error(`Failed to create notification: ${err}`));

    // Dispatch webhook event
    const eventName = finalStatus === PostStatus.FAILED ? 'post.failed' : 'post.sent';
    await dispatchWebhook(post.botId, eventName, {
      postId: post.id,
      title: post.title,
      status: finalStatus,
      sentAt: new Date().toISOString(),
      successCount,
      failedCount,
      targets: post.targets.map((t: any) => ({
        channelId: t.channel.chatId,
        channelName: t.channel.name,
        status: t.status,
        errorMessage: t.errorMessage
      }))
    }).catch(err => logger.error(`Failed to dispatch webhooks: ${err}`));

    logger.info(`Finished broadcast job for Post ${postId}. Status: ${finalStatus}. Success: ${successCount}, Failed: ${failedCount}`);
  },
  {
    connection: redisConnection as any,
    concurrency: 5 // process up to 5 sends in parallel
  }
);

worker.on('failed', (job, err) => {
  logger.error(`Broadcast job failed: ${job?.id}. Error: ${err.message}`);
});

export default broadcastQueue;
