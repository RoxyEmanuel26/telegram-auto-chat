import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { broadcastQueue } from './queue.service';
import { PostStatus, TargetStatus } from 'shared';
import parser from 'cron-parser';

export const runSchedulerCheck = async (): Promise<void> => {
  try {
    const now = new Date();

    // Query active recurrences due to execute
    const activeRecurrences = await prisma.scheduleRecurrence.findMany({
      where: {
        isActive: true,
        nextRunAt: { lte: now }
      },
      include: {
        post: {
          include: {
            targets: true
          }
        }
      }
    });

    if (activeRecurrences.length === 0) {
      return;
    }

    logger.info(`Found ${activeRecurrences.length} active recurring posts due to run.`);

    for (const rec of activeRecurrences) {
      const parentPost = rec.post;

      try {
        // 1. Create duplicated Post record for this run instance
        const newPost = await prisma.$transaction(async (tx) => {
          const createdPost = await tx.post.create({
            data: {
              title: `${parentPost.title} (Recurring Run)`,
              content: parentPost.content,
              botId: parentPost.botId,
              mediaType: parentPost.mediaType,
              mediaUrl: parentPost.mediaUrl,
              mediaCaption: parentPost.mediaCaption,
              inlineKeyboard: parentPost.inlineKeyboard ? JSON.parse(JSON.stringify(parentPost.inlineKeyboard)) : null,
              disableNotification: parentPost.disableNotification,
              protectContent: parentPost.protectContent,
              disableWebPagePreview: parentPost.disableWebPagePreview,
              status: PostStatus.QUEUED,
              authorId: parentPost.authorId,
              sentAt: null
            }
          });

          // Create corresponding Targets
          const targetData = parentPost.targets.map(target => ({
            postId: createdPost.id,
            channelId: target.channelId,
            status: TargetStatus.PENDING
          }));

          await tx.postTarget.createMany({
            data: targetData
          });

          return createdPost;
        });

        // 2. Queue immediately
        await broadcastQueue.add('broadcast-job', { postId: newPost.id }, { jobId: newPost.id });
        logger.info(`Successfully spawned recurring instance post ${newPost.id} from parent ${parentPost.id}`);

        // 3. Compute next run date
        if (rec.cronExpression) {
          const cronInterval = parser.parseExpression(rec.cronExpression);
          const nextRunAt = cronInterval.next().toDate();

          const nextOccurrenceCount = rec.currentOccurrence + 1;
          const isMaxedOut = rec.occurrenceCount !== null && nextOccurrenceCount >= rec.occurrenceCount;
          const isExpired = rec.endDate !== null && nextRunAt > rec.endDate;

          await prisma.scheduleRecurrence.update({
            where: { id: rec.id },
            data: {
              nextRunAt,
              currentOccurrence: nextOccurrenceCount,
              isActive: !isMaxedOut && !isExpired
            }
          });
          logger.info(`Updated recurrence ${rec.id}: next run scheduled at ${nextRunAt}. Active: ${!isMaxedOut && !isExpired}`);
        } else {
          // If no cron pattern, deactivate
          await prisma.scheduleRecurrence.update({
            where: { id: rec.id },
            data: { isActive: false }
          });
        }
      } catch (err: any) {
        logger.error(`Error processing recurrence ${rec.id} for post ${parentPost.id}: ${err.message || err}`);
      }
    }
  } catch (error) {
    logger.error(`Scheduler check execution error: ${error}`);
  }
};

let schedulerInterval: NodeJS.Timeout | null = null;

export const initScheduler = (): void => {
  if (schedulerInterval) return;

  logger.info('Initializing recurring posts scheduler check (60s loop)...');
  
  // Run once immediately on startup
  runSchedulerCheck();

  // Run check every 60 seconds
  schedulerInterval = setInterval(() => {
    runSchedulerCheck();
  }, 60 * 1000);
};

export const stopScheduler = (): void => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Recurring posts scheduler check stopped.');
  }
};
