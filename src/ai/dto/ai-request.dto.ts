import { z } from 'zod';

const booleanLikeSchema = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return value.toLowerCase() === 'true';
  });

const aiRequestBaseSchema = z.object({
  job_id: z.string().min(1, 'job_id is required'),
  material_id: z.string().min(1, 'material_id is required'),
  mcp_enabled: booleanLikeSchema.optional().default(false),
});

export const mcqRequestSchema = aiRequestBaseSchema.extend({
  mcq_count: z.coerce.number().int().min(1).max(100).default(5),
});

export const essayRequestSchema = aiRequestBaseSchema.extend({
  essay_count: z.coerce.number().int().min(1).max(100).default(5),
});

export const summaryRequestSchema = aiRequestBaseSchema.extend({
  summary_max_words: z.coerce.number().int().min(50).max(2000).default(200),
});

export type McqRequestDto = z.infer<typeof mcqRequestSchema>;
export type EssayRequestDto = z.infer<typeof essayRequestSchema>;
export type SummaryRequestDto = z.infer<typeof summaryRequestSchema>;
