import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID, timingSafeEqual } from 'crypto';
import { AppConfigService } from '../config/config.service';

interface TokenRequestBody {
  grant_type?: string;
  client_id?: string;
  client_secret?: string;
  scope?: string;
}

@Injectable()
export class OauthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: AppConfigService,
  ) {}

  async issueClientCredentialsToken(body: TokenRequestBody) {
    const grantType = body.grant_type?.trim();
    const clientId = body.client_id?.trim();
    const clientSecret = body.client_secret?.trim();
    const scope = body.scope?.trim();

    if (!grantType || !clientId || !clientSecret || !scope) {
      throw new BadRequestException({
        success: false,
        error: 'invalid_request',
        message:
          'grant_type, client_id, client_secret, and scope are required.',
      });
    }

    if (grantType !== 'client_credentials') {
      throw new BadRequestException({
        success: false,
        error: 'unsupported_grant_type',
        message: 'Only grant_type=client_credentials is supported.',
      });
    }

    this.validateClient(clientId, clientSecret);

    const normalizedScope = this.validateAndNormalizeScope(scope);
    const expiresIn = this.resolveTokenTtl();

    const accessToken = await this.jwtService.signAsync(
      { scope: normalizedScope },
      {
        subject: `client:${clientId}`,
        issuer: this.configService.jwtIssuer,
        audience: this.configService.jwtAudience,
        expiresIn,
        jwtid: randomUUID().replace(/-/g, ''),
      },
    );

    return {
      success: true,
      data: {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: normalizedScope,
      },
      message: 'Access token issued.',
      meta: {
        request_id: `req-${randomUUID()}`,
      },
    };
  }

  private validateClient(clientId: string, clientSecret: string) {
    const expectedClientId = this.configService.oauthClientId;
    const expectedClientSecret = this.configService.oauthClientSecret;

    if (!expectedClientId || !expectedClientSecret) {
      throw new InternalServerErrorException({
        success: false,
        error: 'server_error',
        message:
          'OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET must be set in environment.',
      });
    }

    const idOk = this.safeEqual(clientId, expectedClientId);
    const secretOk = this.safeEqual(clientSecret, expectedClientSecret);

    if (!idOk || !secretOk) {
      throw new UnauthorizedException({
        success: false,
        error: 'invalid_client',
        message: 'Invalid client credentials.',
      });
    }
  }

  private validateAndNormalizeScope(scope: string): string {
    const allowedScopes = this.getAllowedScopes();
    const requestedScopes = scope
      .split(' ')
      .map((value) => value.trim())
      .filter(Boolean);

    const uniqueScopes = [...new Set(requestedScopes)];
    if (uniqueScopes.length === 0) {
      throw new BadRequestException({
        success: false,
        error: 'invalid_scope',
        message: 'Scope must contain at least one value.',
      });
    }

    const invalidScopes = uniqueScopes.filter(
      (requested) => !allowedScopes.includes(requested),
    );
    if (invalidScopes.length > 0) {
      throw new BadRequestException({
        success: false,
        error: 'invalid_scope',
        message: `Invalid scope: ${invalidScopes.join(', ')}`,
      });
    }

    return uniqueScopes.join(' ');
  }

  private getAllowedScopes(): string[] {
    const defaultScopes = 'material:write lkpd:write lkpd:read';
    const configured = this.configService.oauthAllowedScopes;
    const scopeSource = configured?.trim() ? configured : defaultScopes;

    return scopeSource
      .split(' ')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  private resolveTokenTtl(): number {
    const value = Number(this.configService.oauthAccessTokenTtl);
    if (!Number.isFinite(value) || value <= 0) {
      return 300;
    }

    return Math.floor(value);
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    if (aBuffer.length !== bBuffer.length) return false;
    return timingSafeEqual(aBuffer, bBuffer);
  }
}
