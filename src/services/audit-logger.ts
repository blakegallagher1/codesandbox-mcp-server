import { AuditLog } from '../types/index.js';
import { sanitizeParameters } from '../middleware/error-handler.js';
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import pino from 'pino';
import path from 'path';
import fs from 'fs';

const logger = pino({ level: process.env.AUDIT_LOG_LEVEL || 'info' });

export class AuditLogger {
  private db: Database.Database;

  constructor(dbPath: string = './logs/audit.db') {
    // Ensure logs directory exists
    const logDir = path.dirname(dbPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Initialize SQLite database
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Create audit_logs table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        parameters TEXT NOT NULL,
        result TEXT NOT NULL,
        error TEXT,
        sandbox_id TEXT,
        execution_time_ms INTEGER NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_user_id ON audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_tool_name ON audit_logs(tool_name);
      CREATE INDEX IF NOT EXISTS idx_result ON audit_logs(result);
    `);

    logger.info('Audit database initialized');
  }

  /**
   * Generate SHA256 hash for log entry integrity
   */
  private generateHash(entry: Omit<AuditLog, 'hash'>): string {
    const data = JSON.stringify({
      timestamp: entry.timestamp,
      user_id: entry.user_id,
      tool_name: entry.tool_name,
      parameters: entry.parameters,
      result: entry.result,
      error: entry.error,
      sandbox_id: entry.sandbox_id,
      execution_time_ms: entry.execution_time_ms
    });

    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Log an audit entry (append-only)
   */
  log(
    userId: string,
    toolName: string,
    parameters: Record<string, unknown>,
    result: 'success' | 'failure' | 'rate_limited',
    executionTimeMs: number,
    error?: string,
    sandboxId?: string
  ): void {
    try {
      const timestamp = new Date().toISOString();
      const sanitizedParams = sanitizeParameters(parameters);

      const entryWithoutHash: Omit<AuditLog, 'hash'> = {
        timestamp,
        user_id: userId,
        tool_name: toolName,
        parameters: sanitizedParams,
        result,
        error,
        sandbox_id: sandboxId,
        execution_time_ms: executionTimeMs
      };

      const hash = this.generateHash(entryWithoutHash);

      const entry: AuditLog = {
        ...entryWithoutHash,
        hash
      };

      // Insert into database
      const stmt = this.db.prepare(`
        INSERT INTO audit_logs (
          timestamp, user_id, tool_name, parameters, result, error, sandbox_id, execution_time_ms, hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        entry.timestamp,
        entry.user_id,
        entry.tool_name,
        JSON.stringify(entry.parameters),
        entry.result,
        entry.error || null,
        entry.sandbox_id || null,
        entry.execution_time_ms,
        entry.hash
      );

      logger.info({
        audit: 'logged',
        userId,
        toolName,
        result,
        executionTimeMs
      });
    } catch (error) {
      // Critical: audit logging failure must be visible
      logger.error({ error }, 'CRITICAL: Audit logging failed');
      console.error('CRITICAL: Audit logging failed:', error);
      // In production, this should trigger an alert to security team
    }
  }

  /**
   * Query audit logs (for reporting and analysis)
   */
  queryLogs(filters: {
    userId?: string;
    toolName?: string;
    result?: 'success' | 'failure' | 'rate_limited';
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): AuditLog[] {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: unknown[] = [];

    if (filters.userId) {
      query += ' AND user_id = ?';
      params.push(filters.userId);
    }

    if (filters.toolName) {
      query += ' AND tool_name = ?';
      params.push(filters.toolName);
    }

    if (filters.result) {
      query += ' AND result = ?';
      params.push(filters.result);
    }

    if (filters.startDate) {
      query += ' AND timestamp >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ' AND timestamp <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY timestamp DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as Array<{
      timestamp: string;
      user_id: string;
      tool_name: string;
      parameters: string;
      result: 'success' | 'failure' | 'rate_limited';
      error: string | null;
      sandbox_id: string | null;
      execution_time_ms: number;
      hash: string;
    }>;

    return rows.map(row => ({
      timestamp: row.timestamp,
      user_id: row.user_id,
      tool_name: row.tool_name,
      parameters: JSON.parse(row.parameters),
      result: row.result,
      error: row.error || undefined,
      sandbox_id: row.sandbox_id || undefined,
      execution_time_ms: row.execution_time_ms,
      hash: row.hash
    }));
  }

  /**
   * Verify integrity of audit log entries
   */
  verifyIntegrity(entries: AuditLog[]): boolean {
    for (const entry of entries) {
      const entryWithoutHash: Omit<AuditLog, 'hash'> = {
        timestamp: entry.timestamp,
        user_id: entry.user_id,
        tool_name: entry.tool_name,
        parameters: entry.parameters,
        result: entry.result,
        error: entry.error,
        sandbox_id: entry.sandbox_id,
        execution_time_ms: entry.execution_time_ms
      };

      const expectedHash = this.generateHash(entryWithoutHash);

      if (expectedHash !== entry.hash) {
        logger.error({
          entry_timestamp: entry.timestamp,
          entry_user: entry.user_id
        }, 'CRITICAL: Audit log integrity check failed');
        return false;
      }
    }

    return true;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();
