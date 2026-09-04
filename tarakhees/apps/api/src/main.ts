import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);

  new Logger('Bootstrap').log(`الخادم يعمل على http://localhost:${port}/api`);
}

void bootstrap();
