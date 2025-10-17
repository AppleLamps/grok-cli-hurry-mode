import { GrokClient, GrokMessage, GrokToolCall } from "../grok/client.js";
import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import {
  getAllGrokTools,
  getMCPManager,
  initializeMCPServers,
} from "../grok/tools.js";
import { loadMCPConfig } from "../mcp/config.js";
import { debugLog } from "../utils/debug.js";
import {
  TextEditorTool,
  MorphEditorTool,
  BashTool,
  TodoTool,
  ConfirmationTool,
  SearchTool,
  TaskPlannerTool,
  MultiFileEditorTool,
  AdvancedSearchTool,
  FileTreeOperationsTool,
  CodeAwareEditorTool,
  OperationHistoryTool,
  SymbolSearchTool,
  DependencyAnalyzerTool,
  CodeContextTool,
  RefactoringAssistantTool,
} from "../tools/index.js";
import { CodeIntelligenceEngine } from "../tools/intelligence/engine.js";
import { ToolResult } from "../types/index.js";
import { extractSelfCorrectError } from "../types/errors.js";
import { MetricsCollector } from "../utils/metrics.js";
import { EventEmitter } from "events";
import { createTokenCounter, TokenCounter } from "../utils/token-counter.js";
import { loadCustomInstructions } from "../utils/custom-instructions.js";
import { getSettingsManager } from "../utils/settings-manager.js";
import { TaskOrchestrator, OrchestratorResult } from "../planning/task-orchestrator.js";
import { PlanExecutionProgress, TaskPlan } from "../planning/types.js";

export interface ChatEntry {
  type: "user" | "assistant" | "tool_result" | "tool_call";
  content: string;
  timestamp: Date;
  toolCalls?: GrokToolCall[];
  toolCall?: GrokToolCall;
  toolResult?: { success: boolean; output?: string; error?: string };
  isStreaming?: boolean;
}

export interface StreamingChunk {
  type: "content" | "tool_calls" | "tool_result" | "done" | "token_count";
  content?: string;
  toolCalls?: GrokToolCall[];
  toolCall?: GrokToolCall;
  toolResult?: ToolResult;
  tokenCount?: number;
}

export interface FallbackStrategy {
  fallbackTools: string[];
  strategy: 'decompose_and_retry' | 'sequential_execution' | 'simpler_tool' | 'bash_fallback';
  description: string;
}

export class GrokAgent extends EventEmitter {
  private grokClient: GrokClient;
  private textEditor: TextEditorTool;
  private morphEditor: MorphEditorTool | null;
  private bash: BashTool;
  private todoTool: TodoTool;
  private confirmationTool: ConfirmationTool;
  private search: SearchTool;
  private taskPlanner: TaskPlannerTool;
  // Advanced tools
  private multiFileEditor: MultiFileEditorTool;
  private advancedSearch: AdvancedSearchTool;
  private fileTreeOps: FileTreeOperationsTool;
  private codeAwareEditor: CodeAwareEditorTool;
  private operationHistory: OperationHistoryTool;
  // Intelligence tools
  private intelligenceEngine: CodeIntelligenceEngine;
  private symbolSearch: SymbolSearchTool;
  private dependencyAnalyzer: DependencyAnalyzerTool;
  private codeContext: CodeContextTool;
  private refactoringAssistant: RefactoringAssistantTool;
  private taskOrchestrator: TaskOrchestrator;
  private chatHistory: ChatEntry[] = [];
  private messages: GrokMessage[] = [];
  private tokenCounter: TokenCounter;
  private abortController: AbortController | null = null;
  private mcpInitialized: boolean = false;
  private maxToolRounds: number;
  private lastRequestTime: number = 0;
  private activeToolCalls: number = 0;
  private readonly maxConcurrentToolCalls: number = 2;
  private readonly minRequestInterval: number = 500; // ms
  private sessionLogPath: string;
  private planExecutionInProgress: boolean = false;
  // Self-correction tracking
  private toolRetryCount: Map<string, number> = new Map();
  private readonly maxRetries: number = 3;
  private fallbackStrategies: Map<string, FallbackStrategy>;
  // Correction attempt tracking for LLM re-engagement
  private correctionAttempts: Map<string, Array<{
    tool: string;
    error: string;
    timestamp: number;
    fallbackStrategy: string;
  }>> = new Map();
  // Metrics tracking
  private metrics: MetricsCollector;
  private readonly maxCorrectionAttempts: number = 3;
  // Loop detection
  private operationTracker = require('../utils/operation-tracker.js').OperationTracker.getInstance();
  private consecutiveIdenticalRequests: Map<string, number> = new Map();
  private readonly maxIdenticalRequests: number = 2;

