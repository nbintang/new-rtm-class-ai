import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AppConfigService } from '../../config/config.service';

@Injectable()
export class McpClientService implements OnModuleDestroy {
  private readonly logger = new Logger(McpClientService.name);
  private client: Client | null = null;
  private connectingPromise: Promise<Client> | null = null;

  constructor(private readonly configService: AppConfigService) {}

  async ensureConnected(): Promise<Client> {
    const existing = this.getConnectedClient();
    if (existing) return existing;

    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = this.connect();
    try {
      return await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  async invalidateSession(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.close();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown MCP close error';
      this.logger.warn(`Failed to close MCP session cleanly: ${message}`);
    } finally {
      this.client = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.invalidateSession();
  }

  private async connect(): Promise<Client> {
    if (!this.client) {
      this.client = new Client(
        { name: 'rtm-class-ai-client', version: '1.0.0' },
        { capabilities: {} },
      );
      this.logger.log('MCP Client instance created');
    }

    const clientWithTransport = this.client as Client & { transport?: unknown };
    if (!clientWithTransport.transport) {
      const mcpUrl = this.configService.mcpServerUrl;
      this.logger.log(`Establishing MCP session at ${mcpUrl}...`);
      const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
      await this.client.connect(transport);
      this.logger.log('Successfully established MCP session');
    }

    return this.client;
  }

  private getConnectedClient(): Client | null {
    if (!this.client) return null;
    const clientWithTransport = this.client as Client & { transport?: unknown };
    return clientWithTransport.transport ? this.client : null;
  }
}
