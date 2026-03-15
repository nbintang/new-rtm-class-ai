import { AIJobStatus } from '@prisma/client';
import { AiService } from './services/ai.service';

type SaveAiOutputFn = (
  jobId: string,
  materialId: string,
  type: 'MCQ' | 'ESSAY' | 'SUMMARY',
  content: Record<string, unknown>,
  options: { mcpEnabled?: boolean },
) => Promise<void>;

describe('AiService', () => {
  let prisma: {
    aiOutput: { create: jest.Mock };
    aiJob: { update: jest.Mock };
  };
  let mcpClientService: {
    ensureConnected: jest.Mock;
    invalidateSession: jest.Mock;
  };
  let service: AiService;
  let saveAiOutput: SaveAiOutputFn;
  let callTool: jest.Mock;

  beforeEach(() => {
    prisma = {
      aiOutput: {
        create: jest.fn(),
      },
      aiJob: {
        update: jest.fn().mockResolvedValue({ id: 'job-1' }),
      },
    };

    callTool = jest.fn().mockResolvedValue({
      isError: false,
      structuredContent: { success: true },
    });

    mcpClientService = {
      ensureConnected: jest.fn().mockResolvedValue({ callTool }),
      invalidateSession: jest.fn().mockResolvedValue(undefined),
    };

    service = new AiService(
      prisma as never,
      { model: {} } as never,
      mcpClientService as never,
    );
    saveAiOutput = (
      service as unknown as { saveAiOutput: SaveAiOutputFn }
    ).saveAiOutput.bind(service);
  });

  it('dispatches MCQ save to save_mcq_output', async () => {
    await saveAiOutput(
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
      'MCQ',
      {
        type: 'MCQ',
        generatedAt: '2026-03-11T22:00:00.000Z',
        questions: [
          {
            id: 'q1',
            text: 'Apa ibu kota Indonesia?',
            options: ['Jakarta', 'Bandung', 'Surabaya', 'Medan'],
            answer: 'A',
          },
        ],
      },
      { mcpEnabled: true },
    );

    const toolCalls = callTool.mock.calls as Array<[unknown]>;
    const callArg = toolCalls[0]?.[0] as
      | {
          name: string;
          arguments: {
            jobId: string;
            materialId: string;
            content: { type: string };
          };
        }
      | undefined;

    expect(callArg).toBeDefined();
    expect(callArg?.name).toBe('save_mcq_output');
    expect(callArg?.arguments.jobId).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(callArg?.arguments.materialId).toBe(
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(callArg?.arguments.content.type).toBe('MCQ');
    expect(mcpClientService.ensureConnected).toHaveBeenCalledTimes(1);
  });

  it('dispatches Essay save to save_essay_output', async () => {
    await saveAiOutput(
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
      'ESSAY',
      {
        type: 'ESSAY',
        generatedAt: '2026-03-11T22:00:00.000Z',
        questions: [
          {
            id: 'q1',
            text: 'Jelaskan fotosintesis.',
            rubric: 'Sebutkan proses utama dan hasilnya.',
          },
        ],
      },
      { mcpEnabled: true },
    );

    const toolCalls = callTool.mock.calls as Array<[unknown]>;
    const callArg = toolCalls[0]?.[0] as
      | {
          name: string;
          arguments: {
            jobId: string;
            materialId: string;
            content: { type: string };
          };
        }
      | undefined;

    expect(callArg).toBeDefined();
    expect(callArg?.name).toBe('save_essay_output');
    expect(callArg?.arguments.content.type).toBe('ESSAY');
    expect(mcpClientService.ensureConnected).toHaveBeenCalledTimes(1);
  });

  it('falls back to direct database save when MCP is disabled', async () => {
    await saveAiOutput(
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440001',
      'SUMMARY',
      {
        type: 'SUMMARY',
        generatedAt: '2026-03-11T22:00:00.000Z',
        summary: 'Ringkasan materi.',
      },
      { mcpEnabled: false },
    );

    const createCalls = prisma.aiOutput.create.mock.calls as Array<[unknown]>;
    const updateCalls = prisma.aiJob.update.mock.calls as Array<[unknown]>;
    const createArg = createCalls[0]?.[0] as
      | {
          data: {
            jobId: string;
            materialId: string;
            type: string;
            content: {
              type: string;
              generatedAt: string;
              summary: string;
            };
            isPublished: boolean;
          };
        }
      | undefined;
    const updateArg = updateCalls[0]?.[0] as
      | {
          where: { id: string };
          data: {
            status: AIJobStatus;
            completedAt: Date;
            lastError: null;
          };
        }
      | undefined;

    expect(createArg).toBeDefined();
    expect(createArg?.data.type).toBe('SUMMARY');
    expect(updateArg?.where).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(updateArg?.data.status).toBe(AIJobStatus.succeeded);
    expect(updateArg?.data.completedAt).toBeInstanceOf(Date);
    expect(updateArg?.data.lastError).toBeNull();
    expect(callTool).not.toHaveBeenCalled();
    expect(mcpClientService.ensureConnected).not.toHaveBeenCalled();
  });

  it('invalidates MCP session when MCP session-level error happens', async () => {
    callTool.mockRejectedValueOnce(new Error('Session expired'));

    await expect(
      saveAiOutput(
        '550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440001',
        'MCQ',
        { type: 'MCQ', questions: [] },
        { mcpEnabled: true },
      ),
    ).rejects.toThrow('Session expired');

    expect(mcpClientService.invalidateSession).toHaveBeenCalledTimes(1);
  });

  it('normalizes summary when payload is a string', () => {
    const normalizeSummaryContent = (
      service as unknown as {
        normalizeSummaryContent: (
          generated: unknown,
          options: { maxWords?: number | string },
        ) => { summary: string };
      }
    ).normalizeSummaryContent.bind(service);

    const result = normalizeSummaryContent('Ringkasan materi dalam bentuk string.', {
      maxWords: 200,
    });

    expect(result.summary).toBe('Ringkasan materi dalam bentuk string.');
  });
});
