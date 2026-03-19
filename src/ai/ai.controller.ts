import {
  BadRequestException,
  Controller,
  Post,
  Logger,
  Req,
} from '@nestjs/common';
import { AiService } from './services/ai.service';
import {
  essayRequestSchema,
  mcqRequestSchema,
  summaryRequestSchema,
} from './dto/ai-request.dto';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import type { UploadedFile } from './interfaces/uploaded-file.interface';
import type { ZodType } from 'zod';

@Controller('api')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('mcq')
  async generateMcq(@Req() request: FastifyRequest) {
    const { body, file } = await this.extractMultipartPayload(
      request,
      mcqRequestSchema,
    );
    this.logger.log(`Received MCQ Request for Job ID: ${body.job_id}`);

    void this.aiService.processJob(
      body.job_id,
      body.material_id,
      'MCQ',
      file,
      {
        count: body.mcq_count,
        mcpEnabled: body.mcp_enabled,
      },
    );

    return {
      success: true,
      message: 'MCQ job received and processing in background',
      job_id: body.job_id,
    };
  }

  @Post('essay')
  async generateEssay(@Req() request: FastifyRequest) {
    const { body, file } = await this.extractMultipartPayload(
      request,
      essayRequestSchema,
    );
    this.logger.log(`Received Essay Request for Job ID: ${body.job_id}`);

    void this.aiService.processJob(
      body.job_id,
      body.material_id,
      'ESSAY',
      file,
      {
        count: body.essay_count,
        mcpEnabled: body.mcp_enabled,
      },
    );

    return {
      success: true,
      message: 'Essay job received and processing in background',
      job_id: body.job_id,
    };
  }

  @Post('summary')
  async generateSummary(@Req() request: FastifyRequest) {
    const { body, file } = await this.extractMultipartPayload(
      request,
      summaryRequestSchema,
    );
    this.logger.log(`Received Summary Request for Job ID: ${body.job_id}`);

    void this.aiService.processJob(
      body.job_id,
      body.material_id,
      'SUMMARY',
      file,
      {
        maxWords: body.summary_max_words,
        mcpEnabled: body.mcp_enabled,
      },
    );

    return {
      success: true,
      message: 'Summary job received and processing in background',
      job_id: body.job_id,
    };
  }

  private async extractMultipartPayload<TBody>(
    request: FastifyRequest,
    schema: ZodType<TBody>,
  ): Promise<{ body: TBody; file: UploadedFile }> {
    if (typeof request.parts !== 'function') {
      throw new BadRequestException('Expected multipart/form-data request.');
    }

    const fields: Record<string, unknown> = {};
    let uploadedFile: UploadedFile | null = null;

    for await (const part of request.parts()) {
      if (part.type === 'field') {
        fields[part.fieldname] = part.value;
        continue;
      }

      if (uploadedFile) {
        await part.toBuffer();
        throw new BadRequestException('Only one file field is supported.');
      }

      const filePart = part as MultipartFile;
      const buffer = await filePart.toBuffer();
      uploadedFile = {
        buffer,
        mimetype: filePart.mimetype,
        originalname: filePart.filename,
        size: buffer.length,
      };
    }

    if (!uploadedFile) {
      throw new BadRequestException('Missing file field.');
    }

    const parsed = schema.safeParse(fields);
    if (!parsed.success) {
      throw new BadRequestException({
        success: false,
        error: 'validation_error',
        message: 'Invalid request body.',
        details: parsed.error.flatten(),
      });
    }

    return {
      body: parsed.data,
      file: uploadedFile,
    };
  }
}
