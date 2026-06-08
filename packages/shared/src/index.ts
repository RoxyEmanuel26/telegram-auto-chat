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
