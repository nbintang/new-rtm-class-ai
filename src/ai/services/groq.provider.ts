import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { AppConfigService } from '../../config/config.service';

@Injectable()
export class GroqProvider implements OnModuleInit {
  private readonly logger = new Logger(GroqProvider.name);
  private modelInstance: ChatGroq | null = null;

  constructor(private readonly configService: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    this.modelInstance = new ChatGroq({
      apiKey: this.configService.groqApiKey,
      model: 'qwen/qwen3-32b',
      temperature: 0.1,
      maxTokens: 8192,
    });
    this.logger.log('Groq model initialized');
  }

  get model(): ChatGroq {
    if (!this.modelInstance) {
      throw new Error('Groq model is not initialized yet.');
    }
    return this.modelInstance;
  }
}
