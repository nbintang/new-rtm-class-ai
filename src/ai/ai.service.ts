import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChatGroq } from '@langchain/groq';
import { PromptTemplate } from '@langchain/core/prompts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AIJobStatus, Prisma } from '@prisma/client';
// pdf-parse will be required locally in extractText to avoid import issues
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import {
  AGENT_SYSTEM_PROMPT,
  AGENT_USER_PROMPT,
} from './prompts/ai.prompts';
import { createAgent } from 'langchain';
import { DynamicStructuredTool } from '@langchain/core/tools';

type AIOutputType = 'MCQ' | 'ESSAY' | 'SUMMARY';

interface AIJobOptions {
  count?: number | string;
  maxWords?: number | string;
  mcpEnabled?: boolean;
}

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
      maxTokens: 8192,
    });
  }

  async onModuleInit() {
    this.logger.log('AI Service Initialized with Groq');
    await this.initMcpClient();
  }

  private async initMcpClient() {
    if (this.mcpClient) return;
    try {
      this.mcpClient = new Client(
        { name: 'rtm-class-ai-client', version: '1.0.0' },
        { capabilities: {} },
      );
      this.logger.log('MCP Client instance created');
    } catch (error) {
      this.logger.error(`Failed to create MCP Client: ${this.getErrorMessage(error)}`);
    }
  }

  private async ensureMcpConnected() {
    await this.initMcpClient();
    if (!this.mcpClient) {
      throw new Error('MCP Client is not initialized');
    }

    // @ts-ignore - Jika sudah ada transport, tidak perlu connect lagi
    if (this.mcpClient.transport) {
      return;
    }

    try {
      const mcpUrl = process.env.MCP_SERVER_URL || 'http://localhost:5002/mcp';
      this.logger.log(`Establishing new MCP session at ${mcpUrl}...`);
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
      await this.mcpClient.connect(transport);
      this.logger.log(`Successfully established session with MCP Server`);
    } catch (error) {
      if (error.message.includes('Already connected')) return;
      this.logger.error(
        `Failed to establish MCP session: ${this.getErrorMessage(error)}`,
      );
      throw error;
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
    this.logger.log(`LangChain Agent starting ${type} job: ${jobId}`);

    try {
      const text = await this.extractText(file);
      this.logger.debug(`Extracted text (len: ${text.length}): ${text.substring(0, 200)}...`);
      const questionCount = this.resolveCount(options.count, 5);

      const toolNameForAgent = this.getSaveToolName(type as AIOutputType);

      // Definisi Tool untuk Agent
      const saveTool = new DynamicStructuredTool({
        name: toolNameForAgent,
        description: `Simpan hasil generate ${type} ke database.`,
        schema: z.object({
          content: z
            .any()
            .describe('Objek JSON hasil generate yang sudah rapi.'),
        }),
        func: async (args) => {
          this.logger.log(`Agent memanggil tool ${toolNameForAgent} untuk job ${jobId}`);
          this.logger.debug(`Raw content dari AI: ${JSON.stringify(args.content)}`);

          let normalizedContent = args.content;
          try {
            if (type === 'MCQ') {
              normalizedContent = this.normalizeMcqContent(args.content);
            } else if (type === 'ESSAY') {
              normalizedContent = this.normalizeEssayContent(args.content);
            } else if (type === 'SUMMARY') {
              normalizedContent = this.normalizeSummaryContent(args.content, options);
            }
            this.logger.log(`Data berhasil dinormalisasi untuk job ${jobId}`);
          } catch (e) {
            this.logger.warn(`Gagal normalisasi otomatis: ${e.message}. Mengirim data asli.`);
          }

          await this.saveAiOutput(
            jobId,
            materialId,
            type as AIOutputType,
            normalizedContent,
            options,
          );
          return `BERHASIL: Konten telah disimpan ke database. Tugas Anda SELESAI. Jangan memanggil tool ini lagi untuk job yang sama.`;
        },
      });

      // Format Prompts
      const formattedSystemPrompt = await PromptTemplate.fromTemplate(
        AGENT_SYSTEM_PROMPT,
      ).format({
        text: text.substring(0, 10000),
        type,
        count: questionCount,
        toolName: toolNameForAgent, // Oper nama tool ke prompt
      });

      const formattedUserPrompt = await PromptTemplate.fromTemplate(AGENT_USER_PROMPT).format({
        type,
        count: questionCount,
      });

      // Inisialisasi Agent
      const agent = createAgent({
        model: this.model,
        tools: [saveTool],
        systemPrompt: formattedSystemPrompt,
      });

      // Jalan!
      await agent.invoke(
        {
          messages: [{ role: 'human', content: formattedUserPrompt }],
        },
        {
          recursionLimit: 50, // Naikkan limit sedikit untuk berjaga-jaga
        },
      );

      this.logger.log(`LangChain Agent successfully finished job ${jobId}`);
    } catch (error) {
      const message = this.getErrorMessage(error);
      this.logger.error(`LangChain Agent failed job ${jobId}: ${message}`);
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

  private normalizeMcqContent(generated: any): Record<string, unknown> {
    const rawQuestions =
      generated?.questions ||
      generated?.mcq_questions ||
      generated?.MCQ ||
      generated?.content?.questions ||
      generated?.content?.mcq_questions ||
      generated?.content?.MCQ ||
      (Array.isArray(generated) ? generated : []);

    const questions = rawQuestions
      .map((q: any, i: number) => {
        const options = (Array.isArray(q.options) ? q.options : [])
          .slice(0, 4)
          .map((opt: any) => String(opt).trim());

        let answer = String(q.answer || 'A').trim();
        const foundIndex = options.findIndex(
          (opt) => opt.toLowerCase() === answer.toLowerCase(),
        );

        if (foundIndex !== -1) {
          answer = String.fromCharCode(65 + foundIndex);
        } else {
          const upperAnswer = answer.toUpperCase();
          if (upperAnswer === '0') answer = 'A';
          else if (upperAnswer === '1') answer = 'B';
          else if (upperAnswer === '2') answer = 'C';
          else if (upperAnswer === '3') answer = 'D';
          else answer = upperAnswer.charAt(0);
        }

        return {
          id: (q.id || `q${i + 1}`).toString(),
          text: (q.text || q.question || '').trim(),
          options,
          answer: ['A', 'B', 'C', 'D'].includes(answer) ? answer : 'A',
          points: Number(q.points || 10),
        };
      })
      .filter((q: any) => q.text && q.options.length === 4);

    const defaultPoints = Math.floor(100 / (questions.length || 1)) || 5;

    // Map dengan poin (pake poin AI kalau ada, kalau nggak pake default)
    const processedQuestions = questions.map((q) => ({
      ...q,
      points: Number(q.points || defaultPoints),
    }));

    // Auto-Rebalance agar total points pas 100
    if (processedQuestions.length > 0) {
      const sumOfOthers = processedQuestions
        .slice(0, -1)
        .reduce((sum, q) => sum + q.points, 0);
      
      // Soal terakhir mengambil SISA agar total PAS 100
      let lastPoint = 100 - sumOfOthers;
      
      // Keamanan: Jika sisa terlalu kecil (<= 0), paksa soal terakhir punya poin
      if (lastPoint <= 0) {
        lastPoint = 5;
        // Kita tidak bisa memaksa 100 jika jumlah soal terlalu banyak, 
        // tapi ini jauh lebih baik daripada 113.
      }
      
      processedQuestions[processedQuestions.length - 1].points = lastPoint;
    }

    return {
      type: 'MCQ',
      generatedAt: new Date().toISOString(),
      questions: processedQuestions,
    };
  }

  private normalizeEssayContent(generated: any): Record<string, unknown> {
    const rawQuestions =
      generated?.questions ||
      generated?.ESSAY ||
      generated?.content?.questions ||
      generated?.content?.ESSAY ||
      (Array.isArray(generated) ? generated : []);

    const questions = rawQuestions
      .map((q: any, i: number) => ({
        id: (q.id || `q${i + 1}`).toString(),
        text: (q.text || q.question || '').trim(),
        rubric: (q.rubric || q.answer || 'Tidak ada rubrik spesifik.').trim(),
        points: Number(q.points || 10),
      }))
      .filter((q: any) => q.text);

    const defaultPoints = Math.floor(100 / (questions.length || 1)) || 5;

    const processedQuestions = questions.map((q) => ({
      ...q,
      points: Number(q.points || defaultPoints),
    }));

    // Auto-Rebalance agar total points pas 100
    if (processedQuestions.length > 0) {
      const sumOfOthers = processedQuestions
        .slice(0, -1)
        .reduce((sum, q) => sum + q.points, 0);
      
      let lastPoint = 100 - sumOfOthers;
      if (lastPoint <= 0) lastPoint = 5;
      
      processedQuestions[processedQuestions.length - 1].points = lastPoint;
    }

    return {
      type: 'ESSAY',
      generatedAt: new Date().toISOString(),
      questions: processedQuestions,
    };
  }

  private normalizeSummaryContent(
    generated: any,
    options: AIJobOptions,
  ): Record<string, unknown> {
    const summaryText = generated?.summary || (typeof generated === 'string' ? generated : '');
    
    return {
      type: 'SUMMARY',
      generatedAt: new Date().toISOString(),
      summary: this.limitWords(
        summaryText.trim(),
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

    await this.ensureMcpConnected();
    if (!this.mcpClient) throw new Error('MCP client is not initialized.');

    const toolName = this.getSaveToolName(type);
    try {
      const result = await this.mcpClient.callTool({
        name: toolName,
        arguments: { jobId, materialId, content },
      });

      if (result.isError) {
        throw new Error(`MCP tool ${toolName} returned an error.`);
      }

      // Periksa apakah MCP mengembalikan sukses secara logis
      const structuredContent = result.structuredContent as any;
      if (structuredContent && structuredContent.success === false) {
        throw new Error(`MCP save failed: ${structuredContent.message || 'Unknown error'}`);
      }
    } catch (error) {
      const msg = this.getErrorMessage(error);
      if (msg.includes('session') || msg.includes('Session')) {
        this.logger.warn('MCP Session invalid/expired. Closing transport to force reconnect on next call.');
        await this.mcpClient.close().catch(() => {});
      }
      throw error;
    }
  }

  private async extractText(file: Express.Multer.File): Promise<string> {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      try {
        // Polyfill untuk lingkungan server (deployment) agar pdf-parse tidak error
        if (typeof global !== 'undefined') {
          (global as any).DOMMatrix = (global as any).DOMMatrix || class DOMMatrix {};
          (global as any).ImageData = (global as any).ImageData || class ImageData {};
          (global as any).Path2D = (global as any).Path2D || class Path2D {};
        }

        const { PDFParse } = require('pdf-parse');
        
        if (typeof PDFParse === 'function') {
          const parser = new PDFParse({ data: file.buffer });
          const result = await parser.getText();
          await parser.destroy();
          return result.text;
        } else {
          throw new Error('Could not find PDFParse class in pdf-parse');
        }
      } catch (error) {
        this.logger.error(`Gagal mengekstrak PDF: ${error.message}`);
      }
    }

    return file.buffer.toString('utf-8');
  }

  private resolveCount(value: number | string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(100, Math.max(1, Math.trunc(parsed))) : fallback;
  }

  private resolveMaxWords(value: number | string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(2000, Math.max(50, Math.trunc(parsed))) : fallback;
  }

  private limitWords(text: string, maxWords: number) {
    const words = text.split(/\s+/).filter(Boolean);
    return words.length <= maxWords ? text : words.slice(0, maxWords).join(' ');
  }

  private assertSupportedType(type: string): asserts type is AIOutputType {
    if (type !== 'MCQ' && type !== 'ESSAY' && type !== 'SUMMARY') {
      throw new Error(`Unsupported AI output type: ${type}`);
    }
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof z.ZodError) return JSON.stringify(error.issues);
    if (error instanceof Error) return error.message;
    return 'Unknown AI error';
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private getSaveToolName(type: AIOutputType) {
    if (type === 'MCQ') return 'save_mcq_output';
    if (type === 'ESSAY') return 'save_essay_output';
    return 'save_summary_output';
  }
}
