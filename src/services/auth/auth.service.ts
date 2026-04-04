import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors';
import type { User } from '@prisma/client';

const BCRYPT_COST = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface SafeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Auth Service
 *
 * Handles user registration, login, JWT token lifecycle, and password
 * management. Refresh tokens are persisted in the Session table so they
 * can be revoked at any time (logout / rotation).
 */
export class AuthService {
  // ------------------------------------------------------------------
  // Registration
  // ------------------------------------------------------------------

  async register(
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check for existing user
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictError('A user with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: firstName || null,
        lastName: lastName || null,
      },
    });

    logger.info({ userId: user.id, email: user.email }, 'User registered');

    // Generate tokens
    const tokens = await this.createTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------

  async login(
    email: string,
    password: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens (session stored with metadata)
    const tokens = await this.createTokens(user, userAgent, ipAddress);

    logger.info({ userId: user.id }, 'User logged in');

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  // ------------------------------------------------------------------
  // Token Refresh
  // ------------------------------------------------------------------

  async refreshToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Look up the session by refresh token
    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session) {
      throw new AuthenticationError('Invalid refresh token');
    }

    if (session.expiresAt < new Date()) {
      // Clean up expired session
      await prisma.session.delete({ where: { id: session.id } });
      throw new AuthenticationError('Refresh token has expired');
    }

    if (!session.user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Rotate: delete old session, create new one
    await prisma.session.delete({ where: { id: session.id } });

    const tokens = await this.createTokens(
      session.user,
      session.userAgent || undefined,
      session.ipAddress || undefined
    );

    logger.debug({ userId: session.userId }, 'Token refreshed');

    return tokens;
  }

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------

  async logout(refreshToken: string): Promise<void> {
    // Delete session if it exists; ignore if already gone
    try {
      await prisma.session.delete({ where: { refreshToken } });
    } catch {
      // Session may already have been removed; that is fine.
    }

    logger.debug('Session revoked via logout');
  }

  // ------------------------------------------------------------------
  // Get Current User
  // ------------------------------------------------------------------

  async getMe(userId: string): Promise<SafeUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return this.sanitizeUser(user);
  }

  // ------------------------------------------------------------------
  // Change Password
  // ------------------------------------------------------------------

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Invalidate all existing sessions so user must re-authenticate
    await prisma.session.deleteMany({ where: { userId } });

    logger.info({ userId }, 'Password changed — all sessions revoked');
  }

  // ------------------------------------------------------------------
  // Private helpers
  // ------------------------------------------------------------------

  private async createTokens(
    user: User,
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthTokens> {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, getJwtSecret(), {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      getJwtSecret(),
      { expiresIn: REFRESH_TOKEN_EXPIRY_SECONDS }
    );

    // Persist session
    await prisma.session.create({
      data: {
        userId: user.id,
        refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
      },
    });

    return { accessToken, refreshToken };
  }

  /**
   * Strip sensitive fields (passwordHash) before returning user data.
   */
  private sanitizeUser(user: User): SafeUser {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}

// Export singleton
export const authService = new AuthService();
