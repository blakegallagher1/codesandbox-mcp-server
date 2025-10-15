import { z } from 'zod';
import { Config } from '../types/index.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

// Config validation schema
const ConfigSchema = z.object({
  mcp_port: z.number().positive().int(),
  csb_api_key: z.string().min(1),
  csb_workspace_id: z.string().min(1),
  rate_limit_per_minute: z.number().positive().int(),
  sandbox_idle_timeout_ms: z.number().positive().int(),
  max_sandbox_age_ms: z.number().positive().int(),
  github_token_map: z.record(z.string(), z.string()),
  http_enabled: z.boolean(),
  http_port: z.number().positive().int()
});

class ConfigManager {
  private config: Config | null = null;

  /**
   * Load configuration from environment variables
   */
  loadFromEnv(): Config {
    try {
      // Parse GitHub token map from environment variables
      const githubTokenMap: Record<string, string> = {};

      // Look for environment variables matching pattern CSB_GITHUB_TOKEN_*
      for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith('CSB_GITHUB_TOKEN_') && value) {
          const repoKey = key.replace('CSB_GITHUB_TOKEN_', '').toLowerCase();
          githubTokenMap[repoKey] = value;
        }
      }

      const rawConfig = {
        mcp_port: parseInt(process.env.MCP_PORT || '3000', 10),
        csb_api_key: process.env.CSB_API_KEY || '',
        csb_workspace_id: process.env.CSB_WORKSPACE_ID || '',
        rate_limit_per_minute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10', 10),
        sandbox_idle_timeout_ms: parseInt(process.env.SANDBOX_IDLE_TIMEOUT_MS || '600000', 10),
        max_sandbox_age_ms: parseInt(process.env.MAX_SANDBOX_AGE_MS || '3600000', 10),
        github_token_map: githubTokenMap,
        http_enabled: process.env.HTTP_ENABLED === 'true',
        http_port: parseInt(process.env.HTTP_PORT || '3001', 10)
      };

      // Validate config with Zod schema
      this.config = ConfigSchema.parse(rawConfig);

      logger.info('Configuration loaded successfully');
      logger.info({
        mcp_port: this.config.mcp_port,
        http_enabled: this.config.http_enabled,
        http_port: this.config.http_port,
        rate_limit_per_minute: this.config.rate_limit_per_minute,
        sandbox_idle_timeout_ms: this.config.sandbox_idle_timeout_ms,
        max_sandbox_age_ms: this.config.max_sandbox_age_ms,
        github_repos_configured: Object.keys(this.config.github_token_map).length
      });

      return this.config;
    } catch (error) {
      logger.error({ error }, 'Failed to load configuration');
      logger.error('Please check your environment variables and .env file');
      process.exit(1);
    }
  }

  /**
   * Get a configuration value
   */
  get<K extends keyof Config>(key: K): Config[K] {
    if (!this.config) {
      this.loadFromEnv();
    }
    return this.config![key];
  }

  /**
   * Get the entire configuration object
   */
  getAll(): Config {
    if (!this.config) {
      this.loadFromEnv();
    }
    return this.config!;
  }
}

// Export singleton instance
export const config = new ConfigManager();
