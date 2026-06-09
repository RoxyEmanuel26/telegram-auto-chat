import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { UserRole, LoginSchema, RegisterSchema, UpdateProfileSchema, ChangePasswordSchema, Setup2FASchema } from 'shared';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

// Helpers for token generation
const ACCESS_TOKEN_EXPIRY = '30d';
const REFRESH_TOKEN_EXPIRY = '90d';

const generateAccessToken = (userId: string, email: string, role: UserRole, twoFactorVerified: boolean): string => {
  const secret = process.env.JWT_SECRET || 'fallback-super-secret-jwt-key';
  return jwt.sign({ userId, email, role, twoFactorVerified }, secret, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

const generateRefreshToken = (userId: string): string => {
  const secret = process.env.JWT_REFRESH_SECRET || 'fallback-super-secret-refresh-key';
  return jwt.sign({ userId }, secret, { expiresIn: REFRESH_TOKEN_EXPIRY });
};

// Helper for Audit logging
const logAction = async (userId: string | null, action: string, resource: string, resourceId?: string, extra: { oldVal?: any, newVal?: any, req?: Request } = {}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId,
        oldValue: extra.oldVal ? JSON.parse(JSON.stringify(extra.oldVal)) : undefined,
        newValue: extra.newVal ? JSON.parse(JSON.stringify(extra.newVal)) : undefined,
        ipAddress: extra.req?.ip || null,
        userAgent: extra.req?.headers['user-agent'] || null
      }
    });
  } catch (err) {
    logger.error(`Failed to create audit log: ${err}`);
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = RegisterSchema.safeParse(req.body);
    if (!validated.success) {
      res.status(400).json({ error: validated.error.errors[0].message });
      return;
    }

    const { email, password, name, role } = validated.data;

    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(400).json({ error: 'Email sudah terdaftar' });
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // If this is the first user, auto-promote to ADMIN
    const count = await prisma.user.count();
    const finalRole = count === 0 ? UserRole.ADMIN : role;

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: finalRole,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    await logAction(user.id, 'USER_REGISTER', 'User', user.id, { newVal: { email, name, role: finalRole }, req });

    res.status(201).json({ message: 'Registrasi berhasil', user });
  } catch (error) {
    logger.error(`Register error: ${error}`);
    res.status(500).json({ error: 'Terjadi kesalahan server saat registrasi' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const validated = LoginSchema.safeParse(req.body);
    if (!validated.success) {
      res.status(400).json({ error: validated.error.errors[0].message });
      return;
    }

    const { email, password } = validated.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(400).json({ error: 'Email atau password salah' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Akun Anda telah dinonaktifkan' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(400).json({ error: 'Email atau password salah' });
      return;
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    // Handle 2FA condition
    if (user.twoFactorEnabled) {
      // Return a temporary token indicating 2FA is needed
      const tempToken = generateAccessToken(user.id, user.email, user.role as UserRole, false);
      res.status(200).json({
        message: '2FA_REQUIRED',
        tempToken,
        twoFactorRequired: true
      });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role as UserRole, true);
    const refreshToken = generateRefreshToken(user.id);

    await logAction(user.id, 'USER_LOGIN', 'User', user.id, { req });

    res.status(200).json({
      message: 'Login berhasil',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    logger.error(`Login error: ${error}`);
    res.status(500).json({ error: 'Terjadi kesalahan server saat login' });
  }
};

export const verify2FA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code } = req.body;
    // We expect the auth middleware to pass the tempToken, yielding req.user
    if (!req.user) {
      res.status(401).json({ error: 'Sesi tidak valid' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user || !user.twoFactorSecret) {
      res.status(400).json({ error: '2FA tidak dikonfigurasi untuk akun ini' });
      return;
    }

    const verified = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret
    });

    if (!verified) {
      res.status(400).json({ error: 'Kode OTP tidak valid' });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role as UserRole, true);
    const refreshToken = generateRefreshToken(user.id);

    await logAction(user.id, 'USER_LOGIN_2FA', 'User', user.id, { req });

    res.status(200).json({
      message: 'Verifikasi 2FA berhasil',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    logger.error(`2FA verification error: ${error}`);
    res.status(500).json({ error: 'Terjadi kesalahan server saat verifikasi 2FA' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token diperlukan' });
    return;
  }

  try {
    const secret = process.env.JWT_REFRESH_SECRET || 'fallback-super-secret-refresh-key';
    const decoded = jwt.verify(refreshToken, secret) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || !user.isActive) {
      res.status(403).json({ error: 'Sesi kedaluwarsa atau pengguna tidak aktif' });
      return;
    }

    const accessToken = generateAccessToken(user.id, user.email, user.role as UserRole, true);
    res.status(200).json({ accessToken });
  } catch (error) {
    res.status(401).json({ error: 'Refresh token tidak valid atau kedaluwarsa' });
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Tidak terautorisasi' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        twoFactorEnabled: true,
        createdAt: true,
        lastLoginAt: true
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User tidak ditemukan' });
      return;
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Kesalahan server' });
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Tidak terautorisasi' });
    return;
  }

  try {
    const validated = UpdateProfileSchema.safeParse(req.body);
    if (!validated.success) {
      res.status(400).json({ error: validated.error.errors[0].message });
      return;
    }

    const { name, email, avatar } = validated.data;

    // Check if email taken by someone else
    if (email !== req.user.email) {
      const emailCheck = await prisma.user.findUnique({ where: { email } });
      if (emailCheck) {
        res.status(400).json({ error: 'Email sudah digunakan oleh akun lain' });
        return;
      }
    }

    const oldUser = await prisma.user.findUnique({ where: { id: req.user.id } });

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name,
        email,
        avatar: avatar || null
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        twoFactorEnabled: true
      }
    });

    await logAction(req.user.id, 'PROFILE_UPDATE', 'User', req.user.id, {
      oldVal: { name: oldUser?.name, email: oldUser?.email, avatar: oldUser?.avatar },
      newVal: { name, email, avatar },
      req
    });

    res.status(200).json({ message: 'Profil berhasil diperbarui', user: updatedUser });
  } catch (error) {
    logger.error(`Profile update error: ${error}`);
    res.status(500).json({ error: 'Gagal memperbarui profil' });
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Tidak terautorisasi' });
    return;
  }

  try {
    const validated = ChangePasswordSchema.safeParse(req.body);
    if (!validated.success) {
      res.status(400).json({ error: validated.error.errors[0].message });
      return;
    }

    const { oldPassword, newPassword } = validated.data;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ error: 'User tidak ditemukan' });
      return;
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      res.status(400).json({ error: 'Password lama salah' });
      return;
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedNewPassword }
    });

    await logAction(req.user.id, 'PASSWORD_CHANGE', 'User', req.user.id, { req });

    res.status(200).json({ message: 'Password berhasil diubah' });
  } catch (error) {
    logger.error(`Change password error: ${error}`);
    res.status(500).json({ error: 'Gagal mengubah password' });
  }
};

