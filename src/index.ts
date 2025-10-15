import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server } from './server.js';
import { config } from './services/config.js';
import { sanitizeErrorMessage } from './middleware/error-handler.js';
import { startHttpServer } from './http-server.js';
import pino from 'pino';
import http from 'http';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let httpServer: http.Server | null = null;

/**
 * Main entry point for the MCP server
 */
async function main() {
  try {
    // Load configuration
    config.loadFromEnv();

    const port = config.get('mcp_port');
    const httpEnabled = config.get('http_enabled');

    logger.info('Starting CodeSandbox MCP Server...');
    logger.info(`Configuration loaded for port ${port}`);

    // Start HTTP transport if enabled
    if (httpEnabled) {
      logger.info('HTTP transport enabled');
      httpServer = await startHttpServer(server);
    } else {
      logger.info('HTTP transport disabled');

      // Create stdio transport (only if HTTP is not enabled)
      const transport = new StdioServerTransport();

      // Connect server to transport
      await server.connect(transport);

      logger.info('MCP server connected and ready');
      logger.info('Listening for MCP requests via stdio...');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: sanitizeErrorMessage(errorMessage) }, 'Failed to start server');
    console.error('FATAL ERROR: Failed to start server');
    console.error(sanitizeErrorMessage(errorMessage));
    process.exit(1);
  }
}

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM signal');
  logger.info('Shutting down gracefully...');
  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT signal');
  logger.info('Shutting down gracefully...');
  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error({ error: sanitizeErrorMessage(error.message) }, 'Uncaught exception');
  console.error('FATAL ERROR: Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error({ error: sanitizeErrorMessage(message) }, 'Unhandled rejection');
  console.error('FATAL ERROR: Unhandled rejection');
  process.exit(1);
});

// Start the server
main();
