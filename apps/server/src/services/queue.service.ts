import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { decrypt } from '../utils/crypto';
import { PostStatus, TargetStatus, MediaType } from 'shared';
import { dispatchWebhook } from './webhook.service';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
import { getTelegramApiUrl } from '../utils/telegram';

// Helper: Escape HTML special characters for plain text captions
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// Helper: Decode common HTML entities (excluding &lt;, &gt;, &amp;)
const decodeHtmlEntities = (str: string): string => {
  const entities: Record<string, string> = {
    nbsp: ' ',
    quot: '"',
    apos: "'",
    cent: '¢',
    pound: '£',
    yen: '¥',
    euro: '€',
    copy: '©',
    reg: '®',
    trade: '™',
    deg: '°',
    middot: '•',
    bull: '•',
    ndash: '–',
    mdash: '—',
    ldquo: '“',
    rdquo: '”',
    lsquo: '‘',
    rsquo: '’'
  };
  return str.replace(/&([a-z0-9]+);/gi, (match, entity) => {
    const ent = entity.toLowerCase();
    if (ent === 'lt' || ent === 'gt' || ent === 'amp') {
      return match;
    }
    return entities[ent] !== undefined ? entities[ent] : ' ';
  });
};

// Helper: Clean and format HTML to Telegram's supported tag list
const cleanHtmlForTelegram = (html: string): string => {
  if (!html) return '';
  let clean = html;
  
  // 1. Decode HTML entities (e.g. &nbsp; -> space)
  clean = decodeHtmlEntities(clean);

  // 2. Protect spoiler spans by converting to placeholder <tgspoiler>
  clean = clean.replace(/<span\s+[^>]*class=["']tg-spoiler["'][^>]*>/gi, '<tgspoiler>');

  // 3. Convert headers: <h1>...</h1> -> <b>...</b>\n
  clean = clean.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '<b>$1</b>\n');
  
  // 4. Convert lists: <li>...</li> -> • ...\n
  clean = clean.replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n');
  clean = clean.replace(/<\/?(ul|ol)[^>]*>/gi, '');
  
  // 5. Convert paragraph blocks:
  clean = clean.replace(/<p[^>]*>/gi, '');
  clean = clean.replace(/<\/p>/gi, '\n');
  
  // 6. Convert line breaks:
  clean = clean.replace(/<br\s*\/?>/gi, '\n');
  
  // 7. Strip all opening tags except allowed ones, and strip attributes
  clean = clean.replace(/<([a-z0-9]+)(?:\s+[^>]*?)?(\/?)>/gi, (match, tag, selfClosing) => {
    const tagName = tag.toLowerCase();
    if (tagName === 'a') {
      const hrefMatch = match.match(/\shref=["']([^"']*)["']/i);
      if (hrefMatch) {
        return `<a href="${hrefMatch[1]}">`;
      }
      return '<a>';
    }
    const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'tgspoiler'];
    if (allowedTags.includes(tagName)) {
      return `<${tagName}${selfClosing ? '/' : ''}>`;
    }
    return '';
  });

  // 8. Process closing </span> tags to pair them with <tgspoiler>
  let activeSpoilers = 0;
  clean = clean.replace(/(<tgspoiler>|<\/span>)/gi, (match) => {
    if (match.toLowerCase() === '<tgspoiler>') {
      activeSpoilers++;
      return '<tgspoiler>';
    } else {
      if (activeSpoilers > 0) {
        activeSpoilers--;
        return '</tgspoiler>';
      }
      return '';
    }
  });

  // 9. Rename <tgspoiler> to Telegram-supported <span class="tg-spoiler">
  clean = clean.replace(/<tgspoiler>/gi, '<span class="tg-spoiler">');
  clean = clean.replace(/<\/tgspoiler>/gi, '</span>');

  // 10. Strip all other closing tags except allowed ones
  clean = clean.replace(/<\/([a-z0-9]+)>/gi, (match, tag) => {
    const tagName = tag.toLowerCase();
    const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'pre', 'span', 'a'];
    if (allowedTags.includes(tagName)) {
      return `</${tagName}>`;
    }
    return '';
  });

  return clean.trim();
};

// Setup Redis connection for BullMQ
export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null
});

export const broadcastQueue = new Queue('post-broadcast', {
  connection: redisConnection as any,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 }
  }
});

