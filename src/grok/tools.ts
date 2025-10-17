import { GrokTool } from "./client.js";
import { MCPManager, MCPTool } from "../mcp/client.js";
import { loadMCPConfig } from "../mcp/config.js";

const BASE_GROK_TOOLS: GrokTool[] = [
  {
    type: "function",
    function: {
      name: "view_file",
      description: "View contents of a file or list directory contents",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to file or directory to view",
          },
          start_line: {
            type: "number",
            description:
              "Starting line number for partial file view (optional)",
          },
          end_line: {
            type: "number",
            description: "Ending line number for partial file view (optional)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_file",
      description: "Create a new file with specified content",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path where the file should be created",
          },
          content: {
            type: "string",
            description: "Content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "str_replace_editor",
      description: "Replace specific text in a file. Use this for single line edits only",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to edit",
          },
          old_str: {
            type: "string",
            description:
              "Text to replace (must match exactly, or will use fuzzy matching for multi-line strings)",
          },
          new_str: {
            type: "string",
            description: "Text to replace with",
          },
          replace_all: {
            type: "boolean",
            description:
              "Replace all occurrences (default: false, only replaces first occurrence)",
          },
        },
        required: ["path", "old_str", "new_str"],
      },
    },
  },

  {
    type: "function",
    function: {
      name: "bash",
      description: "Execute a bash command",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search for text in files or find files by name",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Text to search for or file name pattern",
          },
          search_type: {
            type: "string",
            enum: ["text", "files", "both"],
            description: "Type: 'text', 'files', or 'both' (default: 'both')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_todo_list",
      description: "Create a todo list for task planning",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            description: "Array of todo items with id, content, status, priority",
          },
        },
        required: ["todos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_todo_list",
      description: "Update existing todos",
      parameters: {
        type: "object",
        properties: {
          updates: {
            type: "array",
            description: "Array of updates with id and new values",
          },
        },
        required: ["updates"],
      },
    },
  },
  // Intelligence tools
  {
    type: "function",
    function: {
      name: "ast_parser",
      description: "Parse source code files to extract AST, symbols, imports, exports, and structural information",
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path to the source code file to parse"
          },
          includeSymbols: {
            type: "boolean",
            description: "Whether to extract symbols (functions, classes, variables, etc.)",
            default: true
          },
          includeImports: {
            type: "boolean",
            description: "Whether to extract import/export information",
            default: true
          },
          includeTree: {
            type: "boolean",
            description: "Whether to include the full AST tree in response",
            default: false
          },
          symbolTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["function", "class", "variable", "interface", "enum", "type", "method", "property"]
            },
            description: "Types of symbols to extract",
            default: ["function", "class", "variable", "interface", "enum", "type"]
          },
          scope: {
            type: "string",
            enum: ["all", "global", "local"],
            description: "Scope of symbols to extract",
            default: "all"
          }
        },
        required: ["filePath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "symbol_search",
      description: "Search for symbols (functions, classes, variables) across the codebase with fuzzy matching and cross-references",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for symbol names"
          },
          searchPath: {
            type: "string",
            description: "Root path to search in",
            default: "current working directory"
          },
          symbolTypes: {
            type: "array",
            items: {
              type: "string",
              enum: ["function", "class", "variable", "interface", "enum", "type", "method", "property"]
            },
            description: "Types of symbols to search for",
            default: ["function", "class", "variable", "interface", "enum", "type"]
          },
          includeUsages: {
            type: "boolean",
            description: "Whether to find usages of matched symbols",
            default: false
          },
          fuzzyMatch: {
            type: "boolean",
            description: "Use fuzzy matching for symbol names",
            default: true
          },
          caseSensitive: {
            type: "boolean",
            description: "Case sensitive search",
            default: false
          },
          maxResults: {
            type: "integer",
            description: "Maximum number of results to return",
            default: 50,
            minimum: 1,
            maximum: 1000
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "dependency_analyzer",
      description: "Analyze import/export dependencies, detect circular dependencies, and generate dependency graphs",
      parameters: {
        type: "object",
        properties: {
          rootPath: {
            type: "string",
            description: "Root path to analyze dependencies from",
            default: "current working directory"
          },
          filePatterns: {
            type: "array",
            items: { type: "string" },
            description: "Glob patterns for files to include",
            default: ["**/*.{ts,tsx,js,jsx}"]
          },
          excludePatterns: {
            type: "array",
            items: { type: "string" },
            description: "Glob patterns for files to exclude",
            default: ["**/node_modules/**", "**/dist/**", "**/.git/**"]
          },
          includeExternals: {
            type: "boolean",
            description: "Include external module dependencies",
            default: false
          },
          detectCircular: {
            type: "boolean",
            description: "Detect circular dependencies",
            default: true
          },
          findUnreachable: {
            type: "boolean",
            description: "Find unreachable files from entry points",
            default: true
          },
          generateGraph: {
            type: "boolean",
            description: "Generate serialized dependency graph",
            default: false
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "code_context",
      description: "Build intelligent code context, analyze relationships, navigate to definitions, and find symbol usages. Supports three operations: analyze_context (default), go_to_definition, and find_usages",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["analyze_context", "go_to_definition", "find_usages"],
            description: "Operation to perform: analyze_context (default), go_to_definition (jump to symbol definition), or find_usages (find all symbol usages)"
          },
          filePath: {
            type: "string",
            description: "Path to the file to analyze for context (required for analyze_context operation)"
          },
          symbolName: {
            type: "string",
            description: "Name of the symbol to find (required for go_to_definition and find_usages operations)"
          },
          rootPath: {
            type: "string",
            description: "Root path of the project for relative path resolution"
          },
          includeDefinition: {
            type: "boolean",
            description: "Include definition in find_usages results",
            default: true
          },
          includeRelationships: {
            type: "boolean",
            description: "Include code relationships analysis (for analyze_context)",
            default: true
          },
          includeMetrics: {
            type: "boolean",
            description: "Include code quality metrics (for analyze_context)",
            default: true
          },
          includeSemantics: {
            type: "boolean",
            description: "Include semantic analysis and patterns (for analyze_context)",
            default: true
          },
          maxRelatedFiles: {
            type: "integer",
            description: "Maximum number of related files to analyze (for analyze_context)",
            default: 10,
            minimum: 1,
            maximum: 50
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "refactoring_assistant",
      description: "Perform safe code refactoring operations including rename, extract, inline, and move operations",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["rename", "extract_function", "extract_variable", "inline_function", "inline_variable", "move_function", "move_class"],
            description: "Type of refactoring operation to perform"
          },
          symbolName: {
            type: "string",
            description: "Name of symbol to refactor (for rename, inline, move operations)"
          },
          newName: {
            type: "string",
            description: "New name for symbol (for rename operation)"
          },
          filePath: {
            type: "string",
            description: "Path to file containing the symbol"
          },
          scope: {
            type: "string",
            enum: ["file", "project", "global"],
            description: "Scope of refactoring operation",
            default: "project"
          },
          includeComments: {
            type: "boolean",
            description: "Include comments in rename operation",
            default: false
          },
          includeStrings: {
            type: "boolean",
            description: "Include string literals in rename operation",
            default: false
          },
          startLine: {
            type: "integer",
            description: "Start line for extract operations"
          },
          endLine: {
            type: "integer",
            description: "End line for extract operations"
          },
          functionName: {
            type: "string",
            description: "Name for extracted function"
          },
          variableName: {
            type: "string",
            description: "Name for extracted variable"
          }
        },
        required: ["operation"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "task_planner",
      description: "Intelligent multi-step task planning and execution. Automatically breaks down complex tasks into steps, analyzes dependencies, assesses risks, and creates executable plans. Use this for complex refactoring, multi-file operations, or any task requiring multiple coordinated steps.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["create_plan", "preview_plan", "validate_plan"],
            description: "Operation to perform: create_plan (generate and return plan), preview_plan (show formatted preview), validate_plan (check plan validity)"
          },
          userRequest: {
            type: "string",
            description: "Natural language description of the task to plan (e.g., 'Refactor authentication module to use dependency injection', 'Move all utility functions to a shared folder')"
          },
          currentDirectory: {
            type: "string",
            description: "Current working directory for context (optional)"
          },
          allowRisky: {
            type: "boolean",
            description: "Allow high-risk operations (default: false)"
          },
          autoRollback: {
            type: "boolean",
            description: "Automatically rollback on failure (default: true)"
          },
          autoExecute: {
            type: "boolean",
            description: "Automatically execute the plan after creation (only for create_plan operation). User will be prompted for confirmation if the plan is high-risk. (default: false)"
          }
        },
        required: ["operation", "userRequest"]
      }
    }
  }
];

