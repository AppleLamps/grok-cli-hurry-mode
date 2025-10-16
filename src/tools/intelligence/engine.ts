import { parse as parseTS } from "@typescript-eslint/typescript-estree";
import chokidar, { FSWatcher } from "chokidar";
import * as ops from "fs";
import path from "path";
import { glob } from "glob";
import { SymbolInfo, ImportInfo, ExportInfo, ParseError } from "./types.js";

// Conditional tree-sitter imports
let Parser: any;
let JavaScript: any;
let TypeScript: any;
let Python: any;

try {
  Parser = require("tree-sitter");
  JavaScript = require("tree-sitter-javascript");
  TypeScript = require("tree-sitter-typescript");
  Python = require("tree-sitter-python");
} catch {
  console.warn("Tree-sitter modules not available, using TypeScript-only parsing");
}

// ==================== Core Data Structures ====================

export interface FileMetadata {
  filePath: string;
  absolutePath: string;
  language: string;
  lastModified: number;
  hash: string;
  parseTime: number;
  indexed: boolean;
}

export interface SymbolReference {
  symbol: SymbolInfo;
  filePath: string;
  usages: SymbolUsage[];
}

export interface SymbolUsage {
  line: number;
  column: number;
  context: string;
  type: 'definition' | 'call' | 'reference' | 'import' | 'export';
}

export interface CrossReference {
  symbolName: string;
  definitionFile: string;
  definitionLocation: { line: number; column: number };
  references: Array<{
    file: string;
    line: number;
    column: number;
    type: SymbolUsage['type'];
  }>;
}

export interface ImpactAnalysis {
  affectedFiles: Set<string>;
  affectedSymbols: Set<string>;
  circularDependencies: string[][];
  riskLevel: 'low' | 'medium' | 'high';
  warnings: string[];
}

export interface EngineStatistics {
  totalFiles: number;
  indexedFiles: number;
  totalSymbols: number;
  totalDependencies: number;
  memoryUsage: number;
  lastUpdateTime: number;
  averageParseTime: number;
}

// ==================== Code Intelligence Engine ====================

export class CodeIntelligenceEngine {
  // Core data structures
  private fileAsts: Map<string, any> = new Map(); // filePath -> AST
  private fileMetadata: Map<string, FileMetadata> = new Map(); // filePath -> metadata
  private symbolIndex: Map<string, SymbolReference[]> = new Map(); // symbolName -> references
  private dependencyGraph: Map<string, Set<string>> = new Map(); // filePath -> dependencies
  private reverseDependencies: Map<string, Set<string>> = new Map(); // filePath -> dependents
  private crossReferences: Map<string, CrossReference> = new Map(); // symbolName -> cross-refs
  private parseErrors: Map<string, ParseError[]> = new Map(); // filePath -> errors

  // Parser instances
  private parsers: Map<string, any> = new Map();

  // File watcher
  private watcher: FSWatcher | null = null;
  private isInitialized: boolean = false;
  private isIndexing: boolean = false;

