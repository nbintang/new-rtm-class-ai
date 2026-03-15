import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { OauthModule } from './oauth/oauth.module';
import { AppConfigModule } from './config/config.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [AppConfigModule, OauthModule, AiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
