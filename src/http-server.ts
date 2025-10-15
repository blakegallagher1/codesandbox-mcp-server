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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
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
        port: httpPort,
        endpoints: {
          health: '/health',
          sse: '/sse',
          message: '/message',
          mcp: '/mcp'
        }
      };
      res.writeHead(200);
      res.end(JSON.stringify(healthStatus, null, 2));
      return;
    }

    // SSE endpoint for ChatGPT MCP connector
    if (req.method === 'GET' && req.url === '/sse') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers.host || `localhost:${httpPort}`;
      
      const endpoint = {
        jsonrpc: '2.0',
        method: 'endpoint',
        params: {
          type: 'sse',
          uri: `${protocol}://${host}/message`
        }
      };
      
      res.write(`data: ${JSON.stringify(endpoint)}\n\n`);
      
      const keepAlive = setInterval(() => {
        res.write(': keepalive\n\n');
      }, 30000);
      
      req.on('close', () => {
        clearInterval(keepAlive);
        res.end();
      });
      
      return;
    }

    // Message endpoint for SSE transport
    if (req.method === 'POST' && req.url === '/message') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const message = JSON.parse(body);

          logger.info({
            method: message.method || 'unknown',
            id: message.id,
            timestamp: new Date().toISOString(),
            rawParams: message.params
          });

          // FIX: Handle ChatGPT's flat params structure
          if (message.method === 'tools/call' && message.params) {
            const { name, arguments: args, ...rest } = message.params;
            
            // If arguments are missing but we have other params (ChatGPT format), nest them
            if (!args && Object.keys(rest).length > 0) {
              message.params = {
                name,
                arguments: rest
              };
              logger.info({ msg: "Fixed flat params for ChatGPT", fixedParams: message.params });
            }
          }

          let response;

          if (message.method === 'initialize') {
            response = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: {
                  tools: {}
                },
                serverInfo: {
                  name: 'codesandbox-mcp-server',
                  version: '1.0.0',
                  description: 'MCP server for CodeSandbox integration'
                }
              }
            };
          } else if (message.method === 'tools/list') {
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

          res.writeHead(200);
          res.end(JSON.stringify(response));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ error: sanitizeErrorMessage(errorMessage) }, 'Message request failed');

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
        logger.error({ error: sanitizeErrorMessage(error.message) }, 'Message request error');
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

    // MCP protocol endpoint (backward compatibility)
    if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';

      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const message = JSON.parse(body);

          logger.info({
            method: message.method || 'unknown',
            id: message.id,
            timestamp: new Date().toISOString()
          });

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
      message: 'Available endpoints: GET /health, GET /sse, POST /message, POST /mcp'
    }));
  });

  await new Promise<void>((resolve) => {
    server.listen(httpPort, () => {
      logger.info(`HTTP MCP server listening on port ${httpPort}`);
      logger.info(`Health check: http://localhost:${httpPort}/health`);
      logger.info(`SSE endpoint: http://localhost:${httpPort}/sse`);
      logger.info(`Message endpoint: http://localhost:${httpPort}/message`);
      logger.info(`MCP endpoint: http://localhost:${httpPort}/mcp`);
      resolve();
    });
  });

  return server;
}
