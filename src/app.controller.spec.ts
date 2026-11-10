import { AppController } from './app.controller';

describe('AppController', () => {
  it('returns a correlated health response', () => {
    const appController = new AppController();

    expect(appController.getHealth({ requestId: 'request-0001' })).toEqual({
      data: { status: 'ok' },
      requestId: 'request-0001',
    });
  });

  it('returns the backend package version', () => {
    const appController = new AppController();

    expect(appController.getVersion({ requestId: 'request-0002' })).toEqual({
      data: { service: 'fulfillops-api', version: '1.0.0' },
      requestId: 'request-0002',
    });
  });
});
