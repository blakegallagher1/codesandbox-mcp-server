import { server } from '../../src/server';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

describe('Server Integration Tests', () => {
  describe('ListToolsRequest', () => {
    it('should list all available tools', async () => {
      const response: any = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      expect(response).toHaveProperty('tools');
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools.length).toBeGreaterThan(0);

      // Check that key tools are present
      const toolNames = response.tools.map((t: any) => t.name);
      expect(toolNames).toContain('create_sandbox_for_project');
      expect(toolNames).toContain('write_files_to_sandbox');
      expect(toolNames).toContain('get_sandbox_output');
      expect(toolNames).toContain('commit_and_push_to_github');
      expect(toolNames).toContain('read_github_file');
    });

    it('should include tool descriptions and schemas', async () => {
      const response: any = await server.request(
        { method: 'tools/list', params: {} },
        ListToolsRequestSchema
      );

      const tool = response.tools[0];
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toHaveProperty('type');
    });
  });

  describe('CallToolRequest', () => {
    it('should execute create_sandbox_for_project tool', async () => {
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'create_sandbox_for_project',
          arguments: {
            project_name: 'test-project',
            template: 'react'
          }
        }
      };

      const response: any = await server.request(request, CallToolRequestSchema);

      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]).toHaveProperty('type', 'text');
      expect(response.content[0]).toHaveProperty('text');

      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('sandbox_id');
      expect(result).toHaveProperty('preview_url');
    });

    it('should return error for non-existent tool', async () => {
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'non_existent_tool',
          arguments: {}
        }
      };

      const response: any = await server.request(request, CallToolRequestSchema);

      expect(response).toHaveProperty('content');
      expect(response.content[0]).toHaveProperty('text');

      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('error');
    });

    it('should handle tool execution with invalid input', async () => {
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'create_sandbox_for_project',
          arguments: {
            project_name: 'invalid name!@#',
            template: 'react'
          }
        }
      };

      const response: any = await server.request(request, CallToolRequestSchema);

      expect(response).toHaveProperty('content');
      const result = JSON.parse(response.content[0].text);
      expect(result).toHaveProperty('error');
    });

    it('should handle write_files_to_sandbox tool', async () => {
      // First create a sandbox
      const createRequest = {
        method: 'tools/call' as const,
        params: {
          name: 'create_sandbox_for_project',
          arguments: {
            project_name: 'write-test',
            template: 'node'
          }
        }
      };

      const createResponse: any = await server.request(createRequest, CallToolRequestSchema);
      const createResult = JSON.parse(createResponse.content[0].text);
      const sandboxId = createResult.sandbox_id;

      // Then write files
      const writeRequest = {
        method: 'tools/call' as const,
        params: {
          name: 'write_files_to_sandbox',
          arguments: {
            sandbox_id: sandboxId,
            files: {
              'index.js': 'console.log("test");'
            }
          }
        }
      };

      const writeResponse: any = await server.request(writeRequest, CallToolRequestSchema);
      const writeResult = JSON.parse(writeResponse.content[0].text);

      expect(writeResult).toHaveProperty('success', true);
      expect(writeResult).toHaveProperty('files_written', 1);
    });

    it('should handle get_sandbox_output tool', async () => {
      // First create a sandbox
      const createRequest = {
        method: 'tools/call' as const,
        params: {
          name: 'create_sandbox_for_project',
          arguments: {
            project_name: 'output-test',
            template: 'react'
          }
        }
      };

      const createResponse: any = await server.request(createRequest, CallToolRequestSchema);
      const createResult = JSON.parse(createResponse.content[0].text);
      const sandboxId = createResult.sandbox_id;

      // Then get output
      const outputRequest = {
        method: 'tools/call' as const,
        params: {
          name: 'get_sandbox_output',
          arguments: {
            sandbox_id: sandboxId,
            output_type: 'preview_url'
          }
        }
      };

      const outputResponse: any = await server.request(outputRequest, CallToolRequestSchema);
      const outputResult = JSON.parse(outputResponse.content[0].text);

      expect(outputResult).toHaveProperty('output');
      expect(outputResult).toHaveProperty('output_type', 'preview_url');
      expect(outputResult.output).toContain('codesandbox.io');
    });
  });

  describe('ListResourcesRequest', () => {
    it('should list health check resource', async () => {
      const response: any = await server.request(
        { method: 'resources/list', params: {} },
        ListResourcesRequestSchema
      );

      expect(response).toHaveProperty('resources');
      expect(Array.isArray(response.resources)).toBe(true);
      expect(response.resources.length).toBeGreaterThan(0);

      const healthResource = response.resources.find((r: any) => r.uri === 'health://check');
      expect(healthResource).toBeDefined();
      expect(healthResource.name).toBe('Health Check');
      expect(healthResource.mimeType).toBe('application/json');
    });
  });

  describe('ReadResourceRequest', () => {
    it('should read health check resource', async () => {
      const response: any = await server.request(
        {
          method: 'resources/read',
          params: { uri: 'health://check' }
        },
        ReadResourceRequestSchema
      );

      expect(response).toHaveProperty('contents');
      expect(Array.isArray(response.contents)).toBe(true);
      expect(response.contents[0]).toHaveProperty('uri', 'health://check');
      expect(response.contents[0]).toHaveProperty('mimeType', 'application/json');
      expect(response.contents[0]).toHaveProperty('text');

      const healthStatus = JSON.parse(response.contents[0].text);
      expect(healthStatus).toHaveProperty('status');
      expect(healthStatus).toHaveProperty('uptime');
      expect(healthStatus).toHaveProperty('timestamp');
      expect(healthStatus).toHaveProperty('services');
      expect(healthStatus.services).toHaveProperty('codesandbox');
      expect(healthStatus.services).toHaveProperty('github');
    });

    it('should return error for non-existent resource', async () => {
      await expect(
        server.request(
          {
            method: 'resources/read',
            params: { uri: 'non-existent://resource' }
          },
          ReadResourceRequestSchema
        )
      ).rejects.toThrow();
    });
  });
});
