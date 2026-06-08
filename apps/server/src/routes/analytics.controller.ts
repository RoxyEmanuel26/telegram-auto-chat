import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

export const getAnalyticsSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Core counters
    const totalPosts = await prisma.post.count();
    const activeBotsCount = await prisma.telegramBot.count({ where: { isActive: true } });
    const activeChannelsCount = await prisma.telegramChannel.count({ where: { isActive: true } });

    // Potential reach: sum of memberCount of all channels
    const potentialReachResult = await prisma.telegramChannel.aggregate({
      _sum: { memberCount: true }
    });
    const potentialReach = potentialReachResult._sum.memberCount || 0;

    // Delivery stats: from PostTarget
    const totalTargets = await prisma.postTarget.count();
    const successfulTargets = await prisma.postTarget.count({
      where: { status: 'SENT' }
    });
    const failedTargets = await prisma.postTarget.count({
      where: { status: 'FAILED' }
    });

    const successRate = totalTargets > 0 ? Math.round((successfulTargets / totalTargets) * 100) : 100;

    // 2. Posts by status
    const statusCounts = await prisma.post.groupBy({
      by: ['status'],
      _count: { id: true }
    });
    const postsByStatus = statusCounts.reduce((acc, curr) => {
      acc[curr.status] = curr._count.id;
      return acc;
    }, {} as Record<string, number>);

    // 3. Activity trends (Last 7 days post counts)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const postsRecent = await prisma.post.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo }
      },
      select: { createdAt: true, status: true }
    });

    // Group posts by day
    const activityTrend: Record<string, { total: number; sent: number }> = {};
    for (let d = 0; d < 7; d++) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
      activityTrend[dateStr] = { total: 0, sent: 0 };
    }

    postsRecent.forEach(post => {
      const dateStr = new Date(post.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit' });
      if (activityTrend[dateStr]) {
        activityTrend[dateStr].total++;
        if (post.status === 'SENT' || post.status === 'PARTIAL_SENT') {
          activityTrend[dateStr].sent++;
        }
      }
    });

    const activityData = Object.entries(activityTrend)
      .map(([date, counts]) => ({ date, ...counts }))
      .reverse();

    // 4. Template usage rankings
    const topTemplates = await prisma.template.findMany({
      orderBy: { usageCount: 'desc' },
      take: 5,
      select: { id: true, name: true, category: true, usageCount: true }
    });

    res.status(200).json({
      summary: {
        totalPosts,
        activeBotsCount,
        activeChannelsCount,
        potentialReach,
        successfulTargets,
        failedTargets,
        successRate
      },
      postsByStatus,
      activityData,
      topTemplates
    });
  } catch (error) {
    logger.error(`Get analytics summary error: ${error}`);
    res.status(500).json({ error: 'Gagal merangkum data analitik' });
  }
};

export const getChannelPerformance = async (req: Request, res: Response): Promise<void> => {
  try {
    const channels = await prisma.telegramChannel.findMany({
      include: {
        _count: {
          select: { postTargets: true }
        }
      }
    });

    const performance = await Promise.all(channels.map(async (channel) => {
      const totalPostAttempts = channel._count.postTargets;
      
      const successfulPosts = await prisma.postTarget.count({
        where: {
          channelId: channel.id,
          status: 'SENT'
        }
      });

      const failedPosts = totalPostAttempts - successfulPosts;
      const successRate = totalPostAttempts > 0 ? Math.round((successfulPosts / totalPostAttempts) * 100) : 100;

      return {
        id: channel.id,
        name: channel.name,
        username: channel.username,
        memberCount: channel.memberCount,
        totalPostAttempts,
        successfulPosts,
        failedPosts,
        successRate
      };
    }));

    res.status(200).json({ channelPerformance: performance });
  } catch (error) {
    logger.error(`Get channel performance error: ${error}`);
    res.status(500).json({ error: 'Gagal memuat analitik performa channel' });
  }
};
