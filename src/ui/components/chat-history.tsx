import React from "react";
import { Box, Text } from "ink";
import { ChatEntry } from "../../agent/grok-agent.js";
import { DiffRenderer } from "./diff-renderer.js";
import { MarkdownRenderer } from "../utils/markdown-renderer.js";
import { TodoList, TodoItem } from "./todo-list.js";

interface ChatHistoryProps {
  entries: ChatEntry[];
  isConfirmationActive?: boolean;
}

// Helper to truncate content for better readability
const truncateContent = (content: string, maxLines: number = 15): string => {
  const lines = content.split('\n');

  // If content is short enough, return as-is
  if (lines.length <= maxLines) {
    return content;
  }

  // Show first maxLines lines and indicate truncation
  const truncatedLines = lines.slice(0, maxLines);
  const remainingLines = lines.length - maxLines;

  return truncatedLines.join('\n') + `\n... (${remainingLines} more lines)`;
};

// Memoized ChatEntry component to prevent unnecessary re-renders
const MemoizedChatEntry = React.memo(
  ({ entry, index }: { entry: ChatEntry; index: number }) => {
    const renderDiff = (diffContent: string, filename?: string) => {
      return (
        <DiffRenderer
          diffContent={diffContent}
          filename={filename}
          terminalWidth={80}
        />
      );
    };

    const renderFileContent = (content: string) => {
      const lines = content.split("\n");
      const maxLinesToShow = 10;
      const totalLines = lines.length;
      const shouldTruncate = totalLines > maxLinesToShow;

      // Calculate minimum indentation like DiffRenderer does
      let baseIndentation = Infinity;
      for (const line of lines) {
        if (line.trim() === "") continue;
        const firstCharIndex = line.search(/\S/);
        const currentIndent = firstCharIndex === -1 ? 0 : firstCharIndex;
        baseIndentation = Math.min(baseIndentation, currentIndent);
      }
      if (!isFinite(baseIndentation)) {
        baseIndentation = 0;
      }

      const linesToDisplay = shouldTruncate ? lines.slice(0, maxLinesToShow) : lines;

      return (
        <>
          {linesToDisplay.map((line, index) => {
            const displayContent = line.substring(baseIndentation);
            return (
              <Text key={index} color="gray">
                {displayContent}
              </Text>
            );
          })}
          {shouldTruncate && (
            <Text color="cyan" dimColor>
              ... ({totalLines - maxLinesToShow} more lines)
            </Text>
          )}
        </>
      );
    };

    switch (entry.type) {
      case "user":
        return (
          <Box key={index} flexDirection="column" marginTop={1}>
            <Box>
              <Text color="gray">
                {">"} {truncateContent(entry.content)}
              </Text>
            </Box>
          </Box>
        );

      case "assistant":
        return (
          <Box key={index} flexDirection="column" marginTop={1}>
            <Box flexDirection="row" alignItems="flex-start">
              <Text color="white">⏺ </Text>
              <Box flexDirection="column" flexGrow={1}>
                {entry.toolCalls ? (
                  // If there are tool calls, just show plain text
                  <Text color="white">{truncateContent(entry.content.trim())}</Text>
                ) : (
                  // If no tool calls, render as markdown
                  <MarkdownRenderer content={truncateContent(entry.content.trim())} />
                )}
                {entry.isStreaming && <Text color="cyan">█</Text>}
              </Box>
            </Box>
          </Box>
        );

      case "tool_call":
      case "tool_result":
        const getToolActionName = (toolName: string) => {
          // Handle MCP tools with mcp__servername__toolname format
          if (toolName.startsWith("mcp__")) {
            const parts = toolName.split("__");
            if (parts.length >= 3) {
              const serverName = parts[1];
              const actualToolName = parts.slice(2).join("__");
              return `${serverName.charAt(0).toUpperCase() + serverName.slice(1)}(${actualToolName.replace(/_/g, " ")})`;
            }
          }

          switch (toolName) {
            case "view_file":
              return "Read";
            case "str_replace_editor":
              return "Update";
            case "create_file":
              return "Create";
            case "bash":
              return "Bash";
            case "search":
              return "Search";
            case "create_todo_list":
              return "Created Todo";
            case "update_todo_list":
              return "Updated Todo";
            case "view_todo_list":
              return "View Todo";
            default:
              return "Tool";
          }
        };

        const toolName = entry.toolCall?.function?.name || "unknown";
        const actionName = getToolActionName(toolName);

        const getFilePath = (toolCall: any) => {
          if (toolCall?.function?.arguments) {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              if (toolCall.function.name === "search") {
                return args.query;
              }
              return args.path || args.file_path || args.command || "";
            } catch {
              return "";
            }
          }
          return "";
        };

        const filePath = getFilePath(entry.toolCall);
        const isExecuting = entry.type === "tool_call" || !entry.toolResult;

        // Format JSON content for better readability
        const formatToolContent = (content: string, toolName: string) => {
          const truncated = truncateContent(content, 200); // Allow longer for tools
          if (toolName.startsWith("mcp__")) {
            try {
              // Try to parse as JSON and format it
              const parsed = JSON.parse(truncated);
              if (Array.isArray(parsed)) {
                // For arrays, show a summary instead of full JSON
                return `Found ${parsed.length} items`;
              } else if (typeof parsed === 'object') {
                // For objects, show a formatted version
                return JSON.stringify(parsed, null, 2);
              }
            } catch {
              // If not JSON, return as is
              return truncated;
            }
          }
          return truncated;
        };
        const shouldShowDiff =
          entry.toolCall?.function?.name === "str_replace_editor" &&
          entry.toolResult?.success &&
          entry.content.includes("Updated") &&
          entry.content.includes("---") &&
          entry.content.includes("+++");

        const shouldShowFileContent =
          (entry.toolCall?.function?.name === "view_file" ||
            entry.toolCall?.function?.name === "create_file") &&
          entry.toolResult?.success &&
          !shouldShowDiff;

        const isTodoTool =
          (entry.toolCall?.function?.name === "create_todo_list" ||
            entry.toolCall?.function?.name === "update_todo_list" ||
            entry.toolCall?.function?.name === "view_todo_list") &&
          entry.toolResult?.success &&
          entry.toolResult?.data;

        return (
          <Box key={index} flexDirection="column" marginTop={1}>
            <Box>
              <Text color="magenta">⏺</Text>
              <Text color="white">
                {" "}
                {filePath ? `${actionName}(${filePath})` : actionName}
              </Text>
            </Box>
            <Box marginLeft={2} flexDirection="column">
              {isExecuting ? (
                <Text color="cyan">⎿ Executing...</Text>
              ) : isTodoTool ? (
                <Box flexDirection="column">
                  <Text color="gray">⎿ {entry.content}</Text>
                  <Box marginLeft={2} flexDirection="column">
                    <TodoList todos={entry.toolResult?.data as TodoItem[]} />
                  </Box>
                </Box>
              ) : shouldShowFileContent ? (
                <Box flexDirection="column">
                  <Text color="gray">⎿ File contents:</Text>
                  <Box marginLeft={2} flexDirection="column">
                    {renderFileContent(entry.content)}
                  </Box>
                </Box>
              ) : shouldShowDiff ? (
                // For diff results, show only the summary line, not the raw content
                <Text color="gray">⎿ {entry.content.split("\n")[0]}</Text>
              ) : (
                <Text color="gray">⎿ {formatToolContent(entry.content, toolName)}</Text>
              )}
            </Box>
            {shouldShowDiff && !isExecuting && (
              <Box marginLeft={4} flexDirection="column">
                {renderDiff(entry.content, filePath)}
              </Box>
            )}
          </Box>
        );

      default:
        return null;
    }
  }
);

MemoizedChatEntry.displayName = "MemoizedChatEntry";

// Memoize ChatHistory component to prevent unnecessary re-renders
export const ChatHistory = React.memo(function ChatHistory({
  entries,
  isConfirmationActive = false,
}: ChatHistoryProps) {
  // Filter out tool_call entries with "Executing..." when confirmation is active
  const filteredEntries = isConfirmationActive
    ? entries.filter(
      (entry) =>
        !(entry.type === "tool_call" && entry.content === "Executing...")
    )
    : entries;

  // Compact mode: show fewer entries to reduce rendering overhead
  const maxEntries = process.env.COMPACT === '1' ? 5 : 20;

  return (
    <Box flexDirection="column">
      {filteredEntries.slice(-maxEntries).map((entry, index) => (
        <MemoizedChatEntry
          key={entry.timestamp.getTime()}
          entry={entry}
          index={index}
        />
      ))}
    </Box>
  );
});