  constructor(
    apiKey: string,
    baseURL?: string,
    model?: string,
    maxToolRounds?: number
  ) {
    super();
    const manager = getSettingsManager();
    const savedModel = manager.getCurrentModel();
    const modelToUse = model || savedModel || "grok-code-fast-1";
    this.maxToolRounds = maxToolRounds || 400;
    this.sessionLogPath = process.env.GROK_SESSION_LOG || `${process.env.HOME}/.grok/session.log`;

    // Get settings from manager
    const clientOptions = {
      timeout: manager.getTimeout(),
      streamTimeout: manager.getStreamTimeout(),
      temperature: manager.getTemperature(),
      maxTokens: manager.getMaxTokens(),
    };

    // Initialize client with settings
    this.grokClient = new GrokClient(apiKey, modelToUse, baseURL, clientOptions);

    // Get parallel execution settings
    const parallelEnabled = manager.getParallelToolCalls();
    this.maxConcurrentToolCalls = parallelEnabled ? manager.getMaxConcurrentTools() : 1;

    this.textEditor = new TextEditorTool();
    this.morphEditor = process.env.MORPH_API_KEY ? new MorphEditorTool() : null;
    this.bash = new BashTool();
    this.todoTool = new TodoTool();
    this.confirmationTool = new ConfirmationTool();
    this.search = new SearchTool();
    this.taskPlanner = new TaskPlannerTool(process.cwd());
    // Initialize advanced tools
    this.multiFileEditor = new MultiFileEditorTool();
    this.advancedSearch = new AdvancedSearchTool();
    this.fileTreeOps = new FileTreeOperationsTool();
    this.codeAwareEditor = new CodeAwareEditorTool();
    this.operationHistory = new OperationHistoryTool();
    // Initialize intelligence engine
    this.intelligenceEngine = new CodeIntelligenceEngine(process.cwd());
    // Initialize intelligence tools
    this.symbolSearch = new SymbolSearchTool(this.intelligenceEngine);
    this.dependencyAnalyzer = new DependencyAnalyzerTool(this.intelligenceEngine);
    this.codeContext = new CodeContextTool(this.intelligenceEngine);
    this.refactoringAssistant = new RefactoringAssistantTool(this.intelligenceEngine);
    this.tokenCounter = createTokenCounter(modelToUse);

    // Initialize metrics collector
    this.metrics = MetricsCollector.getInstance();

    // Initialize task orchestrator
    this.taskOrchestrator = new TaskOrchestrator(process.cwd(), {
      maxSteps: 50,
      maxDuration: 300000,
      allowRiskyOperations: false,
      requireConfirmation: true,
      autoRollbackOnFailure: true,
      parallelExecution: false,
      maxParallelSteps: 3
    });

    // Forward orchestrator events
    this.taskOrchestrator.on('progress', (progress: PlanExecutionProgress) => {
      this.emit('plan_progress', progress);
    });
    this.taskOrchestrator.on('phase', (data: any) => {
      this.emit('plan_phase', data);
    });

    // Initialize fallback strategies for self-correction
    this.fallbackStrategies = new Map([
      ['refactoring_assistant', {
        fallbackTools: ['multi_file_edit', 'code_analysis', 'str_replace_editor'],
        strategy: 'decompose_and_retry',
        description: 'Break down refactoring into smaller file edits'
      }],
      ['multi_file_edit', {
        fallbackTools: ['str_replace_editor'],
        strategy: 'sequential_execution',
        description: 'Execute file edits one at a time'
      }],
      ['code_analysis', {
        fallbackTools: ['str_replace_editor', 'bash'],
        strategy: 'simpler_tool',
        description: 'Use simpler text editing tools'
      }],
      ['advanced_search', {
        fallbackTools: ['search', 'bash'],
        strategy: 'bash_fallback',
        description: 'Fall back to grep/find commands'
      }],
      ['symbol_search', {
        fallbackTools: ['search', 'bash'],
        strategy: 'bash_fallback',
        description: 'Use text-based search instead of AST'
      }],
      ['dependency_analyzer', {
        fallbackTools: ['search', 'bash'],
        strategy: 'bash_fallback',
        description: 'Use grep to find imports'
      }]
    ]);

    // Initialize MCP servers if configured
    this.initializeMCP();

    // Load custom instructions
    const customInstructions = loadCustomInstructions();
    const customInstructionsSection = customInstructions
      ? `\n\nCUSTOM INSTRUCTIONS:\n${customInstructions}\n\nThe above custom instructions should be followed alongside the standard instructions below.`
      : "";

    // Initialize with system message
    this.messages.push({
      role: "system",
      content: `You are Grok CLI, an AI assistant that helps with file editing, coding tasks, and system operations.${customInstructionsSection}

You have access to these tools:

CORE TOOLS:
- view_file: View file contents or directory listings
- create_file: Create new files with content (ONLY use this for files that don't exist yet)
- str_replace_editor: Replace text in existing files (ALWAYS use this to edit or update existing files)${this.morphEditor
          ? "\n- edit_file: High-speed file editing with Morph Fast Apply (4,500+ tokens/sec with 98% accuracy)"
          : ""
        }
- bash: Execute bash commands (use for searching, file discovery, navigation, and system operations)
- search: Unified search tool for finding text content or files (similar to Cursor's search functionality)
- create_todo_list: Create a visual todo list for planning and tracking tasks
- update_todo_list: Update existing todos in your todo list
- task_planner: Intelligent multi-step task planning with automatic decomposition and execution

ADVANCED TOOLS:
- multi_file_edit: Perform atomic operations across multiple files with transaction support
- advanced_search: Enhanced search with regex patterns, context, and bulk replace capabilities
- file_tree_ops: Generate directory trees, bulk operations, and file organization
- code_analysis: Analyze code structure, perform refactoring, and smart code operations
- operation_history: Track, undo, and redo operations with comprehensive history management

REAL-TIME INFORMATION:
You have access to real-time web search and X (Twitter) data. When users ask for current information, latest news, or recent events, you automatically have access to up-to-date information from the web and social media.

IMPORTANT TOOL USAGE RULES:
- NEVER use create_file on files that already exist - this will overwrite them completely
- ALWAYS use str_replace_editor to modify existing files, even for small changes
- Before editing a file, use view_file to see its current contents
- Use create_file ONLY when creating entirely new files that don't exist

SEARCHING AND EXPLORATION:
- Use search for fast, powerful text search across files or finding files by name (unified search tool)
- Examples: search for text content like "import.*react", search for files like "component.tsx"
- Use bash with commands like 'find', 'grep', 'rg', 'ls' for complex file operations and navigation
- view_file is best for reading specific files you already know exist

When a user asks you to edit, update, modify, or change an existing file:
1. First use view_file to see the current contents
2. Then use str_replace_editor to make the specific changes
3. Never use create_file for existing files

When a user asks you to create a new file that doesn't exist:
1. Use create_file with the full content

TASK PLANNING WITH TODO LISTS:
- For complex requests with multiple steps, ALWAYS create a todo list first to plan your approach
- Use create_todo_list to break down tasks into manageable items with priorities
- Mark tasks as 'in_progress' when you start working on them (only one at a time)
- Mark tasks as 'completed' immediately when finished
- Use update_todo_list to track your progress throughout the task
- Todo lists provide visual feedback with colors: ✅ Green (completed), 🔄 Cyan (in progress), ⏳ Yellow (pending)
- Always create todos with priorities: 'high' (🔴), 'medium' (🟡), 'low' (🟢)

USER CONFIRMATION SYSTEM:
File operations (create_file, str_replace_editor) and bash commands will automatically request user confirmation before execution. The confirmation system will show users the actual content or command before they decide. Users can choose to approve individual operations or approve all operations of that type for the session.

If a user rejects an operation, the tool will return an error and you should not proceed with that specific operation.

Be helpful, direct, and efficient. Always explain what you're doing and show the results.

IMPORTANT RESPONSE GUIDELINES:
- After using tools, do NOT respond with pleasantries like "Thanks for..." or "Great!"
- Only provide necessary explanations or next steps if relevant to the task
- Keep responses concise and focused on the actual work being done
- If a tool execution completes the user's request, you can remain silent or give a brief confirmation

Current working directory: ${process.cwd()}`,
    });
  }

  private async initializeMCP(): Promise<void> {
    // Initialize MCP in the background without blocking
    Promise.resolve().then(async () => {
      try {
        const config = loadMCPConfig();
        if (config.servers.length > 0) {
          await initializeMCPServers();
        }
      } catch (error) {
        debugLog("MCP initialization failed:", error);
      } finally {
        this.mcpInitialized = true;
      }
    });
  }

  private isGrokModel(): boolean {
    const currentModel = this.grokClient.getCurrentModel();
    return currentModel.toLowerCase().includes("grok");
  }

  // Heuristic: enable web search only when likely needed
  private shouldUseSearchFor(message: string): boolean {
    const q = message.toLowerCase();
    const keywords = [
      "today",
      "latest",
      "news",
      "trending",
      "breaking",
      "current",
      "now",
      "recent",
      "x.com",
      "twitter",
      "tweet",
      "what happened",
      "as of",
      "update on",
      "release notes",
      "changelog",
      "price",
    ];
    if (keywords.some((k) => q.includes(k))) return true;
    // crude date pattern (e.g., 2024/2025) may imply recency
    if (/(20\d{2})/.test(q)) return true;
    return false;
  }

