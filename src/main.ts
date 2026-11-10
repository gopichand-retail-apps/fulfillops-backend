import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { apiCorsOptions } from './common/api-cors.config';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestContextMiddleware } from './common/request-context.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '16kb' }));
  app.use(helmet());
  app.use(requestContextMiddleware);
  app.setGlobalPrefix('api/v1');
  app.enableCors(apiCorsOptions);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = Number(process.env.PORT ?? 5202);
  await app.listen(port, '127.0.0.1');
}

void bootstrap();
