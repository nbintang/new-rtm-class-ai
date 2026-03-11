import { AIJobStatus } from '@prisma/client';
import { AiService } from './ai.service';

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
  let service: AiService;
  let serviceInternals: {
    mcpClient: { callTool: jest.Mock } | null;
    saveAiOutput: SaveAiOutputFn;
  };
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

    service = new AiService(prisma as never);
    serviceInternals = service as unknown as {
      mcpClient: { callTool: jest.Mock } | null;
      saveAiOutput: SaveAiOutputFn;
    };
    callTool = jest.fn().mockResolvedValue({
      isError: false,
      structuredContent: { success: true },
    });
    serviceInternals.mcpClient = {
      callTool,
    };
  });

  it('dispatches MCQ save to save_mcq_output', async () => {
    await serviceInternals.saveAiOutput(
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
  });

  it('dispatches Essay save to save_essay_output', async () => {
    await serviceInternals.saveAiOutput(
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
    expect(callArg?.arguments.jobId).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(callArg?.arguments.materialId).toBe(
      '550e8400-e29b-41d4-a716-446655440001',
    );
    expect(callArg?.arguments.content.type).toBe('ESSAY');
  });

  it('falls back to direct database save when MCP is disabled', async () => {
    await serviceInternals.saveAiOutput(
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
    expect(createArg?.data).toEqual({
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      materialId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'SUMMARY',
      content: {
        type: 'SUMMARY',
        generatedAt: '2026-03-11T22:00:00.000Z',
        summary: 'Ringkasan materi.',
      },
      isPublished: false,
    });
    expect(updateArg).toBeDefined();
    expect(updateArg?.where).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(updateArg?.data.status).toBe(AIJobStatus.succeeded);
    expect(updateArg?.data.completedAt).toBeInstanceOf(Date);
    expect(updateArg?.data.lastError).toBeNull();
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects MCQ output when generated question count does not match the requested count', async () => {
    const invokeJsonObject = jest.fn().mockResolvedValue({
      rawText:
        '{"questions":[{"id":"q1","text":"Apa ibu kota Indonesia?","options":["Jakarta","Bandung","Surabaya","Medan"],"answer":"A"}]}',
      json: {
        questions: [
          {
            id: 'q1',
            text: 'Apa ibu kota Indonesia?',
            options: ['Jakarta', 'Bandung', 'Surabaya', 'Medan'],
            answer: 'A',
          },
        ],
      },
    });

    (
      service as unknown as {
        invokeJsonObject: typeof invokeJsonObject;
        generateContent: (
          type: 'MCQ',
          text: string,
          options: { count: number },
        ) => Promise<Record<string, unknown>>;
      }
    ).invokeJsonObject = invokeJsonObject;

    await expect(
      (
        service as unknown as {
          generateContent: (
            type: 'MCQ',
            text: string,
            options: { count: number },
          ) => Promise<Record<string, unknown>>;
        }
      ).generateContent('MCQ', 'Materi contoh', { count: 20 }),
    ).rejects.toThrow('Unable to produce valid MCQ JSON after retries');

    expect(invokeJsonObject).toHaveBeenCalledTimes(3);
  });
});
