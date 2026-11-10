import { Controller, Get, Header, Req } from '@nestjs/common';
import { APP_VERSION } from './app-version';

type RequestWithId = { requestId: string };

@Controller()
export class AppController {
  @Get('health')
  getHealth(@Req() request: RequestWithId) {
    return {
      data: { status: 'ok' },
      requestId: request.requestId,
    };
  }

  @Get('version')
  @Header('Cache-Control', 'no-store')
  getVersion(@Req() request: RequestWithId) {
    return {
      data: { service: 'fulfillops-api', version: APP_VERSION },
      requestId: request.requestId,
    };
  }
}
