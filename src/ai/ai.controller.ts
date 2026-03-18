import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Logger,
  Req,
} from '@nestjs/common';
import { AiService } from './services/ai.service';
import {
  essayRequestSchema,
  mcqRequestSchema,
  summaryRequestSchema,
} from './dto/ai-request.dto';
import type {
  EssayRequestDto,
  McqRequestDto,
  SummaryRequestDto,
} from './dto/ai-request.dto';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import type { UploadedFile } from './interfaces/uploaded-file.interface';

@Controller('api')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('mcq')
  async generateMcq(
    @Req() request: FastifyRequest,
    @Body(new ZodValidationPipe(mcqRequestSchema)) body: McqRequestDto,
  ) {
    this.logger.log(`Received MCQ Request for Job ID: ${body.job_id}`);
    const file = await this.extractUploadedFile(request);

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
  async generateEssay(
    @Req() request: FastifyRequest,
    @Body(new ZodValidationPipe(essayRequestSchema)) body: EssayRequestDto,
  ) {
    this.logger.log(`Received Essay Request for Job ID: ${body.job_id}`);
    const file = await this.extractUploadedFile(request);

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
  async generateSummary(
    @Req() request: FastifyRequest,
    @Body(new ZodValidationPipe(summaryRequestSchema)) body: SummaryRequestDto,
  ) {
    this.logger.log(`Received Summary Request for Job ID: ${body.job_id}`);
    const file = await this.extractUploadedFile(request);

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

  private async extractUploadedFile(request: FastifyRequest): Promise<UploadedFile> {
    const multipartRequest = request as FastifyRequest & {
      file: () => Promise<MultipartFile | undefined>;
    };

    if (typeof multipartRequest.file !== 'function') {
      throw new BadRequestException('Expected multipart/form-data request.');
    }

    const file = await multipartRequest.file();
    if (!file) {
      throw new BadRequestException('Missing file field.');
    }

    const buffer = await file.toBuffer();

    return {
      buffer,
      mimetype: file.mimetype,
      originalname: file.filename,
      size: buffer.length,
    };
  }
}
