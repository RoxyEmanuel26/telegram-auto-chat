import prisma from '../utils/prisma';
import logger from '../utils/logger';
import crypto from 'crypto';

export const dispatchWebhook = async (botId: string, event: string, payload: any): Promise<void> => {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: {
        botId,
        isActive: true,
      },
    });

    // Subscribed events check
    const filteredWebhooks = webhooks.filter((w: any) => w.events.includes(event));

    if (filteredWebhooks.length === 0) return;

    logger.info(`Dispatching webhook event "${event}" to ${filteredWebhooks.length} subscribers`);

    const promises = filteredWebhooks.map(async (webhook: any) => {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        webhookId: webhook.id,
        botId,
        data: payload
      });

      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(body)
        .digest('hex');

      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-telehub-signature': signature
          },
          body,
          signal: AbortSignal.timeout(5000) // 5s timeout
        });

        if (response.ok) {
          await prisma.webhook.update({
            where: { id: webhook.id },
            data: {
              lastTriggeredAt: new Date(),
              failureCount: 0
            }
          });
        } else {
          throw new Error(`Receiver returned status ${response.status}`);
        }
      } catch (err: any) {
        const newFailCount = webhook.failureCount + 1;
        const autoDeactivate = newFailCount >= 10;
        
        logger.warn(`Webhook dispatch failed for URL ${webhook.url}. Fail count: ${newFailCount}. Error: ${err.message}`);

        await prisma.webhook.update({
          where: { id: webhook.id },
          data: {
            failureCount: newFailCount,
            isActive: !autoDeactivate
          }
        });

        if (autoDeactivate) {
          logger.error(`Webhook ${webhook.id} auto-deactivated due to 10 consecutive failures.`);
          
          // Dispatch notification to bot owner
          const bot = await prisma.telegramBot.findUnique({ where: { id: botId } });
          if (bot) {
            await prisma.notification.create({
              data: {
                userId: bot.ownerId,
                type: 'WEBHOOK_DEACTIVATED',
                title: 'Webhook Dinonaktifkan Otomatis',
                message: `Integrasi webhook "${webhook.name}" dinonaktifkan otomatis setelah 10 kali kegagalan koneksi berturut-turut.`
              }
            });
          }
        }
      }
    });

    await Promise.all(promises);
  } catch (error) {
    logger.error(`Webhook dispatch orchestrator error: ${error instanceof Error ? error.message : error}`);
  }
};
