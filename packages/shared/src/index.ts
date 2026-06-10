import { z } from 'zod';

// Roles Enums
export enum UserRole {
  ADMIN = 'ADMIN',
  EDITOR = 'EDITOR',
  VIEWER = 'VIEWER'
}

// Channel Type Enums
export enum ChannelType {
  CHANNEL = 'CHANNEL',
  GROUP = 'GROUP',
  SUPERGROUP = 'SUPERGROUP'
}

// Telegram Parse Mode
export enum ParseMode {
  MARKDOWN = 'MARKDOWN',
  HTML = 'HTML',
  PLAIN = 'PLAIN'
}

// Media Type Enums
export enum MediaType {
  NONE = 'NONE',
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
  AUDIO = 'AUDIO',
  VOICE = 'VOICE',
  POLL = 'POLL'
}

// Post Status Enums
export enum PostStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  PARTIAL_SENT = 'PARTIAL_SENT',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// Target Status Enums
export enum TargetStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED'
}

// CSV Bulk Import Status Enums
export enum ImportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  FAILED = 'FAILED'
}

// Schedule Recurrence Type Enums
export enum RecurrenceType {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM'
}

// ==========================================
// ZOD AUTHENTICATION SCHEMAS
// ==========================================

export const LoginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal terdiri dari 6 karakter'),
  rememberMe: z.boolean().optional()
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(6, 'Password minimal terdiri dari 6 karakter'),
  name: z.string().min(2, 'Nama minimal terdiri dari 2 karakter'),
  role: z.nativeEnum(UserRole).default(UserRole.VIEWER)
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

export const Setup2FASchema = z.object({
  code: z.string().length(6, 'Kode OTP harus 6 digit angka')
});

export type Setup2FAInput = z.infer<typeof Setup2FASchema>;

export const Verify2FASchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string(),
  code: z.string().length(6, 'Kode OTP harus 6 digit angka')
});

export type Verify2FAInput = z.infer<typeof Verify2FASchema>;

// ==========================================
// ZOD USER PROFILE SCHEMAS
// ==========================================

export const UpdateProfileSchema = z.object({
  name: z.string().min(2, 'Nama minimal terdiri dari 2 karakter'),
  email: z.string().email('Format email tidak valid'),
  avatar: z.string().url('Avatar URL tidak valid').or(z.string().nullable().optional())
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Password lama harus diisi'),
  newPassword: z.string().min(6, 'Password baru minimal terdiri dari 6 karakter')
}).refine(data => data.oldPassword !== data.newPassword, {
  message: 'Password baru tidak boleh sama dengan password lama',
  path: ['newPassword']
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// ==========================================
// ZOD BOT MANAGEMENT SCHEMAS
// ==========================================

export const AddBotSchema = z.object({
  token: z.string().min(30, 'Token bot tidak valid').max(200, 'Token bot terlalu panjang'),
  name: z.string().min(1, 'Nama bot wajib diisi').max(100, 'Nama bot terlalu panjang'),
  description: z.string().max(500, 'Deskripsi terlalu panjang').optional().nullable()
});

export type AddBotInput = z.infer<typeof AddBotSchema>;

// ==========================================
// ZOD CHANNEL MANAGEMENT SCHEMAS
// ==========================================

export const AddChannelSchema = z.object({
  chatId: z.string().min(1, 'Chat ID wajib diisi').max(100, 'Chat ID terlalu panjang'),
  botId: z.string().uuid('Bot ID tidak valid'),
  tags: z.array(z.string().max(50)).max(20).optional()
});

export type AddChannelInput = z.infer<typeof AddChannelSchema>;

// ==========================================
// ZOD POST/BROADCAST SCHEMAS
// ==========================================

export const CreatePostSchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi').max(200, 'Judul terlalu panjang'),
  content: z.string().min(1, 'Konten wajib diisi').max(10000, 'Konten terlalu panjang (maks 10.000 karakter)'),
  parseMode: z.nativeEnum(ParseMode).optional(),
  botId: z.string().uuid('Bot ID tidak valid'),
  channelIds: z.array(z.string().uuid('Channel ID tidak valid')).min(1, 'Pilih minimal 1 channel target'),
  mediaType: z.nativeEnum(MediaType).optional(),
  mediaUrl: z.string().url('URL media tidak valid').optional().nullable(),
  mediaCaption: z.string().max(1024, 'Caption terlalu panjang').optional().nullable(),
  inlineKeyboard: z.any().optional().nullable(),
  disableNotification: z.boolean().optional(),
  protectContent: z.boolean().optional(),
  disableWebPagePreview: z.boolean().optional(),
  status: z.enum(['DRAFT', 'SEND_NOW', 'SCHEDULED']).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
  recurrence: z.object({
    type: z.nativeEnum(RecurrenceType),
    cronExpression: z.string().min(9, 'Cron expression tidak valid').max(100)
  }).optional().nullable()
});

export type CreatePostInput = z.infer<typeof CreatePostSchema>;

// ==========================================
// ZOD WEBHOOK SCHEMAS
// ==========================================

export const CreateWebhookSchema = z.object({
  name: z.string().min(1, 'Nama webhook wajib diisi').max(100, 'Nama terlalu panjang'),
  url: z.string().url('URL webhook tidak valid'),
  events: z.array(z.string()).min(1, 'Pilih minimal 1 event'),
  botId: z.string().uuid('Bot ID tidak valid')
});

export type CreateWebhookInput = z.infer<typeof CreateWebhookSchema>;
