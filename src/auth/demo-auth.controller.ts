import { Body, Controller, Get, Headers, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_TTL_SECONDS,
  DemoSessionService,
} from './demo-session.service';
import { CreateDemoSessionDto } from './dto/create-demo-session.dto';

type RequestWithId = { requestId: string };

function sessionCookie(token: string): string {
  return `${DEMO_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DEMO_SESSION_TTL_SECONDS}`;
}

function expiredCookie(): string {
  return `${DEMO_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

@Controller('auth')
export class DemoAuthController {
  constructor(private readonly sessions: DemoSessionService) {}

  @Get('profiles')
  listProfiles(@Req() request: RequestWithId) {
    return this.success(request, this.sessions.listProfiles());
  }

  @Post('session')
  createSession(
    @Req() request: RequestWithId,
    @Headers('cookie') cookieHeader: string | undefined,
    @Body() input: CreateDemoSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = this.sessions.createSession(input.profileId, cookieHeader);
    response.setHeader('Set-Cookie', sessionCookie(session.token));
    return this.success(request, { profile: session.profile });
  }

  @Post('logout')
  logout(
    @Req() request: RequestWithId,
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.sessions.revoke(cookieHeader);
    response.setHeader('Set-Cookie', expiredCookie());
    return this.success(request, { loggedOut: true });
  }

  private success<T>(request: RequestWithId, data: T) {
    return { data, requestId: request.requestId };
  }
}
