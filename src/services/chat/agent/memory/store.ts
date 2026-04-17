import { prisma } from '../../../../config/database';
import { logger } from '../../../../utils/logger';

export interface UserPreferences {
  defaultTrade?: string;
  preferredCities?: string[];
  sequenceIntensity?: string;
  smsTiming?: string;
  lastSearchTrade?: string;
  lastSearchCity?: string;
}

const PREFS_KEY = 'preferences';

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  try {
    const row = await prisma.userPreference.findUnique({
      where: { userId_key: { userId, key: PREFS_KEY } },
    });
    return (row?.value as UserPreferences) ?? {};
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to read user preferences, returning defaults');
    return {};
  }
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<void> {
  const current = await getUserPreferences(userId);
  const merged = { ...current, ...patch };
  await prisma.userPreference.upsert({
    where: { userId_key: { userId, key: PREFS_KEY } },
    create: { userId, key: PREFS_KEY, value: merged as any },
    update: { value: merged as any },
  });
}
