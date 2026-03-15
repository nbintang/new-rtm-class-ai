import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<
    Prisma.PrismaClientOptions,
    'query' | 'error' | 'warn' | 'info'
  >
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'info' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');

    // Query logging
    this.$on('query', (e) => {
      this.logger.debug(`Query: ${e.query}`);
      this.logger.debug(`Params: ${e.params}`);
      this.logger.debug(`Duration: ${e.duration}ms`);
    });

    // Error logging
    this.$on('error', (e) => {
      this.logger.error(`Prisma Error: ${e.message}`);
    });

    // Warning logging
    this.$on('warn', (e) => {
      this.logger.warn(`Prisma Warning: ${e.message}`);
    });

    // Info logging
    this.$on('info', (e) => {
      this.logger.log(`Prisma Info: ${e.message}`);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