  // Configuration
  private rootPath: string;
  private filePatterns: string[] = ['**/*.{ts,tsx,js,jsx,py}'];
  private excludePatterns: string[] = ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.grok/**'];

  // Performance tracking
  private statistics: EngineStatistics = {
    totalFiles: 0,
    indexedFiles: 0,
    totalSymbols: 0,
    totalDependencies: 0,
    memoryUsage: 0,
    lastUpdateTime: 0,
    averageParseTime: 0
  };

  // Debouncing for file changes
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private updateDebounceMs: number = 300;

  constructor(rootPath: string, options?: {
    filePatterns?: string[];
    excludePatterns?: string[];
    updateDebounceMs?: number;
  }) {
    this.rootPath = path.resolve(rootPath);

    if (options?.filePatterns) {
      this.filePatterns = options.filePatterns;
    }
    if (options?.excludePatterns) {
      this.excludePatterns = options.excludePatterns;
    }
    if (options?.updateDebounceMs !== undefined) {
      this.updateDebounceMs = options.updateDebounceMs;
    }

    this.initializeParsers();
  }

  // ==================== Initialization ====================

  private initializeParsers(): void {
    if (!Parser || !JavaScript || !TypeScript || !Python) {
      console.log("Tree-sitter parsers not available, using TypeScript-only parsing");
      return;
    }

    try {
      // JavaScript/JSX parser
      const jsParser = new Parser();
      jsParser.setLanguage(JavaScript as any);
      this.parsers.set('javascript', jsParser);
      this.parsers.set('js', jsParser);
      this.parsers.set('jsx', jsParser);

      // TypeScript/TSX parser
      const tsParser = new Parser();
      tsParser.setLanguage((TypeScript as any).typescript);
      this.parsers.set('typescript', tsParser);
      this.parsers.set('ts', tsParser);

      const tsxParser = new Parser();
      tsxParser.setLanguage((TypeScript as any).tsx);
      this.parsers.set('tsx', tsxParser);

      // Python parser
      const pyParser = new Parser();
      pyParser.setLanguage(Python as any);
      this.parsers.set('python', pyParser);
      this.parsers.set('py', pyParser);
    } catch (error) {
      console.warn('Failed to initialize some parsers:', error);
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('CodeIntelligenceEngine already initialized');
      return;
    }

    console.log(`🧠 Initializing Code Intelligence Engine for: ${this.rootPath}`);
    const startTime = Date.now();

    try {
      // 1. Scan all source files
      const sourceFiles = await this.scanSourceFiles();
      console.log(`   Found ${sourceFiles.length} source files`);

      // 2. Index all files
      this.isIndexing = true;
      await this.indexFiles(sourceFiles);
      this.isIndexing = false;

      // 3. Build cross-references
      this.buildCrossReferences();

      // 4. Start file watcher
      this.startFileWatcher();

      // 5. Update statistics
      this.updateStatistics();

      this.isInitialized = true;
      const duration = Date.now() - startTime;
      console.log(`✅ Engine initialized in ${duration}ms`);
      console.log(`   Indexed ${this.statistics.indexedFiles} files, ${this.statistics.totalSymbols} symbols`);
    } catch (error) {
      console.error('Failed to initialize Code Intelligence Engine:', error);
      throw error;
    }
  }

  private async scanSourceFiles(): Promise<string[]> {
    const allFiles: string[] = [];

    for (const pattern of this.filePatterns) {
      const files = await glob(pattern, {
        cwd: this.rootPath,
        absolute: true,
        ignore: this.excludePatterns,
        nodir: true
      });
      allFiles.push(...files);
    }

    return [...new Set(allFiles)]; // Remove duplicates
  }

  private async indexFiles(files: string[]): Promise<void> {
    const total = files.length;
    let indexed = 0;
    const batchSize = 10;

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(file => this.indexFile(file)));
      indexed += batch.length;

      if (indexed % 50 === 0 || indexed === total) {
        console.log(`   Indexing progress: ${indexed}/${total}`);
      }
    }
  }

  private async indexFile(filePath: string): Promise<void> {
    try {
      const parseStart = Date.now();

      // Get file stats
      const stats = await ops.promises.stat(filePath);
      const content = await ops.promises.readFile(filePath, 'utf-8');
      const hash = this.computeHash(content);
      const language = this.detectLanguage(filePath);

      // Check if file needs reindexing
      const existing = this.fileMetadata.get(filePath);
      if (existing && existing.hash === hash) {
        return; // No changes, skip reindexing
      }

      // Parse file
      const parseResult = await this.parseFile(filePath, content, language);
      const parseTime = Date.now() - parseStart;

      // Store AST
      if (parseResult.tree) {
        this.fileAsts.set(filePath, parseResult.tree);
      }

      // Store metadata
      this.fileMetadata.set(filePath, {
        filePath: path.relative(this.rootPath, filePath),
        absolutePath: filePath,
        language,
        lastModified: stats.mtimeMs,
        hash,
        parseTime,
        indexed: true
      });

      // Index symbols
      this.indexSymbols(filePath, parseResult.symbols);

      // Index dependencies
      this.indexDependencies(filePath, parseResult.imports);

      // Store errors
      if (parseResult.errors.length > 0) {
        this.parseErrors.set(filePath, parseResult.errors);
      } else {
        this.parseErrors.delete(filePath);
      }

    } catch (error) {
      console.warn(`Failed to index ${filePath}:`, error);
      this.parseErrors.set(filePath, [{
        message: error instanceof Error ? error.message : String(error),
        line: 0,
        column: 0,
        severity: 'error'
      }]);
    }
  }

  private async parseFile(filePath: string, content: string, language: string): Promise<{
    tree: any;
    symbols: SymbolInfo[];
    imports: ImportInfo[];
    exports: ExportInfo[];
    errors: ParseError[];
  }> {
    const errors: ParseError[] = [];

    try {
      // Use TypeScript ESTree for TS/JS files
      if (language === 'typescript' || language === 'tsx' || language === 'javascript' || language === 'jsx') {
        return await this.parseWithTypeScript(content, language);
      }

      // Use tree-sitter for other languages
      return await this.parseWithTreeSitter(content, language, filePath);
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        line: 0,
        column: 0,
        severity: 'error'
      });

      return {
        tree: null,
        symbols: [],
        imports: [],
        exports: [],
        errors
      };
    }
  }

  private async parseWithTypeScript(content: string, language: string): Promise<any> {
    try {
      const ast = parseTS(content, {
        jsx: language === 'tsx' || language === 'jsx',
        loc: true,
        range: true,
        comment: true,
        attachComments: true,
        errorOnUnknownASTType: false,
        errorOnTypeScriptSyntacticAndSemanticIssues: false
      });

      const symbols = this.extractTypeScriptSymbols(ast, content);
      const imports = this.extractTypeScriptImports(ast);
      const exports = this.extractTypeScriptExports(ast);

      return {
        tree: ast,
        symbols,
        imports,
        exports,
        errors: []
      };
    } catch (error) {
      return {
        tree: null,
        symbols: [],
        imports: [],
        exports: [],
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          line: 0,
          column: 0,
          severity: 'error'
        }]
      };
    }
  }

  private async parseWithTreeSitter(content: string, language: string, _filePath: string): Promise<any> {
    try {
      const parser = this.parsers.get(language);
      if (!parser) {
        throw new Error(`No parser available for language: ${language}`);
      }

      const tree = parser.parse(content);
      const symbols = this.extractTreeSitterSymbols(tree.rootNode, content, language);
      const imports = this.extractTreeSitterImports(tree.rootNode, content, language);
      const exports = this.extractTreeSitterExports(tree.rootNode, content, language);

      return {
        tree: tree.rootNode,
        symbols,
        imports,
        exports,
        errors: []
      };
    } catch (error) {
      return {
        tree: null,
        symbols: [],
        imports: [],
        exports: [],
        errors: [{
          message: error instanceof Error ? error.message : String(error),
          line: 0,
          column: 0,
          severity: 'error'
        }]
      };
    }
  }

  // ==================== Symbol Extraction (TypeScript) ====================

  private extractTypeScriptSymbols(ast: any, _content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    const visit = (node: any, scope = 'global') => {
      if (!node) return;

      const getPosition = (pos: any) => ({
        row: pos.line - 1,
        column: pos.column
      });

      switch (node.type) {
        case 'FunctionDeclaration':
          if (node.id?.name) {
            symbols.push({
              name: node.id.name,
              type: 'function',
              startPosition: getPosition(node.loc.start),
              endPosition: getPosition(node.loc.end),
              scope,
              isAsync: node.async,
              parameters: node.params?.map((param: any) => ({
                name: param.name || (param.left?.name) || 'unknown',
                type: param.typeAnnotation?.typeAnnotation?.type,
                optional: param.optional
              })) || []
            });
          }
          break;

        case 'ClassDeclaration':
          if (node.id?.name) {
            symbols.push({
              name: node.id.name,
              type: 'class',
              startPosition: getPosition(node.loc.start),
              endPosition: getPosition(node.loc.end),
              scope
            });
          }
          // Visit class methods
          node.body?.body?.forEach((member: any) => {
            if (member.type === 'MethodDefinition' && member.key?.name) {
              symbols.push({
                name: member.key.name,
                type: 'method',
                startPosition: getPosition(member.loc.start),
                endPosition: getPosition(member.loc.end),
                scope: `${node.id?.name || 'unknown'}.${member.key.name}`,
                accessibility: member.accessibility,
                isStatic: member.static,
                isAsync: member.value?.async
              });
            }
          });
          break;

        case 'VariableDeclaration':
          node.declarations?.forEach((decl: any) => {
            if (decl.id?.name) {
              symbols.push({
                name: decl.id.name,
                type: 'variable',
                startPosition: getPosition(decl.loc.start),
                endPosition: getPosition(decl.loc.end),
                scope
              });
            }
          });
          break;

        case 'TSInterfaceDeclaration':
          if (node.id?.name) {
            symbols.push({
              name: node.id.name,
              type: 'interface',
              startPosition: getPosition(node.loc.start),
              endPosition: getPosition(node.loc.end),
              scope
            });
          }
          break;

        case 'TSEnumDeclaration':
          if (node.id?.name) {
            symbols.push({
              name: node.id.name,
              type: 'enum',
              startPosition: getPosition(node.loc.start),
              endPosition: getPosition(node.loc.end),
              scope
            });
          }
          break;

        case 'TSTypeAliasDeclaration':
          if (node.id?.name) {
            symbols.push({
              name: node.id.name,
              type: 'type',
              startPosition: getPosition(node.loc.start),
              endPosition: getPosition(node.loc.end),
              scope
            });
          }
          break;
      }

      // Recursively visit children
      for (const key in node) {
        if (key !== 'parent' && key !== 'loc' && key !== 'range') {
          const child = node[key];
          if (Array.isArray(child)) {
            child.forEach(grandchild => {
              if (grandchild && typeof grandchild === 'object') {
                visit(grandchild, scope);
              }
            });
          } else if (child && typeof child === 'object') {
            visit(child, scope);
          }
        }
      }
    };

    visit(ast);
    return symbols;
  }

  private extractTypeScriptImports(ast: any): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visit = (node: any) => {
      if (node.type === 'ImportDeclaration') {
        const specifiers: any[] = [];

        node.specifiers?.forEach((spec: any) => {
          switch (spec.type) {
            case 'ImportDefaultSpecifier':
              specifiers.push({
                name: spec.local.name,
                isDefault: true
              });
              break;
            case 'ImportNamespaceSpecifier':
              specifiers.push({
                name: spec.local.name,
                isNamespace: true
              });
              break;
            case 'ImportSpecifier':
              specifiers.push({
                name: spec.imported.name,
                alias: spec.local.name !== spec.imported.name ? spec.local.name : undefined
              });
              break;
          }
        });

        imports.push({
          source: node.source.value,
          specifiers,
          isTypeOnly: node.importKind === 'type',
          startPosition: {
            row: node.loc.start.line - 1,
            column: node.loc.start.column
          }
        });
      }

      // Recursively visit children
      for (const key in node) {
        if (key !== 'parent' && key !== 'loc' && key !== 'range') {
          const child = node[key];
          if (Array.isArray(child)) {
            child.forEach(grandchild => {
              if (grandchild && typeof grandchild === 'object') {
                visit(grandchild);
              }
            });
          } else if (child && typeof child === 'object') {
            visit(child);
          }
        }
      }
    };

    visit(ast);
    return imports;
  }

  private extractTypeScriptExports(ast: any): ExportInfo[] {
    const exports: ExportInfo[] = [];

    const visit = (node: any) => {
      switch (node.type) {
        case 'ExportNamedDeclaration':
          if (node.declaration) {
            // Export declaration (export function foo() {})
            if (node.declaration.id?.name) {
              exports.push({
                name: node.declaration.id.name,
                type: this.getDeclarationType(node.declaration.type),
                startPosition: {
                  row: node.loc.start.line - 1,
                  column: node.loc.start.column
                }
              });
            }
          } else if (node.specifiers) {
            // Export specifiers (export { foo, bar })
            node.specifiers.forEach((spec: any) => {
              exports.push({
                name: spec.exported.name,
                type: 'variable',
                startPosition: {
                  row: node.loc.start.line - 1,
                  column: node.loc.start.column
                },
                source: node.source?.value
              });
            });
          }
          break;

        case 'ExportDefaultDeclaration':
          const name = node.declaration?.id?.name || 'default';
          exports.push({
            name,
            type: this.getDeclarationType(node.declaration?.type) || 'default',
            startPosition: {
              row: node.loc.start.line - 1,
              column: node.loc.start.column
            },
            isDefault: true
          });
          break;
      }

      // Recursively visit children
      for (const key in node) {
        if (key !== 'parent' && key !== 'loc' && key !== 'range') {
          const child = node[key];
          if (Array.isArray(child)) {
            child.forEach(grandchild => {
              if (grandchild && typeof grandchild === 'object') {
                visit(grandchild);
              }
            });
          } else if (child && typeof child === 'object') {
            visit(child);
          }
        }
      }
    };

    visit(ast);
    return exports;
  }

  // ==================== Symbol Extraction (Tree-sitter) ====================

  private extractTreeSitterSymbols(node: any, _content: string, _language: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    const visit = (node: any, scope = 'global') => {
      const startPos = { row: node.startPosition.row, column: node.startPosition.column };
      const endPos = { row: node.endPosition.row, column: node.endPosition.column };

      switch (node.type) {
        case 'function_declaration':
        case 'function_definition':
          const funcName = this.extractNodeName(node, 'name') || this.extractNodeName(node, 'identifier');
          if (funcName) {
            symbols.push({
              name: funcName,
              type: 'function',
              startPosition: startPos,
              endPosition: endPos,
              scope
            });
          }
          break;

        case 'class_declaration':
        case 'class_definition':
          const className = this.extractNodeName(node, 'name') || this.extractNodeName(node, 'identifier');
          if (className) {
            symbols.push({
              name: className,
              type: 'class',
              startPosition: startPos,
              endPosition: endPos,
              scope
            });
          }
          break;

        case 'variable_declaration':
        case 'lexical_declaration':
          node.children?.forEach((child: any) => {
            if (child.type === 'variable_declarator') {
              const varName = this.extractNodeName(child, 'name') || this.extractNodeName(child, 'identifier');
              if (varName) {
                symbols.push({
                  name: varName,
                  type: 'variable',
                  startPosition: { row: child.startPosition.row, column: child.startPosition.column },
                  endPosition: { row: child.endPosition.row, column: child.endPosition.column },
                  scope
                });
              }
            }
          });
          break;
      }

      // Recursively visit children
      node.children?.forEach((child: any) => visit(child, scope));
    };

    visit(node);
    return symbols;
  }

  private extractTreeSitterImports(node: any, content: string, _language: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    const visit = (node: any) => {
      if (node.type === 'import_statement' || node.type === 'import_from_statement') {
        const sourceNode = node.children?.find((child: any) =>
          child.type === 'string' || child.type === 'string_literal'
        );

        if (sourceNode) {
          const source = content.slice(sourceNode.startIndex + 1, sourceNode.endIndex - 1);

          imports.push({
            source,
            specifiers: [],
            startPosition: {
              row: node.startPosition.row,
              column: node.startPosition.column
            }
          });
        }
      }

      node.children?.forEach((child: any) => visit(child));
    };

    visit(node);
    return imports;
  }

  private extractTreeSitterExports(node: any, _content: string, _language: string): ExportInfo[] {
    const exports: ExportInfo[] = [];

    const visit = (node: any) => {
      if (node.type === 'export_statement') {
        const name = this.extractNodeName(node, 'name') || 'unknown';
        exports.push({
          name,
          type: 'variable',
          startPosition: {
            row: node.startPosition.row,
            column: node.startPosition.column
          }
        });
      }

      node.children?.forEach((child: any) => visit(child));
    };

    visit(node);
    return exports;
  }

  // ==================== Symbol Indexing ====================

  private indexSymbols(filePath: string, symbols: SymbolInfo[]): void {
    for (const symbol of symbols) {
      // Index by symbol name
      const existing = this.symbolIndex.get(symbol.name) || [];

      // Remove old entries for this file
      const filtered = existing.filter(ref => ref.filePath !== filePath);

      // Add new entry
      const symbolRef: SymbolReference = {
        symbol,
        filePath,
        usages: [] // Will be populated by buildCrossReferences
      };

      filtered.push(symbolRef);
      this.symbolIndex.set(symbol.name, filtered);
    }
  }

  private indexDependencies(filePath: string, imports: ImportInfo[]): void {
    const dependencies = new Set<string>();

    for (const importInfo of imports) {
      // Only track internal dependencies (relative imports)
      if (importInfo.source.startsWith('.')) {
        const resolvedPath = this.resolveImportPath(importInfo.source, filePath);
        if (resolvedPath) {
          dependencies.add(resolvedPath);
        }
      }
    }

    this.dependencyGraph.set(filePath, dependencies);

    // Update reverse dependencies
    for (const dependency of dependencies) {
      const dependents = this.reverseDependencies.get(dependency) || new Set();
      dependents.add(filePath);
      this.reverseDependencies.set(dependency, dependents);
    }
  }

  private resolveImportPath(importPath: string, currentFile: string): string | null {
    const currentDir = path.dirname(currentFile);
    const basePath = path.resolve(currentDir, importPath);

    // Try different extensions
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

    for (const ext of extensions) {
      const fullPath = basePath + ext;
      if (ops.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // Try index files
    for (const ext of extensions) {
      const indexPath = path.join(basePath, `index${ext}`);
      if (ops.existsSync(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  // ==================== Cross-Reference Building ====================

  private buildCrossReferences(): void {
    this.crossReferences.clear();

    for (const [symbolName, symbolRefs] of this.symbolIndex) {
      // Find the definition (usually the first occurrence)
      const definition = symbolRefs.find(ref =>
        ref.symbol.startPosition.row >= 0
      );

      if (!definition) continue;

      const crossRef: CrossReference = {
        symbolName,
        definitionFile: definition.filePath,
        definitionLocation: {
          line: definition.symbol.startPosition.row,
          column: definition.symbol.startPosition.column
        },
        references: []
      };

      // Find all usages across files
      for (const ref of symbolRefs) {
        // Add definition as a reference
        if (ref.filePath === definition.filePath) {
          crossRef.references.push({
            file: ref.filePath,
            line: ref.symbol.startPosition.row,
            column: ref.symbol.startPosition.column,
            type: 'definition'
          });
        }

        // Find usages in file content
        try {
          const content = ops.readFileSync(ref.filePath, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const regex = new RegExp(`\\b${symbolName}\\b`, 'g');
            let match;

            while ((match = regex.exec(line)) !== null) {
              // Skip if this is the definition itself
              if (ref.filePath === definition.filePath &&
                i === definition.symbol.startPosition.row) {
                continue;
              }

              let usageType: SymbolUsage['type'] = 'reference';

              if (line.includes('import') && line.includes(symbolName)) {
                usageType = 'import';
              } else if (line.includes('export') && line.includes(symbolName)) {
                usageType = 'export';
              } else if (line.includes(symbolName + '(')) {
                usageType = 'call';
              }

              crossRef.references.push({
                file: ref.filePath,
                line: i,
                column: match.index,
                type: usageType
              });
            }
          }
        } catch {
          // Skip if file can't be read
        }
      }

      this.crossReferences.set(symbolName, crossRef);
    }
  }

  // ==================== File Watching ====================

  private startFileWatcher(): void {
    console.log('   Starting file watcher...');

    this.watcher = chokidar.watch(this.filePatterns, {
      cwd: this.rootPath,
      ignored: this.excludePatterns,
      persistent: true,
      ignoreInitial: true, // Don't fire events for existing files
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (relPath: string) => {
        const absPath = path.resolve(this.rootPath, relPath);
        this.scheduleFileUpdate(absPath, 'add');
      })
      .on('change', (relPath: string) => {
        const absPath = path.resolve(this.rootPath, relPath);
        this.scheduleFileUpdate(absPath, 'change');
      })
      .on('unlink', (relPath: string) => {
        const absPath = path.resolve(this.rootPath, relPath);
        this.handleFileDelete(absPath);
      })
      .on('error', (err: unknown) => {
        console.error('File watcher error:', err);
      });
  }

  private scheduleFileUpdate(filePath: string, event: 'add' | 'change'): void {
    // Debounce updates to avoid excessive reindexing
    const existing = this.pendingUpdates.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(async () => {
      this.pendingUpdates.delete(filePath);
      await this.handleFileUpdate(filePath, event);
    }, this.updateDebounceMs);

    this.pendingUpdates.set(filePath, timeout);
  }

  private async handleFileUpdate(filePath: string, _event: 'add' | 'change'): Promise<void> {
    if (this.isIndexing) {
      // Skip updates during initial indexing
      return;
    }

    try {
      // Get affected symbols before reindexing
      const oldSymbols = this.getFileSymbols(filePath);

      // Reindex the file
      await this.indexFile(filePath);

      // Rebuild cross-references for affected symbols
      const newSymbols = this.getFileSymbols(filePath);
      const affectedSymbols = new Set([
        ...oldSymbols.map(s => s.name),
        ...newSymbols.map(s => s.name)
      ]);

      // Rebuild cross-references only for affected symbols
      for (const symbolName of affectedSymbols) {
        const refs = this.symbolIndex.get(symbolName);
        if (refs) {
          this.rebuildSymbolCrossReference(symbolName, refs);
        }
      }

      // Update statistics
      this.updateStatistics();

      console.log(`   Updated: ${path.relative(this.rootPath, filePath)}`);
    } catch (error) {
      console.error(`Failed to update ${filePath}:`, error);
    }
  }

  private handleFileDelete(filePath: string): void {
    // Remove from all data structures
    this.fileAsts.delete(filePath);
    this.fileMetadata.delete(filePath);
    this.parseErrors.delete(filePath);

    // Remove symbols
    const symbols = this.getFileSymbols(filePath);
    for (const symbol of symbols) {
      const refs = this.symbolIndex.get(symbol.name);
      if (refs) {
        const filtered = refs.filter(ref => ref.filePath !== filePath);
        if (filtered.length > 0) {
          this.symbolIndex.set(symbol.name, filtered);
        } else {
          this.symbolIndex.delete(symbol.name);
        }
      }
      this.crossReferences.delete(symbol.name);
    }

    // Remove from dependency graph
    this.dependencyGraph.delete(filePath);
    this.reverseDependencies.delete(filePath);

    // Remove from reverse dependencies
    for (const [file, dependents] of this.reverseDependencies) {
      if (dependents.has(filePath)) {
        dependents.delete(filePath);
        if (dependents.size === 0) {
          this.reverseDependencies.delete(file);
        }
      }
    }

    this.updateStatistics();
    console.log(`   Deleted: ${path.relative(this.rootPath, filePath)}`);
  }

  private rebuildSymbolCrossReference(symbolName: string, refs: SymbolReference[]): void {
    const definition = refs.find(ref =>
      ref.symbol.startPosition.row >= 0
    );

    if (!definition) return;

    const crossRef: CrossReference = {
      symbolName,
      definitionFile: definition.filePath,
      definitionLocation: {
        line: definition.symbol.startPosition.row,
        column: definition.symbol.startPosition.column
      },
      references: []
    };

    // Simplified cross-reference rebuilding (full implementation similar to buildCrossReferences)
    this.crossReferences.set(symbolName, crossRef);
  }

  // ==================== Public Query API ====================

  getAST(filePath: string): any | undefined {
    return this.fileAsts.get(filePath);
  }

  findSymbol(symbolName: string): SymbolReference[] {
    return this.symbolIndex.get(symbolName) || [];
  }

  findSymbolByPattern(pattern: string, caseSensitive: boolean = false): SymbolReference[] {
    const results: SymbolReference[] = [];
    const regex = new RegExp(pattern, caseSensitive ? '' : 'i');

    for (const [symbolName, refs] of this.symbolIndex) {
      if (regex.test(symbolName)) {
        results.push(...refs);
      }
    }

    return results;
  }

  findReferences(symbolName: string): CrossReference | undefined {
    return this.crossReferences.get(symbolName);
  }

  getDependencies(filePath: string): Set<string> {
    return this.dependencyGraph.get(filePath) || new Set();
  }

  getDependents(filePath: string): Set<string> {
    return this.reverseDependencies.get(filePath) || new Set();
  }

  getFileSymbols(filePath: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];

    for (const refs of this.symbolIndex.values()) {
      for (const ref of refs) {
        if (ref.filePath === filePath) {
          symbols.push(ref.symbol);
        }
      }
    }

    return symbols;
  }

  getFileMetadata(filePath: string): FileMetadata | undefined {
    return this.fileMetadata.get(filePath);
  }

  getParseErrors(filePath?: string): Map<string, ParseError[]> | ParseError[] | undefined {
    if (filePath) {
      return this.parseErrors.get(filePath);
    }
    return new Map(this.parseErrors);
  }

  getAllFiles(): string[] {
    return Array.from(this.fileMetadata.keys());
  }

  getAllSymbols(): Map<string, SymbolReference[]> {
    return new Map(this.symbolIndex);
  }

  analyzeImpact(filePath: string, symbolName?: string): ImpactAnalysis {
    const affectedFiles = new Set<string>();
    const affectedSymbols = new Set<string>();
    const circularDependencies: string[][] = [];
    const warnings: string[] = [];

    // If specific symbol provided, analyze its impact
    if (symbolName) {
      const crossRef = this.crossReferences.get(symbolName);
      if (crossRef) {
        for (const ref of crossRef.references) {
          affectedFiles.add(ref.file);
        }
        affectedSymbols.add(symbolName);
      }
    } else {
      // Analyze impact of changing the file
      affectedFiles.add(filePath);

      // Add all dependents
      const dependents = this.getDependents(filePath);
      for (const dependent of dependents) {
        affectedFiles.add(dependent);
      }

      // Add all symbols in the file
      const fileSymbols = this.getFileSymbols(filePath);
      for (const symbol of fileSymbols) {
        affectedSymbols.add(symbol.name);
      }
    }

    // Detect circular dependencies
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (file: string) => {
      if (path.includes(file)) {
        const cycleStart = path.indexOf(file);
        circularDependencies.push(path.slice(cycleStart).concat([file]));
        return;
      }

      if (visited.has(file)) return;

      visited.add(file);
      path.push(file);

      const deps = this.getDependencies(file);
      for (const dep of deps) {
        if (affectedFiles.has(dep)) {
          dfs(dep);
        }
      }

      path.pop();
    };

    dfs(filePath);

    // Generate warnings
    if (affectedFiles.size > 10) {
      warnings.push('Large number of affected files');
    }
    if (circularDependencies.length > 0) {
      warnings.push('Circular dependencies detected');
    }
    if (affectedSymbols.size > 20) {
      warnings.push('Large number of affected symbols');
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (affectedFiles.size > 10 || circularDependencies.length > 0) {
      riskLevel = 'high';
    } else if (affectedFiles.size > 5 || affectedSymbols.size > 10) {
      riskLevel = 'medium';
    }

    return {
      affectedFiles,
      affectedSymbols,
      circularDependencies,
      riskLevel,
      warnings
    };
  }

  getStatistics(): EngineStatistics {
    return { ...this.statistics };
  }

  isReady(): boolean {
    return this.isInitialized && !this.isIndexing;
  }

  // ==================== Utility Methods ====================

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
        return 'javascript';
    }
  }

  private computeHash(content: string): string {
    // Simple hash function for content
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  private extractNodeName(node: any, nameField: string): string | null {
    const nameNode = node.children?.find((child: any) => child.type === nameField);
    return nameNode ? nameNode.text : null;
  }

  private getDeclarationType(nodeType: string): ExportInfo['type'] {
    switch (nodeType) {
      case 'FunctionDeclaration':
        return 'function';
      case 'ClassDeclaration':
        return 'class';
      case 'TSInterfaceDeclaration':
        return 'interface';
      case 'TSEnumDeclaration':
        return 'enum';
      case 'TSTypeAliasDeclaration':
        return 'type';
      default:
        return 'variable';
    }
  }

  private updateStatistics(): void {
    const totalSymbols = Array.from(this.symbolIndex.values())
      .reduce((sum, refs) => sum + refs.length, 0);

    const totalDeps = Array.from(this.dependencyGraph.values())
      .reduce((sum, deps) => sum + deps.size, 0);

    const parseTimes = Array.from(this.fileMetadata.values())
      .map(meta => meta.parseTime)
      .filter(time => time > 0);

    const avgParseTime = parseTimes.length > 0
      ? parseTimes.reduce((sum, time) => sum + time, 0) / parseTimes.length
      : 0;

    this.statistics = {
      totalFiles: this.fileMetadata.size,
      indexedFiles: Array.from(this.fileMetadata.values()).filter(m => m.indexed).length,
      totalSymbols,
      totalDependencies: totalDeps,
      memoryUsage: process.memoryUsage().heapUsed,
      lastUpdateTime: Date.now(),
      averageParseTime: Math.round(avgParseTime)
    };
  }

  // ==================== Cleanup ====================

  dispose(): void {
    console.log('🧠 Disposing Code Intelligence Engine');

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    // Clear all pending updates
    for (const timeout of this.pendingUpdates.values()) {
      clearTimeout(timeout);
    }
    this.pendingUpdates.clear();

    // Clear data structures
    this.fileAsts.clear();
    this.fileMetadata.clear();
    this.symbolIndex.clear();
    this.dependencyGraph.clear();
    this.reverseDependencies.clear();
    this.crossReferences.clear();
    this.parseErrors.clear();

    this.isInitialized = false;
    console.log('   Engine disposed');
  }
}
