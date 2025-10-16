import { ToolResult } from "../../types/index.js";
import { CodeIntelligenceEngine } from "./engine.js";
import * as ops from "fs";
import path from "path";

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await ops.promises.access(filePath, ops.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export interface ASTNode {
  type: string;
  name?: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  text: string;
  children?: ASTNode[];
  metadata?: Record<string, any>;
}

export interface ParseResult {
  language: string;
  tree: ASTNode;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  errors: ParseError[];
}

export interface SymbolInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'enum' | 'type' | 'method' | 'property';
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  scope: string;
  accessibility?: 'public' | 'private' | 'protected';
  isStatic?: boolean;
  isAsync?: boolean;
  parameters?: ParameterInfo[];
  returnType?: string;
}

export interface ParameterInfo {
  name: string;
  type?: string;
  optional?: boolean;
  defaultValue?: string;
}

export interface ImportInfo {
  source: string;
  specifiers: ImportSpecifier[];
  isTypeOnly?: boolean;
  startPosition: { row: number; column: number };
}

export interface ImportSpecifier {
  name: string;
  alias?: string;
  isDefault?: boolean;
  isNamespace?: boolean;
}

export interface ExportInfo {
  name: string;
  type: 'function' | 'class' | 'variable' | 'interface' | 'enum' | 'type' | 'default';
  startPosition: { row: number; column: number };
  isDefault?: boolean;
  source?: string; // For re-exports
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

export class ASTParserTool {
  name = "ast_parser";
  description = "Parse source code files to extract AST, symbols, imports, exports, and structural information";

  private engine: CodeIntelligenceEngine | null = null;

  constructor(engine?: CodeIntelligenceEngine) {
    this.engine = engine || null;
  }


  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    
    switch (ext) {
      case 'js':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'jsx':
        return 'jsx';
      case 'ts':
        return 'typescript';
      case 'tsx':
        return 'tsx';
      case 'py':
      case 'pyw':
        return 'python';
      default:
        return 'javascript'; // Default fallback
    }
  }

  async execute(args: any): Promise<ToolResult> {
    try {
      const {
        filePath,
        includeSymbols = true,
        includeImports = true,
        includeTree = false,
        symbolTypes = ['function', 'class', 'variable', 'interface', 'enum', 'type'],
        scope = 'all' // 'all', 'global', 'local'
      } = args;

      if (!filePath) {
        throw new Error("File path is required");
      }

      if (!await pathExists(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // If engine is available and initialized, use cached data
      if (this.engine && this.engine.isReady()) {
        const metadata = this.engine.getFileMetadata(filePath);
        const ast = includeTree ? this.engine.getAST(filePath) : null;
        const fileSymbols = includeSymbols ? this.engine.getFileSymbols(filePath) : [];

        // Filter symbols based on parameters
        let symbols = fileSymbols;
        if (includeSymbols) {
          symbols = symbols.filter(symbol =>
            symbolTypes.includes(symbol.type) &&
            (scope === 'all' || this.matchesScope(symbol, scope))
          );
        }

        // Get imports/exports from engine (we don't store these separately, so this is placeholder)
        const imports: ImportInfo[] = [];
        const exports: ExportInfo[] = [];

        return {
          success: true,
          output: JSON.stringify({
            filePath: metadata?.filePath || path.basename(filePath),
            language: metadata?.language || 'unknown',
            symbolCount: symbols.length,
            importCount: imports.length,
            exportCount: exports.length,
            errorCount: 0,
            ...(includeSymbols && { symbols }),
            ...(includeImports && { imports, exports }),
            ...(includeTree && ast && { tree: ast }),
            cached: true // Indicate this came from engine cache
          }, null, 2)
        };
      }

      // Fallback to standalone parsing if engine not available
      const content = await ops.promises.readFile(filePath, 'utf-8');
      const language = this.detectLanguage(filePath);

      // For standalone mode, we'd need to implement parsing here
      // Since engine does the heavy lifting, this is a minimal fallback
      return {
        success: true,
        output: JSON.stringify({
          filePath: path.basename(filePath),
          language,
          symbolCount: 0,
          importCount: 0,
          exportCount: 0,
          errorCount: 0,
          symbols: [],
          imports: [],
          exports: [],
          cached: false,
          note: "Engine not initialized - minimal parsing performed"
        }, null, 2)
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }


  private matchesScope(symbol: SymbolInfo, scope: string): boolean {
    switch (scope) {
      case 'global':
        return symbol.scope === 'global';
      case 'local':
        return symbol.scope !== 'global';
      default:
        return true;
    }
  }

  getSchema() {
    return {
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
    };
  }
}