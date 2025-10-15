import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { ALL_TOOLS } from './tools/index.js';
import { config } from './services/config.js';
import { MCPError, sanitizeErrorMessage } from './middleware/error-handler.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Initialize server
export const server = new Server(
  {
    name: 'CodeSandbox Secure Gateway',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }))
  };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    logger.info({ tool: name, timestamp: new Date().toISOString() });

    // Find the tool
    const tool = ALL_TOOLS.find((t) => t.name === name);

    if (!tool) {
      throw new MCPError(
        'TOOL_NOT_FOUND' as any,
        `Tool '${name}' not found`,
        404,
        false
      );
    }

    // Extract user ID from request context (default to 'default_user' for now)
    const userId = 'default_user'; // In production, extract from auth context

    // Execute tool handler
    const result = await tool.handler(args || {}, userId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    logger.error({
      tool: name,
      error: error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error'
    });

    // Return sanitized error to client
    const errorMessage =
      error instanceof MCPError
        ? error.message
        : 'An internal error occurred. Please try again later.';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: errorMessage,
              code: error instanceof MCPError ? error.code : 'INTERNAL_ERROR'
            },
            null,
            2
          )
        }
      ],
      isError: true
    };
  }
});

// Register resource list handler (health check)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'health://check',
        name: 'Health Check',
        description: 'System health and connectivity status',
        mimeType: 'application/json'
      }
    ]
  };
});

// Register resource read handler (health check implementation)
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'health://check') {
    const uptime = process.uptime();
    const timestamp = new Date().toISOString();

    // Check CodeSandbox connectivity (mock for now)
    const csbConnected = await checkCSBConnectivity();

    // Check GitHub connectivity (mock for now)
    const githubConnected = await checkGitHubConnectivity();

    const healthStatus = {
      status: csbConnected && githubConnected ? 'healthy' : 'degraded',
      uptime: `${Math.floor(uptime)} seconds`,
      timestamp,
      services: {
        codesandbox: csbConnected ? 'connected' : 'disconnected',
        github: githubConnected ? 'connected' : 'disconnected'
      }
    };

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(healthStatus, null, 2)
        }
      ]
    };
  }

  throw new MCPError('RESOURCE_NOT_FOUND' as any, `Resource '${uri}' not found`, 404, false);
});

/**
 * Check CodeSandbox API connectivity
 */
async function checkCSBConnectivity(): Promise<boolean> {
  try {
    // In production, this would make an actual API call
    // For now, just check if API key is configured
    const apiKey = config.get('csb_api_key');
    return Boolean(apiKey && apiKey.length > 0);
  } catch (error) {
    logger.error({ error }, 'CodeSandbox connectivity check failed');
    return false;
  }
}

/**
 * Check GitHub API connectivity
 */
async function checkGitHubConnectivity(): Promise<boolean> {
  try {
    // In production, this would make an actual API call
    // For now, just check if tokens are configured
    const tokenMap = config.get('github_token_map');
    return Object.keys(tokenMap).length > 0;
  } catch (error) {
    logger.error({ error }, 'GitHub connectivity check failed');
    return false;
  }
}

logger.info('MCP server initialized');
