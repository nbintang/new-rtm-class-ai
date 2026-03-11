import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { PromptTemplate } from '@langchain/core/prompts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AIJobStatus, Prisma } from '@prisma/client';
import * as pdf from 'pdf-parse';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { GENERATION_PROMPT, SYSTEM_PROMPT } from './prompts/ai.prompts';

type AIOutputType = 'MCQ' | 'ESSAY' | 'SUMMARY';

interface AIJobOptions {
  count?: number | string;
  maxWords?: number | string;
  mcpEnabled?: boolean;
}

const mcqQuestionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).length(4),
  answer: z.enum(['A', 'B', 'C', 'D', 'a', 'b', 'c', 'd']),
});

const essayQuestionSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  rubric: z.string().trim().min(1),
});

const buildMcqGenerationSchema = (questionCount: number) =>
  z.object({
    questions: z.array(mcqQuestionSchema).length(questionCount),
  });

const buildEssayGenerationSchema = (questionCount: number) =>
  z.object({
    questions: z.array(essayQuestionSchema).length(questionCount),
  });

const summaryGenerationSchema = z.object({
  summary: z.string().trim().min(1),
});

type McqGenerationResult = z.infer<ReturnType<typeof buildMcqGenerationSchema>>;
type EssayGenerationResult = z.infer<
  ReturnType<typeof buildEssayGenerationSchema>
>;
type SummaryGenerationResult = z.infer<typeof summaryGenerationSchema>;
type JsonInvocationResult = {
  rawText: string;
  json: unknown;
};

