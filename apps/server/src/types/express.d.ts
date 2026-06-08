import { UserRole } from 'shared';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
        twoFactorEnabled: boolean;
        twoFactorVerified?: boolean;
      };
    }
  }
}
