import prisma from './prisma';
import logger from './logger';

export const logAction = async (
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string | null,
  oldValue?: any,
  newValue?: any,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource,
        resourceId: resourceId || null,
        oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
        newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    });
  } catch (error) {
    logger.error(`Failed to write audit log in database: ${error instanceof Error ? error.message : error}`);
  }
};
