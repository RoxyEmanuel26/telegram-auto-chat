import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from 'shared';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  twoFactorVerified?: boolean;
}

export const authenticateJWT = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    let token: string | null = null;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // 2. Check cookies if header not present (optional fallback)
    if (!token && req.cookies && req.cookies.access_token) {
      token = req.cookies.access_token;
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication token is missing' });
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not configured');
    }
    const decoded = jwt.verify(token, secret) as TokenPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, isActive: true, twoFactorEnabled: true }
    });

    if (!user) {
      res.status(401).json({ error: 'User does not exist' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'User account is deactivated' });
      return;
    }

    // Attach user to Request object
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorVerified: decoded.twoFactorVerified ?? false,
    };

    // Prevent 2FA bypass: If 2FA is enabled but not verified, block all routes
    // except the 2FA verification itself and getMe profile status endpoint.
    const is2faRoute = req.originalUrl.includes('/verify-2fa') || req.originalUrl.includes('/2fa/verify');
    const isMeRoute = req.originalUrl.includes('/me') || req.originalUrl.includes('/auth/me');
    
    if (req.user.twoFactorEnabled && !req.user.twoFactorVerified && !is2faRoute && !isMeRoute) {
      res.status(403).json({ error: '2FA verification required' });
      return;
    }

    next();
  } catch (error) {
    logger.error(`Authentication error: ${error instanceof Error ? error.message : error}`);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
      return;
    }

    // If 2FA is enabled but not verified, block access to administrative features
    if (req.user.twoFactorEnabled && !req.user.twoFactorVerified) {
      res.status(403).json({ error: '2FA verification required' });
      return;
    }

    next();
  };
};