@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private readonly model: ChatGroq;
  private mcpClient: Client | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.model = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'qwen/qwen3-32b',
      temperature: 0.1,
    });
  }

  async onModuleInit() {
    this.logger.log('AI Service Initialized with Groq');
    await this.initMcpClient();
  }

  private async initMcpClient() {
    try {
      this.mcpClient = new Client(
        { name: 'rtm-class-ai-client', version: '1.0.0' },
        { capabilities: {} },
      );

      const mcpUrl = process.env.MCP_SERVER_URL || 'http://localhost:5002/mcp';
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));

      await this.mcpClient.connect(transport);
      this.logger.log(`Connected to MCP Server at ${mcpUrl}`);
    } catch (error) {
      this.mcpClient = null;
      this.logger.error(
        `Failed to connect to MCP Server: ${this.getErrorMessage(error)}`,
      );
    }
  }

  async processJob(
    jobId: string,
    materialId: string,
    type: string,
    file: Express.Multer.File,
    options: AIJobOptions,
  ) {
    this.assertSupportedType(type);
    this.logger.log(`Structured generation starting ${type} job: ${jobId}`);

    try {
      const text = await this.extractText(file);
      const content = await this.generateContent(type, text, options);

      await this.saveAiOutput(jobId, materialId, type, content, options);

      this.logger.log(
        `Structured generation successfully finished job ${jobId}`,
      );
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(
        `Structured generation failed job ${jobId}: ${message}`,
      );
      await this.prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: AIJobStatus.failed_processing,
          lastError: message,
          completedAt: new Date(),
        },
      });
    }
  }

  private async generateContent(
    type: AIOutputType,
    text: string,
    options: AIJobOptions,
  ): Promise<Record<string, unknown>> {
    const questionCount = this.resolveCount(options.count, 5);
    const prompt = await this.buildGenerationPrompt(
      type,
      text,
      options,
      questionCount,
    );

    if (type === 'MCQ') {
      const generated = await this.generateValidatedJson(
        type,
        buildMcqGenerationSchema(questionCount),
        prompt,
        questionCount,
      );
      return this.normalizeMcqContent(generated);
    }

    if (type === 'ESSAY') {
      const generated = await this.generateValidatedJson(
        type,
        buildEssayGenerationSchema(questionCount),
        prompt,
        questionCount,
      );
      return this.normalizeEssayContent(generated);
    }

    const generated = await this.generateValidatedJson(
      type,
      summaryGenerationSchema,
      prompt,
    );
    return this.normalizeSummaryContent(generated, options);
  }

  private async generateValidatedJson<TSchema extends z.ZodTypeAny>(
    type: AIOutputType,
    schema: TSchema,
    prompt: string,
    expectedQuestionCount?: number,
  ): Promise<z.infer<TSchema>> {
    let currentPrompt = prompt;
    let lastRawText = '';
    let lastErrorMessage = 'Unknown structured output failure.';

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const invocation = await this.invokeJsonObject(currentPrompt);
        lastRawText = invocation.rawText;
        return schema.parse(invocation.json);
      } catch (error) {
        lastErrorMessage = this.getErrorMessage(error);
        this.logger.warn(
          `Structured JSON validation failed for ${type} attempt ${attempt}: ${lastErrorMessage}`,
        );

        if (attempt === 3) {
          break;
        }

        currentPrompt = this.buildRepairPrompt(
          type,
          lastRawText,
          lastErrorMessage,
          expectedQuestionCount,
        );
      }
    }

    throw new Error(
      `Unable to produce valid ${type} JSON after retries. Last error: ${lastErrorMessage}. Last output: ${lastRawText}`,
    );
  }

  private async buildGenerationPrompt(
    type: AIOutputType,
    text: string,
    options: AIJobOptions,
    questionCount = this.resolveCount(options.count, 5),
  ): Promise<string> {
    const maxWords = this.resolveMaxWords(options.maxWords, 200);
    const taskInstructions = this.buildTaskInstructions(
      type,
      questionCount,
      maxWords,
    );

    return PromptTemplate.fromTemplate(
      `${SYSTEM_PROMPT}\n\n${GENERATION_PROMPT}`,
    ).format({
      text:
        text.trim().slice(0, 12000) ||
        'Materi tidak memiliki teks yang bisa diekstrak.',
      type,
      taskInstructions,
    });
  }

  private buildTaskInstructions(
    type: AIOutputType,
    questionCount: number,
    maxWords: number,
  ) {
    if (type === 'MCQ') {
      return [
        `Buat ${questionCount} soal pilihan ganda berdasarkan materi.`,
        'Gunakan struktur: { "questions": [{ "id": "q1", "text": "...", "options": ["...", "...", "...", "..."], "answer": "A" }] }.',
        'Setiap soal harus memiliki satu jawaban benar yang jelas.',
        'Opsi jawaban harus singkat, tidak duplikat, dan tidak semuanya benar.',
        'Jangan hasilkan field lain di level atas selain "questions".',
      ].join(' ');
    }

    if (type === 'ESSAY') {
      return [
        `Buat ${questionCount} soal essay berdasarkan materi.`,
        'Gunakan struktur: { "questions": [{ "id": "q1", "text": "...", "rubric": "..." }] }.',
        'Rubrik harus ringkas dan langsung bisa dipakai guru untuk menilai jawaban.',
        'Jangan hasilkan field lain di level atas selain "questions".',
      ].join(' ');
    }

    return [
      `Buat ringkasan materi maksimal ${maxWords} kata.`,
      'Gunakan struktur: { "summary": "..." }.',
      'Fokus pada inti konsep, tujuan, dan poin penting materi.',
      'Jangan hasilkan field lain di level atas selain "summary".',
    ].join(' ');
  }

  private async invokeJsonObject(
    prompt: string,
  ): Promise<JsonInvocationResult> {
    const jsonModel = this.model.withConfig({
      response_format: { type: 'json_object' },
    });
    const response = await jsonModel.invoke(prompt);
    const rawText = this.extractMessageText(response.content);

    try {
      return {
        rawText,
        json: JSON.parse(rawText),
      };
    } catch {
      throw new Error(`Model returned invalid JSON text: ${rawText}`);
    }
  }

  private buildRepairPrompt(
    type: AIOutputType,
    rawText: string,
    validationError: string,
    expectedQuestionCount?: number,
  ) {
    return [
      `Perbaiki JSON berikut agar valid untuk output ${type}.`,
      'Jawaban WAJIB berupa JSON valid saja.',
      `Kesalahan validasi sebelumnya: ${validationError}.`,
      `JSON sebelumnya: ${rawText || '{}'}.`,
      `Struktur yang wajib dipenuhi: ${this.getSchemaInstruction(type, expectedQuestionCount)}.`,
      'Jangan tambahkan field lain di level atas.',
    ].join(' ');
  }

  private getSchemaInstruction(
    type: AIOutputType,
    expectedQuestionCount?: number,
  ) {
    if (type === 'MCQ') {
      const countInstruction = expectedQuestionCount
        ? `"questions" wajib berisi tepat ${expectedQuestionCount} soal. `
        : '';
      return `${countInstruction}{ "questions": [{ "id": "q1", "text": "pertanyaan", "options": ["opsi A", "opsi B", "opsi C", "opsi D"], "answer": "A" }] }`;
    }

    if (type === 'ESSAY') {
      const countInstruction = expectedQuestionCount
        ? `"questions" wajib berisi tepat ${expectedQuestionCount} soal. `
        : '';
      return `${countInstruction}{ "questions": [{ "id": "q1", "text": "pertanyaan", "rubric": "pedoman penilaian" }] }`;
    }

    return '{ "summary": "ringkasan materi" }';
  }

  private normalizeMcqContent(
    generated: McqGenerationResult,
  ): Record<string, unknown> {
    return {
      type: 'MCQ',
      generatedAt: new Date().toISOString(),
      questions: generated.questions.map((question, index) => ({
        id: question.id.trim() || `q${index + 1}`,
        text: question.text.trim(),
        options: question.options.map((option) => option.trim()),
        answer: question.answer.toUpperCase(),
      })),
    };
  }

  private normalizeEssayContent(
    generated: EssayGenerationResult,
  ): Record<string, unknown> {
    return {
      type: 'ESSAY',
      generatedAt: new Date().toISOString(),
      questions: generated.questions.map((question, index) => ({
        id: question.id.trim() || `q${index + 1}`,
        text: question.text.trim(),
        rubric: question.rubric.trim(),
      })),
    };
  }

  private normalizeSummaryContent(
    generated: SummaryGenerationResult,
    options: AIJobOptions,
  ): Record<string, unknown> {
    return {
      type: 'SUMMARY',
      generatedAt: new Date().toISOString(),
      summary: this.limitWords(
        generated.summary.trim(),
        this.resolveMaxWords(options.maxWords, 200),
      ),
    };
  }

  private async saveAiOutput(
    jobId: string,
    materialId: string,
    type: AIOutputType,
    content: Record<string, unknown>,
    options: AIJobOptions,
  ) {
    if (options.mcpEnabled === false) {
      await this.prisma.aiOutput.create({
        data: {
          jobId,
          materialId,
          type,
          content: this.toInputJsonValue(content),
          isPublished: false,
        },
      });

      await this.prisma.aiJob.update({
        where: { id: jobId },
        data: {
          status: AIJobStatus.succeeded,
          completedAt: new Date(),
          lastError: null,
        },
      });
      return;
    }

    if (!this.mcpClient) {
      throw new Error('MCP client is not connected.');
    }

    const toolName = this.getSaveToolName(type);
    this.logger.log(
      `Saving ${type} AI output via MCP tool ${toolName} for job ${jobId}`,
    );
    const result = await this.mcpClient.callTool({
      name: toolName,
      arguments: {
        jobId,
        materialId,
        content,
      },
    });

    if (result.isError) {
      throw new Error(`MCP tool ${toolName} returned an error.`);
    }

    const structuredContent =
      result.structuredContent && typeof result.structuredContent === 'object'
        ? (result.structuredContent as Record<string, unknown>)
        : undefined;
    const success =
      typeof structuredContent?.success === 'boolean'
        ? structuredContent.success
        : undefined;

    if (success === false) {
      const message =
        typeof structuredContent?.message === 'string'
          ? structuredContent.message
          : `MCP tool ${toolName} failed.`;
      throw new Error(message);
    }
  }

  private async extractText(file: Express.Multer.File): Promise<string> {
    if (file.mimetype === 'application/pdf') {
      const pdfParser = pdf as unknown as (
        b: Buffer,
      ) => Promise<{ text: string }>;
      const data = await pdfParser(file.buffer);
      return data.text;
    }

    if (
      file.mimetype ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      throw new Error(
        'PPTX extraction is not supported yet by this AI service.',
      );
    }

    return file.buffer.toString('utf-8');
  }

  private resolveCount(value: number | string | undefined, fallback: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(100, Math.max(1, Math.trunc(parsed)));
  }

  private resolveMaxWords(
    value: number | string | undefined,
    fallback: number,
  ) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(2000, Math.max(50, Math.trunc(parsed)));
  }

  private limitWords(text: string, maxWords: number) {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      return text;
    }

    return words.slice(0, maxWords).join(' ');
  }

  private assertSupportedType(type: string): asserts type is AIOutputType {
    if (type === 'MCQ' || type === 'ESSAY' || type === 'SUMMARY') {
      return;
    }

    throw new Error(`Unsupported AI output type: ${type}`);
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof z.ZodError) {
      return JSON.stringify(error.issues);
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return 'Unknown AI processing error';
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private getSaveToolName(type: AIOutputType) {
    if (type === 'MCQ') {
      return 'save_mcq_output';
    }

    if (type === 'ESSAY') {
      return 'save_essay_output';
    }

    return 'save_summary_output';
  }

  private extractMessageText(content: unknown): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const text = content
        .map((part) => {
          if (typeof part === 'string') {
            return part;
          }

          if (part && typeof part === 'object') {
            const value = part as Record<string, unknown>;
            if (typeof value.text === 'string') {
              return value.text;
            }
          }

          return '';
        })
        .join('')
        .trim();

      if (text) {
        return text;
      }
    }

    throw new Error('Model returned empty response content.');
  }
}
