import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import appConfig from './config';
import validateEnv from './config.schema';
import { AppConfigService } from './config.service';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig],
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [NestConfigModule, AppConfigService],
})
export class AppConfigModule {}