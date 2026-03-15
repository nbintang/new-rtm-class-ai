import { Module } from '@nestjs/common';
import { AiService } from './services/ai.service';
import { AiController } from './ai.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { GroqProvider } from './services/groq.provider';
import { McpClientService } from './services/mcp-client.service';

@Module({
  imports: [PrismaModule],
  providers: [AiService, GroqProvider, McpClientService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
