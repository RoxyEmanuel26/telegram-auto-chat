import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import { decrypt } from '../utils/crypto';
import { ChannelType } from 'shared';

// Helper to log audit events
const logAuditEvent = async (userId: string | null, action: string, resource: string, resourceId: string, extra: any = {}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        newValue: extra.newVal || undefined,
        oldValue: extra.oldVal || undefined,
      }
    });
  } catch (err) {
    logger.error(`Audit log creation failed: ${err}`);
  }
};

export const addChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { chatId, botId, tags } = req.body;

    if (!chatId || !botId) {
      res.status(400).json({ error: 'Chat ID dan Bot ID wajib diisi' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    let targetChatId = String(chatId).trim();
    // Automatically prepend '@' for public channel/group usernames if the user forgot it
    if (!targetChatId.startsWith('-') && isNaN(Number(targetChatId)) && !targetChatId.startsWith('@')) {
      targetChatId = `@${targetChatId}`;
    }

    // 1. Fetch bot and decrypt token
    const bot = await prisma.telegramBot.findUnique({
      where: { id: botId }
    });

    if (!bot) {
      res.status(404).json({ error: 'Bot tidak ditemukan di database' });
      return;
    }

    const token = decrypt(bot.token);

    // 2. Fetch Chat details from Telegram API
    const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${targetChatId}`);
    const chatData = await chatRes.json();

    if (!chatData.ok) {
      res.status(400).json({ 
        error: `Gagal memverifikasi Chat. Pastikan Bot Anda telah dimasukkan ke dalam Channel/Group tersebut sebagai Admin. Error: ${chatData.description || 'Unknown'}`
      });
      return;
    }

    const chatInfo = chatData.result;
    
    // Map Telegram chat type to our database enum ChannelType
    let channelType = ChannelType.CHANNEL;
    if (chatInfo.type === 'group') {
      channelType = ChannelType.GROUP;
    } else if (chatInfo.type === 'supergroup') {
      channelType = ChannelType.SUPERGROUP;
    }

    // 3. Fetch Member count
    let memberCount = 0;
    try {
      const memberCountRes = await fetch(`https://api.telegram.org/bot${token}/getChatMemberCount?chat_id=${targetChatId}`);
      const memberCountData = await memberCountRes.json();
      if (memberCountData.ok) {
        memberCount = memberCountData.result;
      }
    } catch (err) {
      logger.warn(`Failed to fetch member count for chat ${targetChatId}: ${err}`);
    }

    // 4. Save/upsert channel in DB
    const cleanChatId = String(chatInfo.id);

    const channel = await prisma.telegramChannel.upsert({
      where: { chatId: cleanChatId },
      update: {
        name: chatInfo.title || chatInfo.first_name || 'Group Telegram',
        type: channelType,
        username: chatInfo.username || null,
        memberCount,
        description: chatInfo.description || null,
        botId,
        isActive: true,
        tags: tags || []
      },
      create: {
        chatId: cleanChatId,
        name: chatInfo.title || chatInfo.first_name || 'Group Telegram',
        type: channelType,
        username: chatInfo.username || null,
        memberCount,
        description: chatInfo.description || null,
        botId,
        isActive: true,
        tags: tags || []
      }
    });

    await logAuditEvent(req.user.id, 'CHANNEL_ADD', 'TelegramChannel', channel.id, { newVal: { name: channel.name, chatId: cleanChatId } });

    res.status(201).json({ message: 'Channel berhasil ditambahkan', channel });
  } catch (error) {
    logger.error(`Add channel error: ${error}`);
    res.status(500).json({ error: 'Gagal menambahkan channel' });
  }
};

export const getChannels = async (req: Request, res: Response): Promise<void> => {
  try {
    const { botId } = req.query;

    const whereClause: any = {};
    if (botId) {
      whereClause.botId = String(botId);
    }

    const channels = await prisma.telegramChannel.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        bot: {
          select: {
            id: true,
            name: true,
            username: true
          }
        }
      }
    });

    res.status(200).json({ channels });
  } catch (error) {
    logger.error(`Get channels error: ${error}`);
    res.status(500).json({ error: 'Gagal mengambil daftar channel' });
  }
};

export const deleteChannel = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Tidak terautorisasi' });
      return;
    }

    const channel = await prisma.telegramChannel.findUnique({
      where: { id }
    });

    if (!channel) {
      res.status(404).json({ error: 'Channel tidak ditemukan' });
      return;
    }

    await prisma.telegramChannel.delete({
      where: { id }
    });

    await logAuditEvent(req.user.id, 'CHANNEL_DELETE', 'TelegramChannel', id, { oldVal: { name: channel.name, chatId: channel.chatId } });

    res.status(200).json({ message: 'Channel berhasil dihapus dari sistem' });
  } catch (error) {
    logger.error(`Delete channel error: ${error}`);
    res.status(500).json({ error: 'Gagal menghapus channel' });
  }
};

export const sendTestMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const channel = await prisma.telegramChannel.findUnique({
      where: { id },
      include: { bot: true }
    });

    if (!channel) {
      res.status(404).json({ error: 'Channel tidak ditemukan' });
      return;
    }

    const token = decrypt(channel.bot.token);

    const testText = `🤖 *TeleHub Broadcast System*\n\nKoneksi berhasil terverifikasi! Bot @${channel.bot.username} terhubung sukses dengan channel ini.`;

    const telegramRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channel.chatId,
        text: testText,
        parse_mode: 'Markdown'
      })
    });

    const telegramData = await telegramRes.json();

    if (!telegramData.ok) {
      res.status(400).json({ 
        success: false, 
        error: telegramData.description || 'Gagal mengirim pesan test'
      });
      return;
    }

    res.status(200).json({ 
      success: true, 
      message: 'Pesan test berhasil dikirim ke Telegram!' 
    });
  } catch (error) {
    logger.error(`Send test message error: ${error}`);
    res.status(500).json({ error: 'Gagal mengirim pesan test' });
  }
};
