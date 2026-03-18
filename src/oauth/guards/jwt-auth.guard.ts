import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppConfigService } from '../../config/config.service';
import type { FastifyRequest } from 'fastify';

type AuthenticatedRequest = FastifyRequest & {
  auth?: Record<string, unknown>;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException({
        success: false,
        error: 'invalid_token',
        message: 'Missing bearer token.',
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.jwtSecret,
        issuer: this.configService.jwtIssuer,
        audience: this.configService.jwtAudience,
      });
      request.auth = payload as Record<string, unknown>;
      return true;
    } catch {
      throw new UnauthorizedException({
        success: false,
        error: 'invalid_token',
        message: 'Invalid or expired token.',
      });
    }
  }

  private extractBearerToken(authorization?: string): string | null {
    if (Array.isArray(authorization)) {
      authorization = authorization[0];
    }

    if (!authorization) return null;
    const [type, token] = authorization.split(' ');
    if (type !== 'Bearer' || !token) return null;
    return token;
  }
}
