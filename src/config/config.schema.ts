import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(5001),
  MCP_SERVER_URL: z.string().url(),
  CORS_ORIGIN: z.string().min(1).default('*'),
  OAUTH_CLIENT_ID: z.string().min(1),
  OAUTH_CLIENT_SECRET: z.string().min(1),
  OAUTH_ALLOWED_SCOPES: z.string().min(1),
  OAUTH_ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(300),
  JWT_SECRET: z.string().min(1),
  JWT_ISSUER: z.string().min(1).default('my-backend'),
  JWT_AUDIENCE: z.string().min(1).default('rtm-class-ai'),
});

export default function validateEnv(config: Record<string, unknown>) {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Environment validation failed: ${errors}`);
  }

  return parsed.data;
}