export const setup2FA = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Tidak terautorisasi' });
    return;
  }

  try {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(req.user.email, 'TeleHubCommandCenter', secret);
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Save temporary secret to user table
    await prisma.user.update({
      where: { id: req.user.id },
      data: { twoFactorSecret: secret }
    });

    res.status(200).json({
      secret,
      qrCodeUrl
    });
  } catch (error) {
    logger.error(`Setup 2FA error: ${error}`);
    res.status(500).json({ error: 'Gagal menyiapkan 2FA' });
  }
};

export const enable2FA = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Tidak terautorisasi' });
    return;
  }

  try {
    const validated = Setup2FASchema.safeParse(req.body);
    if (!validated.success) {
      res.status(400).json({ error: validated.error.errors[0].message });
      return;
    }

    const { code } = validated.data;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user || !user.twoFactorSecret) {
      res.status(400).json({ error: 'Secret 2FA belum diinisialisasi. Lakukan setup terlebih dahulu.' });
      return;
    }

    const verified = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret
    });

    if (!verified) {
      res.status(400).json({ error: 'Kode OTP tidak valid' });
      return;
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { twoFactorEnabled: true }
    });

    await logAction(req.user.id, '2FA_ENABLED', 'User', req.user.id, { req });

    res.status(200).json({ message: '2FA berhasil diaktifkan' });
  } catch (error) {
    logger.error(`Enable 2FA error: ${error}`);
    res.status(500).json({ error: 'Gagal mengaktifkan 2FA' });
  }
};

export const disable2FA = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Tidak terautorisasi' });
    return;
  }

  try {
    const { code } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user || !user.twoFactorSecret) {
      res.status(400).json({ error: '2FA tidak aktif' });
      return;
    }

    const verified = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret
    });

    if (!verified) {
      res.status(400).json({ error: 'Kode OTP tidak valid' });
      return;
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null
      }
    });

    await logAction(req.user.id, '2FA_DISABLED', 'User', req.user.id, { req });

    res.status(200).json({ message: '2FA berhasil dinonaktifkan' });
  } catch (error) {
    logger.error(`Disable 2FA error: ${error}`);
    res.status(500).json({ error: 'Gagal menonaktifkan 2FA' });
  }
};

export const getSessions = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Tidak terautorisasi' });
    return;
  }

  try {
    // Fetch last 10 login logs for the user to simulate active login sessions / history
    const logs = await prisma.auditLog.findMany({
      where: {
        userId: req.user.id,
        action: { in: ['USER_LOGIN', 'USER_LOGIN_2FA'] }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const sessions = logs.map(log => ({
      id: log.id,
      loginAt: log.createdAt,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      // Mock the current device identifier
      isCurrentDevice: log.userAgent === req.headers['user-agent'] && log.ipAddress === req.ip
    }));

    res.status(200).json({ sessions });
  } catch (error) {
    res.status(500).json({ error: 'Gagal memuat sesi log' });
  }
};
