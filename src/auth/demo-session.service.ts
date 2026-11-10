import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DEMO_ROLES } from '../fulfillment/domain/order';
import type { DemoRole } from '../fulfillment/domain/order';

export const DEMO_SESSION_COOKIE = 'fulfillops_session';
export const DEMO_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MAX_DEMO_SESSIONS = 1_000;

export type DemoProfile = {
  id: DemoRole;
  role: DemoRole;
};

type DemoSession = {
  role: DemoRole;
  expiresAt: number;
};

const demoProfiles: readonly DemoProfile[] = DEMO_ROLES.map((role) => ({
  id: role,
  role,
}));
const tokenPattern = /^[a-f0-9]{64}$/;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readCookie(cookieHeader: string | undefined): string | undefined {
  const cookie = cookieHeader
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEMO_SESSION_COOKIE}=`))
    ?.slice(DEMO_SESSION_COOKIE.length + 1);

  return cookie && tokenPattern.test(cookie) ? cookie : undefined;
}

@Injectable()
export class DemoSessionService {
  private readonly sessions = new Map<string, DemoSession>();

  listProfiles(): DemoProfile[] {
    this.requireLocalEnvironment();
    return demoProfiles.map((profile) => ({ ...profile }));
  }

  createSession(
    profileId: string,
    cookieHeader?: string,
  ): { profile: DemoProfile; token: string } {
    this.requireLocalEnvironment();
    const profile = demoProfiles.find(
      (candidate) => candidate.id === profileId,
    );
    if (!profile) {
      throw new UnauthorizedException({
        code: 'DEMO_PROFILE_INVALID',
        message: 'Select an available warehouse profile.',
      });
    }

    this.revoke(cookieHeader);
    this.removeExpiredSessions();
    if (this.sessions.size >= MAX_DEMO_SESSIONS) {
      for (const oldestKey of this.sessions.keys()) {
        this.sessions.delete(oldestKey);
        break;
      }
    }

    const token = randomBytes(32).toString('hex');
    this.sessions.set(hashToken(token), {
      role: profile.role,
      expiresAt: Date.now() + DEMO_SESSION_TTL_SECONDS * 1000,
    });
    return { profile: { ...profile }, token };
  }

  roleForSession(cookieHeader?: string): DemoRole {
    const token = readCookie(cookieHeader);
    if (!token) this.requireSession();

    const sessionKey = hashToken(token);
    const session = this.sessions.get(sessionKey);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionKey);
      this.requireSession();
    }
    return session.role;
  }

  revoke(cookieHeader?: string): void {
    const token = readCookie(cookieHeader);
    if (token) this.sessions.delete(hashToken(token));
  }

  private removeExpiredSessions(): void {
    const now = Date.now();
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(key);
    }
  }

  private requireLocalEnvironment(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Route not found.',
      });
    }
  }

  private requireSession(): never {
    throw new UnauthorizedException({
      code: 'AUTH_REQUIRED',
      message: 'Choose a warehouse profile to continue.',
    });
  }
}
