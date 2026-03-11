// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  
  // Port default 5001 agar tidak bentrok dengan backend lama (5000)
  const port = process.env.PORT || 5001;

  app.enableCors();
  
  await app.listen(port);
  logger.log(`AI Service is running on: http://localhost:${port}`);
}
bootstrap();
