import { Body, Controller, Post } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { OauthService } from './oauth.service';

@Controller('api')
export class OauthController {
  constructor(private readonly oauthService: OauthService) {}

  @Public()
  @Post('oauth/token')
  async issueToken(@Body() body: Record<string, string>) {
    return this.oauthService.issueClientCredentialsToken(body);
  }
}
