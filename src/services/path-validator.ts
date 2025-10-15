import { MCPError, ERROR_CODES } from '../middleware/error-handler.js';

// Forbidden path patterns
const FORBIDDEN_PATHS = [
  /^\.env/,
  /^\.git/,
  /^node_modules/,
  /^\.codesandbox/,
  /^\/etc/,
  /^\/root/,
  /^\/proc/,
  /^\/sys/,
  /^\/var/,
  /^\/usr/,
  /^\/bin/,
  /^\/sbin/,
  /^\/boot/,
  /^\.ssh/,
  /^\.aws/,
  /^\.config/
];

/**
 * Validate file path for security
 * @param filePath - Path to validate
 * @returns boolean - true if path is safe
 */
export function validateFilePath(filePath: string): boolean {
  // Reject paths with ".."
  if (filePath.includes('..')) {
    return false;
  }

  // Reject absolute paths
  if (filePath.startsWith('/')) {
    return false;
  }

  // Reject Windows absolute paths
  if (/^[a-zA-Z]:/.test(filePath)) {
    return false;
  }

  // Check against forbidden paths
  for (const pattern of FORBIDDEN_PATHS) {
    if (pattern.test(filePath)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate file path and throw error if invalid
 * @param filePath - Path to validate
 * @throws MCPError if path is invalid
 */
export function assertValidFilePath(filePath: string): void {
  if (!validateFilePath(filePath)) {
    throw new MCPError(
      ERROR_CODES.PATH_TRAVERSAL,
      `Invalid or forbidden file path: ${filePath}`,
      403,
      false
    );
  }
}

/**
 * Validate branch name
 * @param branchName - Branch name to validate
 * @returns boolean - true if branch name is valid
 */
export function validateBranchName(branchName: string): boolean {
  // Must match pattern: alphanumeric, dots, underscores, forward slashes, hyphens
  if (!/^[a-zA-Z0-9._/-]+$/.test(branchName)) {
    return false;
  }

  // No spaces
  if (branchName.includes(' ')) {
    return false;
  }

  // No ".."
  if (branchName.includes('..')) {
    return false;
  }

  // No "//"
  if (branchName.includes('//')) {
    return false;
  }

  return true;
}

/**
 * Validate branch name and throw error if invalid
 * @param branchName - Branch name to validate
 * @throws MCPError if branch name is invalid
 */
export function assertValidBranchName(branchName: string): void {
  if (!validateBranchName(branchName)) {
    throw new MCPError(
      ERROR_CODES.INVALID_BRANCH,
      `Invalid branch name: ${branchName}`,
      400,
      false
    );
  }
}

/**
 * Validate repository ID against allowlist
 * @param repoId - Repository ID to validate
 * @param allowedRepos - Map of allowed repository IDs to tokens
 * @returns boolean - true if repo is allowed
 */
export function validateRepoId(repoId: string, allowedRepos: Record<string, string>): boolean {
  return repoId in allowedRepos;
}

/**
 * Validate repository ID and throw error if not allowed
 * @param repoId - Repository ID to validate
 * @param allowedRepos - Map of allowed repository IDs to tokens
 * @throws MCPError if repo is not allowed
 */
export function assertValidRepoId(repoId: string, allowedRepos: Record<string, string>): void {
  if (!validateRepoId(repoId, allowedRepos)) {
    throw new MCPError(
      ERROR_CODES.INVALID_REPO,
      `Repository '${repoId}' is not in the allowed list`,
      403,
      false
    );
  }
}