// Morph Fast Apply tool (conditional)
const MORPH_EDIT_TOOL: GrokTool = {
  type: "function",
  function: {
    name: "edit_file",
    description: "Use this tool to make an edit to an existing file.\n\nThis will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.\nWhen writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.\n\nFor example:\n\n// ... existing code ...\nFIRST_EDIT\n// ... existing code ...\nSECOND_EDIT\n// ... existing code ...\nTHIRD_EDIT\n// ... existing code ...\n\nYou should still bias towards repeating as few lines of the original file as possible to convey the change.\nBut, each edit should contain sufficient context of unchanged lines around the code you're editing to resolve ambiguity.\nDO NOT omit spans of pre-existing code (or comments) without using the // ... existing code ... comment to indicate its absence. If you omit the existing code comment, the model may inadvertently delete these lines.\nIf you plan on deleting a section, you must provide context before and after to delete it. If the initial code is ```code \\n Block 1 \\n Block 2 \\n Block 3 \\n code```, and you want to remove Block 2, you would output ```// ... existing code ... \\n Block 1 \\n  Block 3 \\n // ... existing code ...```.\nMake sure it is clear what the edit should be, and where it should be applied.\nMake edits to a file in a single edit_file call instead of multiple edit_file calls to the same file. The apply model can handle many distinct edits at once.",
    parameters: {
      type: "object",
      properties: {
        target_file: {
          type: "string",
          description: "The target file to modify."
        },
        instructions: {
          type: "string",
          description: "A single sentence instruction describing what you are going to do for the sketched edit. This is used to assist the less intelligent model in applying the edit. Use the first person to describe what you are going to do. Use it to disambiguate uncertainty in the edit."
        },
        code_edit: {
          type: "string",
          description: "Specify ONLY the precise lines of code that you wish to edit. NEVER specify or write out unchanged code. Instead, represent all unchanged code using the comment of the language you're editing in - example: // ... existing code ..."
        }
      },
      required: ["target_file", "instructions", "code_edit"]
    }
  }
};

