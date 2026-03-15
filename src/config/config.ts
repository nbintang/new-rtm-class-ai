import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  databaseUrl: process.env.DATABASE_URL || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  port: Number(process.env.PORT || 5001),
  mcpServerUrl: process.env.MCP_SERVER_URL || 'http://localhost:5002/mcp',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  oauthClientId: process.env.OAUTH_CLIENT_ID || '',
  oauthClientSecret: process.env.OAUTH_CLIENT_SECRET || '',
  oauthAllowedScopes:  process.env.OAUTH_ALLOWED_SCOPES || 'material:write lkpd:write lkpd:read',
  oauthAccessTokenTtl: Number(process.env.OAUTH_ACCESS_TOKEN_TTL || 300),
  jwtSecret: process.env.JWT_SECRET || '',
  jwtIssuer: process.env.JWT_ISSUER || 'my-backend',
  jwtAudience: process.env.JWT_AUDIENCE || 'rtm-class-ai',
}));
