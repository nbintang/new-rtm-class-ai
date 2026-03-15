import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

@Controller('api')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

  @Post('mcq')
  @UseInterceptors(FileInterceptor('file'))
  async generateMcq(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(mcqRequestSchema)) body: McqRequestDto,
  ) {
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
  @UseInterceptors(FileInterceptor('file'))
  async generateEssay(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(essayRequestSchema)) body: EssayRequestDto,
  ) {
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
  @UseInterceptors(FileInterceptor('file'))
  async generateSummary(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(summaryRequestSchema)) body: SummaryRequestDto,
  ) {
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
}
