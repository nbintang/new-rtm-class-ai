import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from '../config/config.module';
import { AppConfigService } from '../config/config.service';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    AppConfigModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (configService: AppConfigService) => ({
        secret: configService.jwtSecret,
        signOptions: {
          issuer: configService.jwtIssuer,
          audience: configService.jwtAudience,
        },
      }),
    }),
  ],
  controllers: [OauthController],
  providers: [
    OauthService,
    JwtAuthGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [JwtModule, JwtAuthGuard],
})
export class OauthModule {}
