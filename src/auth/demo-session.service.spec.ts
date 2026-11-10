import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  DEMO_SESSION_COOKIE,
  MAX_DEMO_SESSIONS,
  DemoSessionService,
} from './demo-session.service';

describe('DemoSessionService', () => {
  let service: DemoSessionService;

  beforeEach(() => {
    service = new DemoSessionService();
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
    jest.restoreAllMocks();
  });

  it('lists role profiles without exposing credentials', () => {
    expect(service.listProfiles()).toEqual([
      { id: 'picker', role: 'picker' },
      { id: 'packer', role: 'packer' },
      { id: 'warehouse_manager', role: 'warehouse_manager' },
    ]);
  });

  it('stores only a token hash and resolves its server-owned role', () => {
    const session = service.createSession('warehouse_manager');

    expect(session.token).toMatch(/^[a-f0-9]{64}$/);
    expect(session.profile).toEqual({
      id: 'warehouse_manager',
      role: 'warehouse_manager',
    });
    expect(
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${session.token}`),
    ).toBe('warehouse_manager');
    expect(() =>
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${'a'.repeat(64)}`),
    ).toThrow(UnauthorizedException);
  });

  it('rejects unknown profiles and missing or malformed sessions', () => {
    expect(() => service.createSession('administrator')).toThrow(
      UnauthorizedException,
    );
    expect(() => service.roleForSession()).toThrow(UnauthorizedException);
    expect(() =>
      service.roleForSession(`${DEMO_SESSION_COOKIE}=invalid`),
    ).toThrow(UnauthorizedException);
  });

  it('expires sessions and replaces a prior profile session', () => {
    const first = service.createSession('picker');
    const firstCookie = `${DEMO_SESSION_COOKIE}=${first.token}`;
    const second = service.createSession('packer', firstCookie);

    expect(() => service.roleForSession(firstCookie)).toThrow(
      UnauthorizedException,
    );
    expect(
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${second.token}`),
    ).toBe('packer');

    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 9 * 60 * 60 * 1000);
    expect(() =>
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${second.token}`),
    ).toThrow(UnauthorizedException);
  });

  it('removes expired entries when issuing a fresh session', () => {
    const previous = service.createSession('picker');
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 9 * 60 * 60 * 1000);
    const current = service.createSession('packer');

    expect(() =>
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${previous.token}`),
    ).toThrow(UnauthorizedException);
    expect(
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${current.token}`),
    ).toBe('packer');
  });

  it('caps process-local sessions and evicts the oldest entry', () => {
    const tokens: string[] = [];
    for (let index = 0; index <= MAX_DEMO_SESSIONS; index += 1) {
      tokens.push(service.createSession('picker').token);
    }

    expect(() =>
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${tokens[0]}`),
    ).toThrow(UnauthorizedException);
    const currentToken = tokens[tokens.length - 1];
    if (!currentToken) throw new Error('Expected the newest session token.');
    expect(
      service.roleForSession(`${DEMO_SESSION_COOKIE}=${currentToken}`),
    ).toBe('picker');
  });

  it('ignores logout when no session cookie exists', () => {
    expect(() => service.revoke()).not.toThrow();
  });

  it('disables local profile selection in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => service.listProfiles()).toThrow(NotFoundException);
    expect(() => service.createSession('picker')).toThrow(NotFoundException);
  });
});
