import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiController } from './ai/ai.controller';
import { AiService } from './ai/ai.service';
import { PrismaService } from './prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [AppController, AiController],
  providers: [AppService, AiService, PrismaService],
})
export class AppModule {}