// Helper: send direct request to Telegram API
const sendTelegramRequest = async (token: string, method: string, payload: any) => {
  const url = `${getTelegramApiUrl()}/bot${token}/${method}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.json();
};

// BullMQ Worker to process broadcasts
export const worker = new Worker(
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
    let token: string;
    try {
      token = decrypt(post.bot.token);
    } catch (err: any) {
      logger.error(`Decryption failed for bot token of Post ${postId}: ${err}`);
      
      // Update targets to FAILED with decryption error
      await prisma.postTarget.updateMany({
        where: { postId: post.id, status: TargetStatus.PENDING },
        data: {
          status: TargetStatus.FAILED,
          errorMessage: 'Kesalahan Dekripsi Token Bot: Pastikan ENCRYPTION_KEY server sudah benar, atau hubungkan kembali Bot di pengaturan.'
        }
      });

      // Update post status to FAILED
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: PostStatus.FAILED,
          sentAt: new Date()
        }
      });
      
      // Create notification
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: 'POST_FAILED',
          title: `Siaran "${post.title}" Gagal`,
          message: `Gagal mengirim siaran "${post.title}". Kesalahan: Gagal mendekripsi token bot. Pastikan ENCRYPTION_KEY server sudah benar atau hubungkan ulang bot Anda.`,
          metadata: { postId: post.id, successCount: 0, failedCount: post.targets.length }
        }
      }).catch(notifErr => logger.error(`Failed to create notification: ${notifErr}`));

      return;
    }

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

      // Determine text content and caption formatting based on parseMode
      let textToSend = post.content;
      let captionToSend = post.mediaCaption || post.content;
      let parseModeHeader: string | undefined = undefined;

      if (post.parseMode === 'HTML') {
        parseModeHeader = 'HTML';
        textToSend = cleanHtmlForTelegram(post.content);
        captionToSend = post.mediaCaption 
          ? escapeHtml(post.mediaCaption) 
          : cleanHtmlForTelegram(post.content);
      } else if (post.parseMode === 'MARKDOWN') {
        parseModeHeader = 'Markdown';
      }

      // Handle message payload based on media type
      if (post.mediaType === MediaType.NONE) {
        method = 'sendMessage';
        payload.text = textToSend;
        if (parseModeHeader) {
          payload.parse_mode = parseModeHeader;
        }
        if (post.disableWebPagePreview) {
          payload.disable_web_page_preview = true;
        }
      } else if (post.mediaType === MediaType.PHOTO && post.mediaUrl) {
        method = 'sendPhoto';
        payload.photo = post.mediaUrl;
        payload.caption = captionToSend;
        if (parseModeHeader) {
          payload.parse_mode = parseModeHeader;
        }
      } else if (post.mediaType === MediaType.VIDEO && post.mediaUrl) {
        method = 'sendVideo';
        payload.video = post.mediaUrl;
        payload.caption = captionToSend;
        if (parseModeHeader) {
          payload.parse_mode = parseModeHeader;
        }
      } else if (post.mediaType === MediaType.DOCUMENT && post.mediaUrl) {
        method = 'sendDocument';
        payload.document = post.mediaUrl;
        payload.caption = captionToSend;
        if (parseModeHeader) {
          payload.parse_mode = parseModeHeader;
        }
      } else if (post.mediaType === MediaType.AUDIO && post.mediaUrl) {
        method = 'sendAudio';
        payload.audio = post.mediaUrl;
        payload.caption = captionToSend;
        if (parseModeHeader) {
          payload.parse_mode = parseModeHeader;
        }
      } else if (post.mediaType === MediaType.VOICE && post.mediaUrl) {
        method = 'sendVoice';
        payload.voice = post.mediaUrl;
        payload.caption = captionToSend;
        if (parseModeHeader) {
          payload.parse_mode = parseModeHeader;
        }
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

    // Re-query targets from database to send fresh (non-stale) statuses in webhook
    const updatedTargets = await prisma.postTarget.findMany({
      where: { postId: post.id },
      include: { channel: true }
    });

    // Dispatch webhook event
    const eventName = finalStatus === PostStatus.FAILED ? 'post.failed' : 'post.sent';
    await dispatchWebhook(post.botId, eventName, {
      postId: post.id,
      title: post.title,
      status: finalStatus,
      sentAt: new Date().toISOString(),
      successCount,
      failedCount,
      targets: updatedTargets.map((t: any) => ({
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