  async processUserMessage(message: string): Promise<ChatEntry[]> {
    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    this.logEntry(userEntry);
    this.messages.push({ role: "user", content: message });

    const newEntries: ChatEntry[] = [userEntry];
    const maxToolRounds = this.maxToolRounds; // Prevent infinite loops
    let toolRounds = 0;

    try {
      const tools = await getAllGrokTools();
      let currentResponse = await this.grokClient.chat(
        this.messages,
        tools,
        undefined,
        this.isGrokModel() && this.shouldUseSearchFor(message)
          ? { search_parameters: { mode: "auto" } }
          : { search_parameters: { mode: "off" } }
      );

      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        const assistantMessage = currentResponse.choices[0]?.message;

        if (!assistantMessage) {
          throw new Error("No response from Grok");
        }

        // Handle tool calls
        if (
          assistantMessage.tool_calls &&
          assistantMessage.tool_calls.length > 0
        ) {
          toolRounds++;

          // Add assistant message with tool calls
          const assistantEntry: ChatEntry = {
            type: "assistant",
            content: assistantMessage.content || "Using tools to help you...",
            timestamp: new Date(),
            toolCalls: assistantMessage.tool_calls,
          };
          this.chatHistory.push(assistantEntry);
          this.logEntry(assistantEntry);
          newEntries.push(assistantEntry);

          // Add assistant message to conversation
          this.messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: assistantMessage.tool_calls,
          } as any);

          // Create initial tool call entries to show tools are being executed
          assistantMessage.tool_calls.forEach((toolCall) => {
            const toolCallEntry: ChatEntry = {
              type: "tool_call",
              content: "Executing...",
              timestamp: new Date(),
              toolCall: toolCall,
            };
            this.chatHistory.push(toolCallEntry);
            newEntries.push(toolCallEntry);
          });

          // Execute tool calls and update the entries
          for (const toolCall of assistantMessage.tool_calls) {
            const result = await this.executeTool(toolCall);

            // Update the existing tool_call entry with the result
            const entryIndex = this.chatHistory.findIndex(
              (entry) =>
                entry.type === "tool_call" && entry.toolCall?.id === toolCall.id
            );

            if (entryIndex !== -1) {
              const updatedEntry: ChatEntry = {
                ...this.chatHistory[entryIndex],
                type: "tool_result",
                content: result.success
                  ? result.output || "Success"
                  : result.error || "Error occurred",
                toolResult: result,
              };
              this.chatHistory[entryIndex] = updatedEntry;

              // Also update in newEntries for return value
              const newEntryIndex = newEntries.findIndex(
                (entry) =>
                  entry.type === "tool_call" &&
                  entry.toolCall?.id === toolCall.id
              );
              if (newEntryIndex !== -1) {
                newEntries[newEntryIndex] = updatedEntry;
              }
            }

            // Add tool result to messages with proper format (needed for AI context)
            this.messages.push({
              role: "tool",
              content: result.success
                ? result.output || "Success"
                : result.error || "Error",
              tool_call_id: toolCall.id,
            });
          }

          // Get next response - this might contain more tool calls
          currentResponse = await this.grokClient.chat(
            this.messages,
            tools,
            undefined,
            this.isGrokModel() && this.shouldUseSearchFor(message)
              ? { search_parameters: { mode: "auto" } }
              : { search_parameters: { mode: "off" } }
          );
        } else {
          // No more tool calls, add final response
          const finalEntry: ChatEntry = {
            type: "assistant",
            content:
              assistantMessage.content ||
              "I understand, but I don't have a specific response.",
            timestamp: new Date(),
          };
          this.chatHistory.push(finalEntry);
          this.messages.push({
            role: "assistant",
            content: assistantMessage.content || "",
          });
          newEntries.push(finalEntry);
          break; // Exit the loop
        }
      }

      if (toolRounds >= maxToolRounds) {
        const warningEntry: ChatEntry = {
          type: "assistant",
          content:
            "Maximum tool execution rounds reached. Stopping to prevent infinite loops.",
          timestamp: new Date(),
        };
        this.chatHistory.push(warningEntry);
        newEntries.push(warningEntry);
      }

      return newEntries;
    } catch (error: any) {
      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      return [userEntry, errorEntry];
    }
  }

  private messageReducer(previous: any, item: any): any {
    const reduce = (acc: any, delta: any) => {
      acc = { ...acc };
      for (const [key, value] of Object.entries(delta)) {
        if (acc[key] === undefined || acc[key] === null) {
          acc[key] = value;
          // Clean up index properties from tool calls
          if (Array.isArray(acc[key])) {
            for (const arr of acc[key]) {
              delete arr.index;
            }
          }
        } else if (typeof acc[key] === "string" && typeof value === "string") {
          (acc[key] as string) += value;
        } else if (Array.isArray(acc[key]) && Array.isArray(value)) {
          const accArray = acc[key] as any[];
          for (let i = 0; i < value.length; i++) {
            if (!accArray[i]) accArray[i] = {};
            accArray[i] = reduce(accArray[i], value[i]);
          }
        } else if (typeof acc[key] === "object" && typeof value === "object") {
          acc[key] = reduce(acc[key], value);
        }
      }
      return acc;
    };

    return reduce(previous, item.choices[0]?.delta || {});
  }

  async *processUserMessageStream(
    message: string
  ): AsyncGenerator<StreamingChunk, void, unknown> {
    // Create new abort controller for this request
    this.abortController = new AbortController();

    // Check for identical request repetition
    const requestHash = this.hashRequest(message);
    const identicalCount = this.consecutiveIdenticalRequests.get(requestHash) || 0;

    if (identicalCount >= this.maxIdenticalRequests) {
      yield {
        type: "content",
        content: `\n\n⚠️ **Loop Detected**: This request has been repeated ${identicalCount + 1} times.\n\n` +
          `The same operation appears to be executing repeatedly. This usually means:\n` +
          `1. The task is already complete\n` +
          `2. The desired changes have already been applied\n` +
          `3. There's a misunderstanding about what needs to be done\n\n` +
          `**Suggestion**: Please verify the current state and provide a different request if changes are still needed.`
      };
      this.consecutiveIdenticalRequests.delete(requestHash);
      return;
    }

    // Check for operation loops
    const loopCheck = this.operationTracker.detectLoop(5);
    if (loopCheck.isLoop) {
      yield {
        type: "content",
        content: `\n\n⚠️ **Operation Loop Detected**: ${loopCheck.suggestion}\n\n` +
          `The same file operations are being repeated. This indicates the task may already be complete.\n\n` +
          `**Recent operations**:\n${loopCheck.repeatedOperations?.map(op =>
            `- ${op.type} ${op.filePath.split('/').pop()} at ${new Date(op.timestamp).toLocaleTimeString()}`
          ).join('\n')}`
      };
      this.operationTracker.clearAll();
      this.consecutiveIdenticalRequests.delete(requestHash);
      return;
    }

    // Track this request
    this.consecutiveIdenticalRequests.set(requestHash, identicalCount + 1);

    // Add user message to conversation
    const userEntry: ChatEntry = {
      type: "user",
      content: message,
      timestamp: new Date(),
    };
    this.chatHistory.push(userEntry);
    this.messages.push({ role: "user", content: message });

    // Calculate input tokens
    let inputTokens = this.tokenCounter.countMessageTokens(
      this.messages as any
    );
    yield {
      type: "token_count",
      tokenCount: inputTokens,
    };

    const maxToolRounds = this.maxToolRounds; // Prevent infinite loops
    let toolRounds = 0;
    let totalOutputTokens = 0;
    let lastTokenUpdate = 0;

    try {
      // PHASE 1: Plan Detection - Check if this request warrants automatic planning
      const shouldPlan = this.shouldCreatePlan(message);
      if (shouldPlan && !this.planExecutionInProgress) {
        try {
          yield {
            type: "content",
            content: "\n📋 Analyzing request complexity... Generating task plan...\n\n"
          };

          const planResult = await this.generateAndConfirmPlan(message);

          if (planResult.approved && planResult.plan) {
            yield {
              type: "content",
              content: "✅ Plan approved. Executing steps...\n\n"
            };

            // Execute plan steps
            this.planExecutionInProgress = true;
            const executionResults = await this.executePlanSteps(planResult.plan);
            this.planExecutionInProgress = false;

            // Report results
            const successCount = executionResults.filter(r => r.success).length;
            const failCount = executionResults.filter(r => !r.success).length;

            yield {
              type: "content",
              content: `\n✅ Plan execution complete!\n` +
                `   Successful steps: ${successCount}\n` +
                `   Failed steps: ${failCount}\n\n`
            };

            // Add final response to conversation
            const finalEntry: ChatEntry = {
              type: "assistant",
              content: `Plan executed with ${successCount} successful steps and ${failCount} failed steps.`,
              timestamp: new Date(),
            };
            this.chatHistory.push(finalEntry);
            this.messages.push({
              role: "assistant",
              content: finalEntry.content,
            });

            yield { type: "done" };
            return;
          } else {
            yield {
              type: "content",
              content: "Plan rejected. Proceeding with standard agent loop...\n\n"
            };
          }
        } catch (error: any) {
          debugLog('Plan generation/execution failed, continuing with standard loop:', error);
          yield {
            type: "content",
            content: `⚠️ Plan generation failed: ${error.message}\nProceeding with standard approach...\n\n`
          };
        }
      }

      // Agent loop - continue until no more tool calls or max rounds reached
      while (toolRounds < maxToolRounds) {
        // Check if operation was cancelled
        if (this.abortController?.signal.aborted) {
          yield {
            type: "content",
            content: "\n\n[Operation cancelled by user]",
          };
          yield { type: "done" };
          return;
        }

        // Enforce global rate limit
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
          const delay = this.minRequestInterval - timeSinceLastRequest;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        this.lastRequestTime = Date.now();

        // Stream response and accumulate
        const tools = await getAllGrokTools();
        const stream = this.grokClient.chatStream(
          this.messages,
          tools,
          undefined,
          this.isGrokModel() && this.shouldUseSearchFor(message)
            ? { search_parameters: { mode: "auto" } }
            : { search_parameters: { mode: "off" } }
        );
        let accumulatedMessage: any = {};
        let accumulatedContent = "";
        let toolCallsYielded = false;

        for await (const chunk of stream) {
          // Check for cancellation in the streaming loop
          if (this.abortController?.signal.aborted) {
            yield {
              type: "content",
              content: "\n\n[Operation cancelled by user]",
            };
            yield { type: "done" };
            return;
          }

          if (!chunk.choices?.[0]) continue;

          // Accumulate the message using reducer
          accumulatedMessage = this.messageReducer(accumulatedMessage, chunk);

          // Check for tool calls - yield when we have complete tool calls with function names
          if (!toolCallsYielded && accumulatedMessage.tool_calls?.length > 0) {
            // Check if we have at least one complete tool call with a function name
            const hasCompleteTool = accumulatedMessage.tool_calls.some(
              (tc: any) => tc.function?.name
            );
            if (hasCompleteTool) {
              yield {
                type: "tool_calls",
                toolCalls: accumulatedMessage.tool_calls,
              };
              toolCallsYielded = true;
            }
          }

          // Stream content as it comes
          if (chunk.choices[0].delta?.content) {
            accumulatedContent += chunk.choices[0].delta.content;

            // Update token count in real-time including accumulated content and any tool calls
            const currentOutputTokens =
              this.tokenCounter.estimateStreamingTokens(accumulatedContent) +
              (accumulatedMessage.tool_calls
                ? this.tokenCounter.countTokens(
                  JSON.stringify(accumulatedMessage.tool_calls)
                )
                : 0);
            totalOutputTokens = currentOutputTokens;

            yield {
              type: "content",
              content: chunk.choices[0].delta.content,
            };

            // Emit token count update
            const now = Date.now();
            if (now - lastTokenUpdate > 250) {
              lastTokenUpdate = now;
              yield {
                type: "token_count",
                tokenCount: inputTokens + totalOutputTokens,
              };
            }
          }
        }

        // Add assistant entry to history
        const assistantEntry: ChatEntry = {
          type: "assistant",
          content: accumulatedMessage.content || "Using tools to help you...",
          timestamp: new Date(),
          toolCalls: accumulatedMessage.tool_calls || undefined,
        };
        this.chatHistory.push(assistantEntry);

        // Add accumulated message to conversation
        this.messages.push({
          role: "assistant",
          content: accumulatedMessage.content || "",
          tool_calls: accumulatedMessage.tool_calls,
        } as any);

        // Handle tool calls if present
        if (accumulatedMessage.tool_calls?.length > 0) {
          toolRounds++;

          // Only yield tool_calls if we haven't already yielded them during streaming
          if (!toolCallsYielded) {
            yield {
              type: "tool_calls",
              toolCalls: accumulatedMessage.tool_calls,
            };
          }

          // Execute tools with concurrency limit
          const toolCalls = accumulatedMessage.tool_calls;
          for (let i = 0; i < toolCalls.length; i += this.maxConcurrentToolCalls) {
            const batch = toolCalls.slice(i, i + this.maxConcurrentToolCalls);
            const batchPromises = batch.map(async (toolCall: GrokToolCall) => {
              // Check for cancellation before executing each tool
              if (this.abortController?.signal.aborted) {
                return null;
              }

              const result = await this.executeTool(toolCall);

              // PHASE 3: Check for self-correction signal (typed error or legacy string)
              let correctionInfo = null;
              const selfCorrectError = extractSelfCorrectError(result);
              if (selfCorrectError) {
                const correctionResult = this.handleSelfCorrectAttempt(result, toolCall, message);

                if (correctionResult.shouldRetry && correctionResult.fallbackRequest) {
                  // Add fallback request to conversation for LLM re-engagement
                  this.messages.push({
                    role: "user",
                    content: `Previous approach failed. ${correctionResult.fallbackRequest}\n\nPlease try again with the suggested approach.`
                  });

                  // Mark for correction notification
                  correctionInfo = { type: 'retry', message: correctionResult.fallbackRequest };

                  // Don't add the error to chat history, let the retry happen
                  return {
                    toolCall,
                    result: { success: true, output: 'Retrying with fallback strategy' },
                    entry: null,
                    correctionInfo
                  };
                } else {
                  correctionInfo = { type: 'exhausted' };
                }
              }

              const toolResultEntry: ChatEntry = {
                type: "tool_result",
                content: result.success
                  ? result.output || "Success"
                  : result.error || "Error occurred",
                timestamp: new Date(),
                toolCall: toolCall,
                toolResult: result,
              };
              this.chatHistory.push(toolResultEntry);

              // Add tool result with proper format (needed for AI context)
              this.messages.push({
                role: "tool",
                content: result.success
                  ? result.output || "Success"
                  : result.error || "Error",
                tool_call_id: toolCall.id,
              });

              return { toolCall, result, entry: toolResultEntry, correctionInfo };
            });

            const batchResults = await Promise.all(batchPromises);
            if (batchResults.includes(null)) {
              // Cancelled
              yield {
                type: "content",
                content: "\n\n[Operation cancelled by user]",
              };
              yield { type: "done" };
              return;
            }

            // Yield results after batch completes
            for (const batchResult of batchResults) {
              // Handle correction notifications
              if (batchResult && batchResult.correctionInfo) {
                if (batchResult.correctionInfo.type === 'retry') {
                  yield {
                    type: "content",
                    content: `\n🔄 Self-correction triggered. Retrying with alternative approach...\n\n`
                  };
                } else if (batchResult.correctionInfo.type === 'exhausted') {
                  yield {
                    type: "content",
                    content: `\n❌ Self-correction attempts exhausted. Please try a different approach.\n\n`
                  };
                }
              }

              if (batchResult && batchResult.entry) {
                yield {
                  type: "tool_result",
                  toolCall: batchResult.toolCall,
                  toolResult: batchResult.result,
                };
              }
            }
          }

          // Update token count after processing all tool calls to include tool results
          inputTokens = this.tokenCounter.countMessageTokens(
            this.messages as any
          );
          // Final token update after tools processed
          yield {
            type: "token_count",
            tokenCount: inputTokens + totalOutputTokens,
          };

          // Continue the loop to get the next response (which might have more tool calls)
        } else {
          // No tool calls, we're done
          break;
        }
      }

      if (toolRounds >= maxToolRounds) {
        yield {
          type: "content",
          content:
            "\n\nMaximum tool execution rounds reached. Stopping to prevent infinite loops.",
        };
      }

      // Reset identical request counter on successful completion
      this.consecutiveIdenticalRequests.delete(requestHash);

      yield { type: "done" };
    } catch (error: any) {
      // Check if this was a cancellation
      if (this.abortController?.signal.aborted) {
        yield {
          type: "content",
          content: "\n\n[Operation cancelled by user]",
        };
        yield { type: "done" };
        return;
      }

      const errorEntry: ChatEntry = {
        type: "assistant",
        content: `Sorry, I encountered an error: ${error.message}`,
        timestamp: new Date(),
      };
      this.chatHistory.push(errorEntry);
      yield {
        type: "content",
        content: errorEntry.content,
      };
      yield { type: "done" };
    } finally {
      // Clean up abort controller
      this.abortController = null;
    }
  }

  private async executeTool(toolCall: GrokToolCall): Promise<ToolResult> {
    const operationId = this.metrics.startOperation(toolCall.function.name, {
      toolCallId: toolCall.id,
      args: toolCall.function.arguments
    });

    try {
      const args = JSON.parse(toolCall.function.arguments);
      let result: ToolResult;

      switch (toolCall.function.name) {
        case "view_file":
          try {
            const range: [number, number] | undefined =
              args.start_line && args.end_line
                ? [args.start_line, args.end_line]
                : undefined;
            const viewResult = await this.textEditor.view(args.path, range);

            // If file not found, provide helpful error
            if (!viewResult.success && viewResult.error?.includes('not found')) {
              result = {
                success: false,
                error: `SELF_CORRECT_ATTEMPT: File not found: ${args.path}. ` +
                  `Please verify the file path is correct. Try one of these:\n` +
                  `1. Use 'search' to find the file in the project\n` +
                  `2. Check if the file was moved or renamed\n` +
                  `3. Verify you're in the correct directory\n` +
                  `4. Use 'bash' with 'find' or 'ls' to locate the file`,
                metadata: {
                  originalTool: 'view_file',
                  originalError: viewResult.error,
                  suggestedApproach: 'search_for_file',
                  fallbackTools: ['search', 'bash']
                }
              };
            } else {
              result = viewResult;
            }
          } catch (error: any) {
            debugLog(`view_file tool failed: ${error.message}`);

            result = {
              success: false,
              error: `SELF_CORRECT_ATTEMPT: Failed to view file: ${error.message}. ` +
                `Please verify the file exists and is accessible.`,
              metadata: {
                originalTool: 'view_file',
                originalError: error.message,
                suggestedApproach: 'verify_file_exists',
                fallbackTools: ['bash', 'search']
              }
            };
          }
          break;

        case "create_file":
          try {
            const result = await this.textEditor.create(args.path, args.content);

            // If file already exists, provide helpful error
            if (!result.success && result.error?.includes('already exists')) {
              return {
                success: false,
                error: `SELF_CORRECT_ATTEMPT: File already exists: ${args.path}. ` +
                  `Please try one of these approaches:\n` +
                  `1. Use 'view_file' to see the current content\n` +
                  `2. Use 'str_replace_editor' to modify the existing file\n` +
                  `3. Choose a different file name\n` +
                  `4. Delete the existing file first if you want to replace it`,
                metadata: {
                  originalTool: 'create_file',
                  originalError: result.error,
                  suggestedApproach: 'view_then_edit',
                  fallbackTools: ['view_file', 'str_replace_editor']
                }
              };
            }

            return result;
          } catch (error: any) {
            debugLog(`create_file tool failed: ${error.message}`);

            return {
              success: false,
              error: `SELF_CORRECT_ATTEMPT: Failed to create file: ${error.message}. ` +
                `Please verify the directory exists and you have write permissions.`,
              metadata: {
                originalTool: 'create_file',
                originalError: error.message,
                suggestedApproach: 'verify_directory',
                fallbackTools: ['bash']
              }
            };
          }

        case "str_replace_editor":
          try {
            const result = await this.textEditor.strReplace(
              args.path,
              args.old_str,
              args.new_str,
              args.replace_all
            );

            // Check if string not found - trigger self-correction
            if (!result.success && result.error?.includes('String not found')) {
              return {
                success: false,
                error: `SELF_CORRECT_ATTEMPT: The exact string was not found in the file. ` +
                  `This often happens due to whitespace differences or formatting. ` +
                  `Please try one of these approaches:\n` +
                  `1. Use 'view_file' to see the exact current content first\n` +
                  `2. Use 'multi_file_edit' with line-based operations instead\n` +
                  `3. Use 'code_analysis' to analyze the file structure first\n` +
                  `4. Break the edit into smaller, more specific single-line changes`,
                metadata: {
                  originalTool: 'str_replace_editor',
                  originalError: result.error,
                  suggestedApproach: 'view_file_then_retry',
                  fallbackTools: ['view_file', 'multi_file_edit', 'code_analysis']
                }
              };
            }

            return result;
          } catch (error: any) {
            debugLog(`str_replace_editor tool failed: ${error.message}`);

            // Return self-correction signal instead of bash fallback
            return {
              success: false,
              error: `SELF_CORRECT_ATTEMPT: File operation failed: ${error.message}. ` +
                `Please use 'view_file' to check the current state and try again with the exact content.`,
              metadata: {
                originalTool: 'str_replace_editor',
                originalError: error.message,
                suggestedApproach: 'view_file_then_retry',
                fallbackTools: ['view_file', 'multi_file_edit']
              }
            };
          }

        case "edit_file":
          if (!this.morphEditor) {
            return {
              success: false,
              error:
                "Morph Fast Apply not available. Please set MORPH_API_KEY environment variable to use this feature.",
            };
          }
          return await this.morphEditor.editFile(
            args.target_file,
            args.instructions,
            args.code_edit
          );

        case "bash":
          return await this.bash.execute(args.command);

        case "create_todo_list":
          return await this.todoTool.createTodoList(args.todos);

        case "update_todo_list":
          return await this.todoTool.updateTodoList(args.updates);

        case "search":
          try {
            return await this.search.search(args.query, {
              searchType: args.search_type,
              includePattern: args.include_pattern,
              excludePattern: args.exclude_pattern,
              caseSensitive: args.case_sensitive,
              wholeWord: args.whole_word,
              regex: args.regex,
              maxResults: args.max_results,
              fileTypes: args.file_types,
              includeHidden: args.include_hidden,
            });
          } catch (error: any) {
            debugLog(`search tool failed, falling back to bash: ${error.message}`);
            // Fallback to bash grep/find
            let command = `grep -r "${args.query}" .`;
            if (args.include_pattern) {
              command += ` --include="${args.include_pattern}"`;
            }
            if (args.exclude_pattern) {
              command += ` --exclude="${args.exclude_pattern}"`;
            }
            return await this.bash.execute(command);
          }

        // Advanced Tools
        case "multi_file_edit":
          switch (args.operation) {
            case "begin_transaction":
              return await this.multiFileEditor.beginTransaction(args.description);
            case "add_operations":
              return await this.multiFileEditor.addOperations(args.operations);
            case "preview_transaction":
              return await this.multiFileEditor.previewTransaction();
            case "commit_transaction":
              return await this.multiFileEditor.commitTransaction();
            case "rollback_transaction":
              return await this.multiFileEditor.rollbackTransaction(args.transaction_id);
            case "execute_multi_file":
              return await this.multiFileEditor.executeMultiFileOperation(args.operations, args.description);
            default:
              return { success: false, error: `Unknown multi_file_edit operation: ${args.operation}` };
          }

        case "advanced_search":
          switch (args.operation) {
            case "search":
              return await this.advancedSearch.search(args.path, args.options);
            case "search_replace":
              return await this.advancedSearch.searchAndReplace(args.path, args.options);
            case "find_files":
              return await this.advancedSearch.findFiles(args.path, args.pattern, args.options);
            default:
              return { success: false, error: `Unknown advanced_search operation: ${args.operation}` };
          }

        case "file_tree_ops":
          switch (args.operation) {
            case "generate_tree":
              return await this.fileTreeOps.generateTree(args.path, args.options);
            case "bulk_operations":
              return await this.fileTreeOps.bulkOperations(args.operations);
            case "copy_structure":
              return await this.fileTreeOps.copyStructure(args.source, args.destination, args.options);
            case "organize_files":
              return await this.fileTreeOps.organizeFiles(args.source, args.organization_type, args.destination);
            case "cleanup_empty_dirs":
              return await this.fileTreeOps.cleanupEmptyDirectories(args.path);
            default:
              return { success: false, error: `Unknown file_tree_ops operation: ${args.operation}` };
          }

        case "code_analysis":
          switch (args.operation) {
            case "analyze":
              return await this.codeAwareEditor.analyzeCode(args.file_path);
            case "refactor":
              return await this.codeAwareEditor.refactor(args.file_path, args.refactor_operation);
            case "smart_insert":
              return await this.codeAwareEditor.smartInsert(args.file_path, args.code, args.location, args.target);
            case "format_code":
              return await this.codeAwareEditor.formatCode(args.file_path, args.options);
            case "add_imports":
              return await this.codeAwareEditor.addMissingImports(args.file_path, args.symbols);
            default:
              return { success: false, error: `Unknown code_analysis operation: ${args.operation}` };
          }

        case "operation_history":
          switch (args.operation) {
            case "show_history":
              return await this.operationHistory.showHistory(args.limit);
            case "undo":
              return await this.operationHistory.undo();
            case "redo":
              return await this.operationHistory.redo();
            case "goto_point":
              return await this.operationHistory.goToHistoryPoint(args.entry_id);
            case "clear_history":
              return await this.operationHistory.clearHistory();
            default:
              return { success: false, error: `Unknown operation_history operation: ${args.operation}` };
          }

        case "symbol_search":
          return await this.symbolSearch.execute(args);

        case "dependency_analyzer":
          return await this.dependencyAnalyzer.execute(args);

        case "code_context":
          return await this.codeContext.execute(args);

        case "refactoring_assistant":
          try {
            return await this.refactoringAssistant.execute(args);
          } catch (error: any) {
            // PHASE 3: Return SELF_CORRECT_ATTEMPT signal for LLM re-engagement
            debugLog(`refactoring_assistant failed: ${error.message}`);

            return {
              success: false,
              error: `SELF_CORRECT_ATTEMPT: The refactoring operation failed with error: "${error.message}". ` +
                `Please generate a new plan using the 'multi_file_edit' tool for more direct text manipulation ` +
                `across multiple files. Break down the refactoring into smaller, explicit file edits with ` +
                `specific line ranges and content replacements.`,
              metadata: {
                originalTool: 'refactoring_assistant',
                originalError: error.message,
                suggestedApproach: 'multi_file_edit',
                fallbackTools: ['multi_file_edit', 'code_analysis', 'str_replace_editor']
              }
            } as any;
          }

        case "task_planner":
          // Handle task planner operations
          const plannerResult = await this.taskPlanner.execute(args);

          // If this is a create_plan operation and it succeeded, optionally execute it
          if (args.operation === 'create_plan' && plannerResult.success && args.autoExecute) {
            try {
              const executionResult = await this.planAndExecute(args.userRequest, {
                currentDirectory: args.currentDirectory
              });

              return {
                success: executionResult.success,
                output: executionResult.success
                  ? `Plan created and executed successfully!\n\n${JSON.stringify(executionResult, null, 2)}`
                  : `Plan execution failed: ${executionResult.error}`,
                error: executionResult.success ? undefined : executionResult.error
              };
            } catch (error: any) {
              return {
                success: false,
                error: `Plan execution error: ${error.message}`
              };
            }
          }

          return plannerResult;

        default:
          // Check if this is an MCP tool
          if (toolCall.function.name.startsWith("mcp__")) {
            result = await this.executeMCPTool(toolCall);
          } else {
            result = {
              success: false,
              error: `Unknown tool: ${toolCall.function.name}`,
            };
          }
          break;
      }

      // Track metrics for successful execution
      this.metrics.endOperation(operationId, result.success, result.error);
      return result;
    } catch (error: any) {
      // Self-correction: Attempt fallback if available
      debugLog(`Tool ${toolCall.function.name} failed: ${error.message}`);

      // Check if we have a fallback strategy for this tool
      if (this.fallbackStrategies.has(toolCall.function.name)) {
        debugLog(`Attempting self-correction for ${toolCall.function.name}...`);
        this.metrics.incrementRetry(operationId);
        const fallbackResult = await this.attemptFallback(toolCall, error);
        this.metrics.endOperation(operationId, fallbackResult.success, fallbackResult.error, 'fallback_strategy');
        return fallbackResult;
      }

      // No fallback available, return error
      this.metrics.endOperation(operationId, false, error.message);
      return {
        success: false,
        error: `Tool execution error: ${error.message}`,
      };
    }
  }

  private async executeMCPTool(toolCall: GrokToolCall): Promise<ToolResult> {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const mcpManager = getMCPManager();

      const result = await mcpManager.callTool(toolCall.function.name, args);

      if (result.isError) {
        return {
          success: false,
          error: (result.content[0] as any)?.text || "MCP tool error",
        };
      }

      // Extract content from result
      const output = result.content
        .map((item) => {
          if (item.type === "text") {
            return item.text;
          } else if (item.type === "resource") {
            return `Resource: ${item.resource?.uri || "Unknown"}`;
          }
          return String(item);
        })
        .join("\n");

      return {
        success: true,
        output: output || "Success",
      };
    } catch (error: any) {
      return {
        success: false,
        error: `MCP tool execution error: ${error.message}`,
      };
    }
  }

  getChatHistory(): ChatEntry[] {
    return [...this.chatHistory];
  }

  saveSessionLog(): void {
    try {
      const sessionDir = path.join(require('os').homedir(), '.grok');
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      const sessionFile = path.join(sessionDir, 'session.log');
      const logLines = this.chatHistory.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      fs.writeFileSync(sessionFile, logLines);
    } catch (error) {
      // Silently ignore logging errors to not disrupt the app
      debugLog('Failed to save session log:', error);
    }
  }

  getCurrentDirectory(): string {
    return this.bash.getCurrentDirectory();
  }

  async executeBashCommand(command: string): Promise<ToolResult> {
    return await this.bash.execute(command);
  }

  getCurrentModel(): string {
    return this.grokClient.getCurrentModel();
  }

  setModel(model: string): void {
    this.grokClient.setModel(model);
    // Update token counter for new model
    this.tokenCounter.dispose();
    this.tokenCounter = createTokenCounter(model);
  }

  abortCurrentOperation(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private logEntry(entry: ChatEntry): void {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.sessionLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Log as JSON line
      const logLine = JSON.stringify({
        type: entry.type,
        content: entry.content,
        timestamp: entry.timestamp.toISOString(),
        toolCallId: entry.toolCall?.id,
        toolCallsCount: entry.toolCalls?.length,
      }) + '\n';

      fs.appendFileSync(this.sessionLogPath, logLine);
    } catch (error) {
      // Silently ignore logging errors to avoid disrupting the app
      debugLog('Failed to log session entry:', error);
    }
  }

  getSessionLogPath(): string {
    return this.sessionLogPath;
  }

  /**
   * Plan and execute a complex task using the task orchestrator
   */
  async planAndExecute(userRequest: string, context?: { currentDirectory?: string }): Promise<OrchestratorResult> {
    if (this.planExecutionInProgress) {
      throw new Error('A plan is already being executed. Please wait for it to complete.');
    }

    this.planExecutionInProgress = true;

    try {
      // Create tool executor that wraps executeTool
      const toolExecutor = async (toolName: string, args: any): Promise<any> => {
        // Create a mock tool call for executeTool
        const toolCall: GrokToolCall = {
          id: `plan_tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: 'function',
          function: {
            name: toolName,
            arguments: JSON.stringify(args)
          }
        };

        const result = await this.executeTool(toolCall);

        if (!result.success) {
          throw new Error(result.error || 'Tool execution failed');
        }

        return result;
      };

      // Execute plan with confirmation handling
      const result = await this.executePlanWithConfirmation(userRequest, toolExecutor, context);

      return result;
    } finally {
      this.planExecutionInProgress = false;
    }
  }

  /**
   * Execute plan with user confirmation for high-risk operations
   */
  private async executePlanWithConfirmation(
    userRequest: string,
    toolExecutor: (toolName: string, args: any) => Promise<any>,
    context?: { currentDirectory?: string }
  ): Promise<OrchestratorResult> {
    // First, create and validate the plan
    const { plan, validation, analysis } = await this.taskOrchestrator.createPlan(userRequest, context);

    // Check if plan is valid
    if (!validation.isValid) {
      return {
        success: false,
        plan,
        validation,
        analysis,
        error: `Plan validation failed: ${validation.errors.join(', ')}`
      };
    }

    // Check if confirmation is required for high-risk operations
    const requiresConfirmation = plan.overallRiskLevel === 'high' || plan.overallRiskLevel === 'critical';

    if (requiresConfirmation) {
      // Format plan preview for user
      const planPreview = this.taskOrchestrator.formatPlanPreview(plan, validation);

      // Request confirmation
      const confirmationResult = await this.confirmationTool.requestConfirmation({
        operation: 'Execute Task Plan',
        filename: `${plan.steps.length} steps affecting ${plan.metadata.filesAffected.length} files`,
        description: `${plan.description}\n\n${planPreview}`,
        showVSCodeOpen: false,
        autoAccept: false
      });

      if (!confirmationResult.success) {
        return {
          success: false,
          plan,
          validation,
          analysis,
          error: 'User declined to execute the plan'
        };
      }
    }

    // Execute the plan
    return await this.taskOrchestrator.planAndExecute(userRequest, toolExecutor, context);
  }

  /**
   * Get the task orchestrator instance
   */
  getTaskOrchestrator(): TaskOrchestrator {
    return this.taskOrchestrator;
  }

  /**
   * Check if a plan execution is in progress
   */
  isPlanExecutionInProgress(): boolean {
    return this.planExecutionInProgress;
  }

  /**
   * Self-Correction: Attempt fallback strategy when a tool fails
   */
  private async attemptFallback(toolCall: GrokToolCall, originalError: Error): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    const retryKey = `${toolName}_${toolCall.id}`;

    // Check retry count
    const currentRetries = this.toolRetryCount.get(retryKey) || 0;
    if (currentRetries >= this.maxRetries) {
      this.toolRetryCount.delete(retryKey);
      return {
        success: false,
        error: `Tool ${toolName} failed after ${this.maxRetries} retry attempts: ${originalError.message}`
      };
    }

    // Increment retry count
    this.toolRetryCount.set(retryKey, currentRetries + 1);

    // Get fallback strategy
    const strategy = this.fallbackStrategies.get(toolName);
    if (!strategy) {
      return {
        success: false,
        error: `No fallback strategy available for ${toolName}: ${originalError.message}`
      };
    }

    debugLog(`🔄 Self-correction attempt ${currentRetries + 1}/${this.maxRetries} for ${toolName}`);
    debugLog(`   Strategy: ${strategy.description}`);

    try {
      // Execute fallback based on strategy type
      const result = await this.executeFallbackStrategy(toolCall, strategy, originalError);

      // If successful, clear retry count
      if (result.success) {
        this.toolRetryCount.delete(retryKey);
        debugLog(`✅ Self-correction successful for ${toolName}`);
      }

      return result;
    } catch (fallbackError: any) {
      debugLog(`❌ Fallback attempt ${currentRetries + 1} failed: ${fallbackError.message}`);

      // Try next retry with exponential backoff
      if (currentRetries + 1 < this.maxRetries) {
        const backoffMs = Math.pow(2, currentRetries) * 1000; // 1s, 2s, 4s
        debugLog(`   Waiting ${backoffMs}ms before next retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));

        // Retry with same tool call
        return await this.attemptFallback(toolCall, originalError);
      }

      // All retries exhausted
      this.toolRetryCount.delete(retryKey);
      return {
        success: false,
        error: `All fallback attempts failed for ${toolName}: ${fallbackError.message}`
      };
    }
  }

  /**
   * Execute a specific fallback strategy
   */
  private async executeFallbackStrategy(
    originalToolCall: GrokToolCall,
    strategy: FallbackStrategy,
    originalError: Error
  ): Promise<ToolResult> {
    const args = JSON.parse(originalToolCall.function.arguments);

    switch (strategy.strategy) {
      case 'decompose_and_retry':
        return await this.decomposeAndRetry(originalToolCall, strategy, args);

      case 'sequential_execution':
        return await this.sequentialExecution(originalToolCall, strategy, args);

      case 'simpler_tool':
        return await this.useSimplerTool(originalToolCall, strategy, args);

      case 'bash_fallback':
        return await this.bashFallback(originalToolCall, strategy, args, originalError);

      default:
        return {
          success: false,
          error: `Unknown fallback strategy: ${strategy.strategy}`
        };
    }
  }

  /**
   * Decompose complex operation into smaller steps
   */
  private async decomposeAndRetry(
    originalToolCall: GrokToolCall,
    strategy: FallbackStrategy,
    args: any
  ): Promise<ToolResult> {
    const toolName = originalToolCall.function.name;

    if (toolName === 'refactoring_assistant') {
      // Break down refactoring into multi_file_edit operations
      debugLog('   Breaking down refactoring into file edits...');

      const fallbackTool = strategy.fallbackTools[0]; // multi_file_edit
      const fallbackCall: GrokToolCall = {
        id: `fallback_${originalToolCall.id}`,
        type: 'function',
        function: {
          name: fallbackTool,
          arguments: JSON.stringify({
            operation: 'execute_multi_file',
            operations: args.scope?.files?.map((file: string) => ({
              type: 'edit',
              filePath: file,
              description: `Refactor ${file}`
            })) || [],
            description: 'Refactoring via multi-file edit fallback'
          })
        }
      };

      return await this.executeTool(fallbackCall);
    }

    return {
      success: false,
      error: 'Decompose strategy not implemented for this tool'
    };
  }

  /**
   * Execute operations sequentially instead of in batch
   */
  private async sequentialExecution(
    originalToolCall: GrokToolCall,
    strategy: FallbackStrategy,
    args: any
  ): Promise<ToolResult> {
    const toolName = originalToolCall.function.name;

    if (toolName === 'multi_file_edit' && args.operations) {
      debugLog(`   Executing ${args.operations.length} operations sequentially...`);

      const results: any[] = [];
      const fallbackTool = strategy.fallbackTools[0]; // str_replace_editor

      for (const op of args.operations) {
        const fallbackCall: GrokToolCall = {
          id: `fallback_seq_${Date.now()}`,
          type: 'function',
          function: {
            name: fallbackTool,
            arguments: JSON.stringify({
              path: op.filePath,
              old_str: op.old_str || '',
              new_str: op.new_str || op.content || '',
              replace_all: false
            })
          }
        };

        const result = await this.executeTool(fallbackCall);
        results.push(result);

        if (!result.success) {
          return {
            success: false,
            error: `Sequential execution failed at operation ${results.length}: ${result.error}`
          };
        }
      }

      return {
        success: true,
        output: `Successfully executed ${results.length} operations sequentially`
      };
    }

    return {
      success: false,
      error: 'Sequential execution not applicable for this tool'
    };
  }

  /**
   * Use a simpler tool as fallback
   */
  private async useSimplerTool(
    originalToolCall: GrokToolCall,
    strategy: FallbackStrategy,
    args: any
  ): Promise<ToolResult> {
    debugLog(`   Using simpler tool: ${strategy.fallbackTools[0]}...`);

    const fallbackTool = strategy.fallbackTools[0];
    const fallbackCall: GrokToolCall = {
      id: `fallback_simple_${originalToolCall.id}`,
      type: 'function',
      function: {
        name: fallbackTool,
        arguments: JSON.stringify(args)
      }
    };

    return await this.executeTool(fallbackCall);
  }

  /**
   * Fall back to bash commands
   */
  private async bashFallback(
    originalToolCall: GrokToolCall,
    _strategy: FallbackStrategy,
    args: any,
    originalError: Error
  ): Promise<ToolResult> {
    const toolName = originalToolCall.function.name;
    debugLog('   Falling back to bash commands...');

    try {
      if (toolName === 'symbol_search' || toolName === 'advanced_search') {
        // Use grep for search
        const query = args.query || args.pattern || '';
        const command = `grep -r "${query}" . --include="*.ts" --include="*.js" --include="*.py" -n`;
        return await this.bash.execute(command);
      }

      if (toolName === 'dependency_analyzer') {
        // Use grep to find imports
        const command = `grep -r "^import\\|^from\\|require(" . --include="*.ts" --include="*.js" --include="*.py" -n`;
        return await this.bash.execute(command);
      }

      return {
        success: false,
        error: `Bash fallback not implemented for ${toolName}: ${originalError.message}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Bash fallback failed: ${error.message}`
      };
    }
  }

  /**
   * PHASE 1: Plan Detection
   * Determine if a user request warrants automatic task planning
   */
  private shouldCreatePlan(message: string): boolean {
    const lowerMsg = message.toLowerCase();

    // Complexity keywords
    const complexKeywords = [
      'refactor', 'move', 'extract', 'implement', 'restructure',
      'redesign', 'reorganize', 'migrate', 'convert', 'transform'
    ];

    // Check for keywords
    let complexityScore = 0;
    if (complexKeywords.some(kw => lowerMsg.includes(kw))) {
      complexityScore += 2;
    }

    // Check for multiple file mentions
    const fileMatches = message.match(/\b[\w\-./]+\.(ts|tsx|js|jsx|py|java|go|rs|cpp|c|h)\b/g);
    if (fileMatches && fileMatches.length > 1) {
      complexityScore += 2;
    }

    // Check for architecture/design patterns
    const architectureKeywords = ['architecture', 'design', 'pattern', 'dependency', 'module'];
    if (architectureKeywords.some(kw => lowerMsg.includes(kw))) {
      complexityScore += 1;
    }

    // Check for scope indicators
    if (lowerMsg.includes('across') || lowerMsg.includes('throughout')) {
      complexityScore += 1;
    }

    return complexityScore >= 3;
  }

  /**
   * PHASE 2: Confirmation & Execution
   * Generate plan and request user confirmation
   */
  private async generateAndConfirmPlan(
    userRequest: string
  ): Promise<{ approved: boolean; plan?: TaskPlan }> {
    try {
      const { plan, validation } = await this.taskOrchestrator.createPlan(
        userRequest,
        { currentDirectory: this.getCurrentDirectory() }
      );

      const preview = this.taskOrchestrator.formatPlanPreview(plan, validation);

      const confirmResult = await this.confirmationTool.requestConfirmation({
        operation: 'Execute Task Plan',
        filename: `${plan.steps.length} steps affecting ${plan.metadata.filesAffected.length} files`,
        description: `${plan.description}\n\n${preview}`,
        showVSCodeOpen: false,
        autoAccept: false
      });

      return {
        approved: confirmResult.success,
        plan: confirmResult.success ? plan : undefined
      };
    } catch (error: any) {
      debugLog('Plan generation error:', error);
      return { approved: false };
    }
  }

  /**
   * PHASE 2: Sequential Plan Execution
   * Execute plan steps sequentially with dependency handling
   */
  private async executePlanSteps(plan: TaskPlan): Promise<any[]> {
    const results: any[] = [];

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Check dependencies
      if (step.dependencies.length > 0) {
        const depsCompleted = step.dependencies.every(depId =>
          plan.steps.find(s => s.id === depId)?.status === 'completed'
        );
        if (!depsCompleted) {
          step.status = 'skipped';
          continue;
        }
      }

      step.status = 'running';
      step.startTime = Date.now();

      try {
        // Create tool call from step
        const toolCall: GrokToolCall = {
          id: step.id,
          type: 'function',
          function: {
            name: step.tool,
            arguments: JSON.stringify(step.args)
          }
        };

        const result = await this.executeTool(toolCall);

        if (result.success) {
          step.status = 'completed';
          step.result = result;
          results.push({ stepId: step.id, success: true, result });
        } else {
          throw new Error(result.error || 'Tool execution failed');
        }
      } catch (error: any) {
        step.status = 'failed';
        step.error = error.message;
        results.push({ stepId: step.id, success: false, error: error.message });

        if (this.taskOrchestrator['config'].autoRollbackOnFailure) {
          debugLog('Auto-rollback triggered');
          break;
        }
      }

      step.endTime = Date.now();
    }

    return results;
  }

  /**
   * PHASE 3: LLM Re-engagement
   * Handle self-correction attempts by re-engaging the LLM
   */
  private handleSelfCorrectAttempt(
    toolResult: ToolResult,
    toolCall: GrokToolCall,
    userRequest: string
  ): { shouldRetry: boolean; fallbackRequest?: string } {
    const correctionKey = this.hashRequest(userRequest);
    const attempts = this.correctionAttempts.get(correctionKey) || [];

    if (attempts.length >= this.maxCorrectionAttempts) {
      return { shouldRetry: false };
    }

    // Extract fallback request from error message
    const fallbackMatch = toolResult.error?.match(/SELF_CORRECT_ATTEMPT: (.+?)(?:\n|$)/s);
    const fallbackRequest = fallbackMatch ? fallbackMatch[1] : toolResult.error;

    // Track attempt
    attempts.push({
      tool: toolCall.function.name,
      error: toolResult.error || 'Unknown error',
      timestamp: Date.now(),
      fallbackStrategy: 'decompose_and_retry'
    });
    this.correctionAttempts.set(correctionKey, attempts);

    debugLog(`🔄 Self-correction attempt ${attempts.length}/${this.maxCorrectionAttempts}`);

    return {
      shouldRetry: true,
      fallbackRequest: fallbackRequest || undefined
    };
  }

  /**
   * Hash a request for tracking correction attempts
   */
  private hashRequest(request: string): string {
    return createHash('md5').update(request).digest('hex');
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    return this.metrics.getAggregatedMetrics();
  }

  /**
   * Print metrics summary to console
   */
  printMetricsSummary() {
    this.metrics.printSummary();
  }

  /**
   * Enable verbose metrics logging
   */
  setVerboseMetrics(verbose: boolean) {
    this.metrics.setVerbose(verbose);
  }
}
