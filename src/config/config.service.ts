import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import appConfig from './config';

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  get databaseUrl(): string {
    return this.config.databaseUrl;
  }

  get groqApiKey(): string {
    return this.config.groqApiKey;
  }

  get port(): number {
    return this.config.port;
  }

  get mcpServerUrl(): string {
    return this.config.mcpServerUrl;
  }

  get corsOrigin(): string {
    return this.config.corsOrigin;
  }

  get corsOrigins(): string[] {
    return this.config.corsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get oauthClientId(): string {
    return this.config.oauthClientId;
  }

  get oauthClientSecret(): string {
    return this.config.oauthClientSecret;
  }

  get oauthAllowedScopes(): string {
    return this.config.oauthAllowedScopes;
  }

  get oauthAccessTokenTtl(): number {
    return this.config.oauthAccessTokenTtl;
  }

  get jwtSecret(): string {
    return this.config.jwtSecret;
  }

  get jwtIssuer(): string {
    return this.config.jwtIssuer;
  }

  get jwtAudience(): string {
    return this.config.jwtAudience;
  }
}