// Function to build tools array conditionally
function buildGrokTools(): GrokTool[] {
  // Start with core tools only (first 10 tools)
  const coreTools = BASE_GROK_TOOLS.slice(0, 10);

  // Add Morph Fast Apply tool if API key is available
  if (process.env.MORPH_API_KEY) {
    coreTools.splice(3, 0, MORPH_EDIT_TOOL); // Insert after str_replace_editor
  }

  // Add advanced tools only if explicitly enabled
  // This prevents "Grammar is too complex" errors from Grok API
  const enableAdvancedTools = process.env.GROK_ENABLE_ADVANCED_TOOLS === '1';

  if (enableAdvancedTools) {
    // Add all advanced tools (intelligence, multi-file, etc.)
    const advancedTools = BASE_GROK_TOOLS.slice(10);
    return [...coreTools, ...advancedTools];
  }

  return coreTools;
}

// Export dynamic tools array
export const GROK_TOOLS: GrokTool[] = buildGrokTools();

// Global MCP manager instance
let mcpManager: MCPManager | null = null;

export function getMCPManager(): MCPManager {
  if (!mcpManager) {
    mcpManager = new MCPManager();
  }
  return mcpManager;
}

export async function initializeMCPServers(): Promise<void> {
  const manager = getMCPManager();
  const config = loadMCPConfig();

  // Store original stderr.write
  const originalStderrWrite = process.stderr.write;

  // Temporarily suppress stderr to hide verbose MCP connection logs
  process.stderr.write = function (chunk: any, encoding?: any, callback?: any): boolean {
    // Filter out mcp-remote verbose logs
    const chunkStr = chunk.toString();
    if (chunkStr.includes('[') && (
      chunkStr.includes('Using existing client port') ||
      chunkStr.includes('Connecting to remote server') ||
      chunkStr.includes('Using transport strategy') ||
      chunkStr.includes('Connected to remote server') ||
      chunkStr.includes('Local STDIO server running') ||
      chunkStr.includes('Proxy established successfully') ||
      chunkStr.includes('Local→Remote') ||
      chunkStr.includes('Remote→Local')
    )) {
      // Suppress these verbose logs
      if (callback) callback();
      return true;
    }

    // Allow other stderr output
    return originalStderrWrite.call(this, chunk, encoding, callback);
  };

  try {
    for (const serverConfig of config.servers) {
      try {
        await manager.addServer(serverConfig);
      } catch (error) {
        console.warn(`Failed to initialize MCP server ${serverConfig.name}:`, error);
      }
    }
  } finally {
    // Restore original stderr.write
    process.stderr.write = originalStderrWrite;
  }
}

export function convertMCPToolToGrokTool(mcpTool: MCPTool): GrokTool {
  return {
    type: "function",
    function: {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema || {
        type: "object",
        properties: {},
        required: []
      }
    }
  };
}

export function addMCPToolsToGrokTools(baseTools: GrokTool[]): GrokTool[] {
  if (!mcpManager) {
    return baseTools;
  }

  const mcpTools = mcpManager.getTools();
  const grokMCPTools = mcpTools.map(convertMCPToolToGrokTool);

  return [...baseTools, ...grokMCPTools];
}

export async function getAllGrokTools(): Promise<GrokTool[]> {
  const manager = getMCPManager();
  // Try to initialize servers if not already done, but don't block
  manager.ensureServersInitialized().catch(() => {
    // Ignore initialization errors to avoid blocking
  });
  return addMCPToolsToGrokTools(GROK_TOOLS);
}
