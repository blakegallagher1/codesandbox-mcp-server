import http from 'http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { config } from './services/config.js';
import { sanitizeErrorMessage } from './middleware/error-handler.js';
import { ALL_TOOLS } from './tools/index.js';
import { MCPError } from './middleware/error-handler.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/**
 * Create and start HTTP server for MCP protocol
 */
export async function startHttpServer(_mcpServer: Server): Promise<http.Server> {
  const httpPort = config.get('http_port');

  // Create HTTP server
  const server = http.createServer(async (req, res) => {
    // Enable CORS for ChatGPT access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check endpoint
    if (req.method === 'GET' && req.url === '/health') {
      const uptime = process.uptime();
      const healthStatus = {
        status: 'healthy',
        uptime: `${Math.floor(uptime)} seconds`,
        timestamp: new Date().toISOString(),
        transport: 'http',
        port: httpPort
      };
      res.writeHead(200);
      res.end(JSON.stringify(healthStatus, null, 2));
      return;
    }

    // MCP protocol endpoint
    if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          // Parse incoming JSON-RPC message
          const message = JSON.parse(body);

          logger.info({
            method: message.method || 'unknown',
            id: message.id,
            timestamp: new Date().toISOString()
          });

          // Handle different MCP requests
          let response;

          if (message.method === 'tools/list') {
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: ALL_TOOLS.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: tool.inputSchema
                }))
              }
            };
          } else if (message.method === 'tools/call') {
            const { name, arguments: args } = message.params;
            const tool = ALL_TOOLS.find((t) => t.name === name);

            if (!tool) {
              throw new MCPError(
                'TOOL_NOT_FOUND' as any,
                `Tool '${name}' not found`,
                404,
                false
              );
            }

            const userId = 'default_user';
            const result = await tool.handler(args || {}, userId);

            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              }
            };
          } else if (message.method === 'resources/list') {
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                resources: [
                  {
                    uri: 'health://check',
                    name: 'Health Check',
                    description: 'System health and connectivity status',
                    mimeType: 'application/json'
                  }
                ]
              }
            };
          } else if (message.method === 'resources/read') {
            const { uri } = message.params;
            if (uri === 'health://check') {
              const uptime = process.uptime();
              const healthStatus = {
                status: 'healthy',
                uptime: `${Math.floor(uptime)} seconds`,
                timestamp: new Date().toISOString(),
                transport: 'http'
              };

              response = {
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  contents: [
                    {
                      uri,
                      mimeType: 'application/json',
                      text: JSON.stringify(healthStatus, null, 2)
                    }
                  ]
                }
              };
            } else {
              throw new MCPError('RESOURCE_NOT_FOUND' as any, `Resource '${uri}' not found`, 404, false);
            }
          } else {
            response = {
              jsonrpc: '2.0',
              id: message.id,
              error: {
                code: -32601,
                message: `Method not found: ${message.method}`
              }
            };
          }

          // Send response
          res.writeHead(200);
          res.end(JSON.stringify(response));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ error: sanitizeErrorMessage(errorMessage) }, 'HTTP request failed');

          res.writeHead(500);
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal error',
              data: sanitizeErrorMessage(errorMessage)
            },
            id: null
          }));
        }
      });

      req.on('error', (error) => {
        logger.error({ error: sanitizeErrorMessage(error.message) }, 'HTTP request error');
        res.writeHead(400);
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error'
          },
          id: null
        }));
      });

      return;
    }

    // 404 for other routes
    res.writeHead(404);
    res.end(JSON.stringify({
      error: 'Not found',
      message: 'Available endpoints: GET /health, POST /mcp'
    }));
  });

  // Start listening
  await new Promise<void>((resolve) => {
    server.listen(httpPort, () => {
      logger.info(`HTTP MCP server listening on port ${httpPort}`);
      logger.info(`Health check: http://localhost:${httpPort}/health`);
      logger.info(`MCP endpoint: http://localhost:${httpPort}/mcp`);
      resolve();
    });
  });

  return server;
}
