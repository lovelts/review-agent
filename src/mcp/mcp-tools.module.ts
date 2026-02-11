import { Module } from '@nestjs/common';
import { McpToolsService } from './mcp-tools.service';
import { ReadFileTool } from './tools/read-file.tool';
import { ListDirectoryTool } from './tools/list-directory.tool';
import { SearchInDirectoryTool } from './tools/search-in-directory.tool';

/**
 * MCP 模块
 * - 提供可扩展的 MCP 工具（read_file, list_directory, search_in_directory 等）
 * - 用于动态拉取仓库/项目上下文，供 CR Agent 使用
 */
@Module({
  providers: [McpToolsService, ReadFileTool, ListDirectoryTool, SearchInDirectoryTool],
  exports: [McpToolsService],
})
export class McpToolsModule {}
