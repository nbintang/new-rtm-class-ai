import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const port = process.env.PORT || 5001;
  const corsOrigins = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const corsOptions: CorsOptions = {
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  };

  app.enableCors(corsOptions);

  await app.listen(port);
  logger.log(`AI Service is running on: http://localhost:${port}`);
}
bootstrap();
