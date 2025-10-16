import { ToolResult } from "../../types/index.js";
import { SymbolInfo } from "./types.js";
import { SymbolSearchTool, SymbolReference } from "./symbol-search.js";
import { CodeIntelligenceEngine } from "./engine.js";
import { MultiFileEditorTool } from "../advanced/multi-file-editor.js";
import { OperationHistoryTool } from "../advanced/operation-history.js";
import * as ops from "fs";

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await ops.promises.access(filePath, ops.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};



import path from "path";

export interface RefactoringOperation {
  type: 'rename' | 'extract_function' | 'extract_variable' | 'inline_function' | 'inline_variable' | 'move_function' | 'move_class';
  description: string;
  files: RefactoringFileChange[];
  preview: string;
  safety: SafetyAnalysis;
  rollback?: string;
}

export interface RefactoringFileChange {
  filePath: string;
  changes: TextChange[];
  backup?: string;
}

export interface TextChange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  oldText: string;
  newText: string;
  type: 'replace' | 'insert' | 'delete';
}

export interface SafetyAnalysis {
  riskLevel: 'low' | 'medium' | 'high';
  potentialIssues: string[];
  affectedFiles: number;
  affectedSymbols: number;
  requiresTests: boolean;
  breakingChanges: boolean;
}

export interface RenameRequest {
  symbolName: string;
  newName: string;
  filePath?: string;
  scope: 'file' | 'project' | 'global';
  includeComments: boolean;
  includeStrings: boolean;
}

export interface ExtractFunctionRequest {
  filePath: string;
  startLine: number;
  endLine: number;
  functionName: string;
  parameters?: ExtractedParameter[];
  returnType?: string;
}

export interface ExtractedParameter {
  name: string;
  type?: string;
  defaultValue?: string;
}

export interface MoveRequest {
  symbolName: string;
  sourceFile: string;
  targetFile: string;
  createTargetFile?: boolean;
}

export interface InlineRequest {
  symbolName: string;
  filePath: string;
  preserveComments: boolean;
}

export class RefactoringAssistantTool {
  name = "refactoring_assistant";
  description = "Perform safe code refactoring operations including rename, extract, inline, and move operations";

  private intelligenceEngine: CodeIntelligenceEngine;
  private symbolSearch: SymbolSearchTool;
  private multiFileEditor: MultiFileEditorTool;
  private operationHistory: OperationHistoryTool;

  constructor(intelligenceEngine: CodeIntelligenceEngine) {
    this.intelligenceEngine = intelligenceEngine;
    this.symbolSearch = new SymbolSearchTool(intelligenceEngine);
    this.multiFileEditor = new MultiFileEditorTool();
    this.operationHistory = new OperationHistoryTool();
  }

  async execute(args: any): Promise<ToolResult> {
    try {
      const { operation, ...operationArgs } = args;

      if (!operation) {
        throw new Error("Refactoring operation type is required");
      }

      let result: RefactoringOperation;

      switch (operation) {
        case 'rename':
          result = await this.performRename(operationArgs as RenameRequest);
          break;
        case 'extract_function':
          result = await this.performExtractFunction(operationArgs as ExtractFunctionRequest);
          break;
        case 'extract_variable':
          result = await this.performExtractVariable(operationArgs);
          break;
        case 'inline_function':
          result = await this.performInlineFunction(operationArgs as InlineRequest);
          break;
        case 'inline_variable':
          result = await this.performInlineVariable(operationArgs as InlineRequest);
          break;
        case 'move_function':
        case 'move_class':
          result = await this.performMove(operationArgs as MoveRequest);
          break;
        default:
          throw new Error(`Unsupported refactoring operation: ${operation}`);
      }

      return {
        success: true,
        output: JSON.stringify(result, null, 2)
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async performRename(request: RenameRequest): Promise<RefactoringOperation> {
    const { symbolName, newName, filePath, scope, includeComments, includeStrings } = request;

    if (!symbolName || !newName) {
      throw new Error("Symbol name and new name are required for rename operation");
    }

    // Validate new name
    if (!this.isValidIdentifier(newName)) {
      throw new Error(`Invalid identifier: ${newName}`);
    }

    // Find all occurrences of the symbol
    const searchPath = scope === 'file' && filePath ? path.dirname(filePath) : process.cwd();
    const searchResult = await this.symbolSearch.execute({
      query: symbolName,
      searchPath,
      includeUsages: true,
      fuzzyMatch: false,
      caseSensitive: true
    });

    if (!searchResult.success || !searchResult.output) {
      throw new Error("Failed to find symbol occurrences");
    }
    const parsed = JSON.parse(searchResult.output);
    if (!parsed.success) {
      throw new Error("Failed to find symbol occurrences");
    }

    const symbolRefs = parsed.result.symbols as SymbolReference[];

    // Filter by scope
    const relevantRefs = scope === 'file' && filePath
      ? symbolRefs.filter(ref => ref.filePath === filePath)
      : symbolRefs;

    if (relevantRefs.length === 0) {
      throw new Error(`Symbol '${symbolName}' not found in specified scope`);
    }

    // Perform safety analysis
    const safety = await this.analyzeSafety(relevantRefs, 'rename');

    // Generate changes
    const fileChanges: RefactoringFileChange[] = [];
    const affectedFiles = new Set<string>();

    for (const ref of relevantRefs) {
      affectedFiles.add(ref.filePath);

      const changes = await this.generateRenameChanges(
        ref,
        symbolName,
        newName,
        includeComments,
        includeStrings
      );

      if (changes.length > 0) {
        fileChanges.push({
          filePath: ref.filePath,
          changes
        });
      }
    }

    // Generate preview
    const preview = this.generatePreview(fileChanges, 'rename', symbolName, newName);

    return {
      type: 'rename',
      description: `Rename '${symbolName}' to '${newName}' (${scope} scope)`,
      files: fileChanges,
      preview,
      safety
    };
  }

  private async performExtractFunction(request: ExtractFunctionRequest): Promise<RefactoringOperation> {
    const { filePath, startLine, endLine, functionName, parameters = [], returnType } = request;

    if (!filePath || startLine === undefined || endLine === undefined || !functionName) {
      throw new Error("File path, line range, and function name are required");
    }

    if (!await pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await ops.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (startLine < 0 || endLine >= lines.length || startLine > endLine) {
      throw new Error("Invalid line range");
    }

    // Extract the code block
    const extractedCode = lines.slice(startLine, endLine + 1);
    const extractedText = extractedCode.join('\n');

    // Analyze the extracted code for variables using enhanced AST analysis
    const analysis = await this.analyzeExtractedCode(extractedText, filePath);

    // Use auto-detected parameters if none were provided
    const finalParameters = parameters.length > 0 ? parameters : analysis.parameters;
    const finalReturnType = returnType || analysis.inferredReturnType;

    // Generate function signature
    const functionSignature = this.generateFunctionSignature(
      functionName,
      finalParameters,
      finalReturnType
    );

    // Create the new function
    const newFunction = this.createExtractedFunction(
      functionSignature,
      extractedText,
      analysis.localVariables
    );

    // Generate function call
    const functionCall = this.generateFunctionCall(
      functionName,
      finalParameters,
      analysis.returnVariable
    );

    // Create changes
    const changes: TextChange[] = [
      // Replace extracted code with function call
      {
        startLine,
        startColumn: 0,
        endLine,
        endColumn: lines[endLine].length,
        oldText: extractedText,
        newText: functionCall,
        type: 'replace'
      },
      // Insert new function (simplified - should find appropriate location)
      {
        startLine: endLine + 1,
        startColumn: 0,
        endLine: endLine + 1,
        endColumn: 0,
        oldText: '',
        newText: '\n' + newFunction + '\n',
        type: 'insert'
      }
    ];

    // Determine risk level based on analysis confidence and external references
    let riskLevel: 'low' | 'medium' | 'high' = 'medium';
    const potentialIssues: string[] = [
      'Variable scope changes',
      'Side effects may be altered',
      'Error handling context may change'
    ];

    if (analysis.confidence > 0.8 && analysis.externalReferences.size === 0) {
      riskLevel = 'low';
    } else if (analysis.confidence < 0.5 || analysis.externalReferences.size > 3) {
      riskLevel = 'high';
      potentialIssues.push('Low confidence in parameter detection');
    }

    if (analysis.externalReferences.size > 0) {
      potentialIssues.push(`References ${analysis.externalReferences.size} external symbols`);
    }

    const safety: SafetyAnalysis = {
      riskLevel,
      potentialIssues,
      affectedFiles: 1,
      affectedSymbols: 1,
      requiresTests: true,
      breakingChanges: false
    };

    const fileChanges: RefactoringFileChange[] = [{
      filePath,
      changes
    }];

    // Enhanced preview with analysis details
    let preview = this.generatePreview(fileChanges, 'extract_function', extractedText, functionName);

    // Add analysis metadata to preview
    preview += `\n\n--- Analysis Details ---`;
    preview += `\nConfidence: ${(analysis.confidence * 100).toFixed(0)}%`;
    preview += `\nAuto-detected parameters: ${finalParameters.map(p => `${p.name}: ${p.type || 'any'}`).join(', ') || 'none'}`;
    preview += `\nInferred return type: ${finalReturnType}`;
    if (analysis.externalReferences.size > 0) {
      preview += `\nExternal references: ${Array.from(analysis.externalReferences).join(', ')}`;
      preview += `\n⚠️  Warning: Function references external symbols that may need to be passed as parameters`;
    }

    return {
      type: 'extract_function',
      description: `Extract function '${functionName}' from lines ${startLine}-${endLine} (confidence: ${(analysis.confidence * 100).toFixed(0)}%)`,
      files: fileChanges,
      preview,
      safety
    };
  }

  private async performExtractVariable(args: any): Promise<RefactoringOperation> {
    const { filePath, startLine, startColumn, endLine, endColumn, variableName, variableType } = args;

    if (!filePath || !variableName) {
      throw new Error("File path and variable name are required");
    }

    const content = await ops.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Extract expression
    const startLineContent = lines[startLine];
    const endLineContent = lines[endLine];

    let expression: string;
    if (startLine === endLine) {
      expression = startLineContent.substring(startColumn, endColumn);
    } else {
      expression = startLineContent.substring(startColumn) + '\n' +
        lines.slice(startLine + 1, endLine).join('\n') + '\n' +
        endLineContent.substring(0, endColumn);
    }

    // Generate variable declaration
    const indent = this.getIndentation(startLineContent);
    const varDeclaration = `${indent}const ${variableName}${variableType ? `: ${variableType}` : ''} = ${expression.trim()};`;

    const changes: TextChange[] = [
      // Insert variable declaration
      {
        startLine,
        startColumn: 0,
        endLine: startLine,
        endColumn: 0,
        oldText: '',
        newText: varDeclaration + '\n',
        type: 'insert'
      },
      // Replace expression with variable
      {
        startLine: startLine + 1, // Account for inserted line
        startColumn,
        endLine: endLine + 1,
        endColumn,
        oldText: expression,
        newText: variableName,
        type: 'replace'
      }
    ];

    const safety: SafetyAnalysis = {
      riskLevel: 'low',
      potentialIssues: ['Variable name conflicts'],
      affectedFiles: 1,
      affectedSymbols: 1,
      requiresTests: false,
      breakingChanges: false
    };

    const fileChanges: RefactoringFileChange[] = [{
      filePath,
      changes
    }];

    const preview = this.generatePreview(fileChanges, 'extract_variable', expression, variableName);

    return {
      type: 'extract_variable',
      description: `Extract variable '${variableName}' from expression`,
      files: fileChanges,
      preview,
      safety
    };
  }

  private async performInlineFunction(request: InlineRequest): Promise<RefactoringOperation> {
    const { symbolName, filePath, preserveComments } = request;

    // Find function definition using the intelligence engine
    const symbols = this.intelligenceEngine.getFileSymbols(filePath);
    const functionSymbol = symbols.find((s: SymbolInfo) => s.name === symbolName && s.type === 'function');

    if (!functionSymbol) {
      throw new Error(`Function '${symbolName}' not found`);
    }

    // Get function body
    const content = await ops.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const functionLines = lines.slice(functionSymbol.startPosition.row, functionSymbol.endPosition.row + 1);
    const functionBody = this.extractFunctionBody(functionLines.join('\n'));

    // Find all calls to this function
    const usageSearch = await this.symbolSearch.execute({
      query: symbolName,
      searchPath: path.dirname(filePath),
      includeUsages: true,
      fuzzyMatch: false
    });

    if (!usageSearch.success || !usageSearch.output) {
      throw new Error("Failed to find function usages");
    }
    const usageParsed = JSON.parse(usageSearch.output);
    if (!usageParsed.success) {
      throw new Error("Failed to find function usages");
    }

    const usages = usageParsed.result.symbols as SymbolReference[];
    const functionCalls = this.findFunctionCalls(usages, symbolName);

    // Generate inline replacements
    const fileChanges: RefactoringFileChange[] = [];
    const affectedFiles = new Set<string>();

    for (const call of functionCalls) {
      affectedFiles.add(call.filePath);
      const inlinedCode = this.inlineFunction(functionBody, call.arguments);

      // Add change to replace function call with inlined code
      const changes: TextChange[] = [{
        startLine: call.line,
        startColumn: call.column,
        endLine: call.line,
        endColumn: call.column + call.text.length,
        oldText: call.text,
        newText: inlinedCode,
        type: 'replace'
      }];

      fileChanges.push({
        filePath: call.filePath,
        changes
      });
    }

    // Remove function definition
    const definitionChanges: TextChange[] = [{
      startLine: functionSymbol.startPosition.row,
      startColumn: 0,
      endLine: functionSymbol.endPosition.row + 1,
      endColumn: 0,
      oldText: functionLines.join('\n'),
      newText: preserveComments ? this.extractComments(functionLines.join('\n')) : '',
      type: 'replace'
    }];

    fileChanges.push({
      filePath,
      changes: definitionChanges
    });

    const safety: SafetyAnalysis = {
      riskLevel: 'high',
      potentialIssues: [
        'Code duplication',
        'Variable scope changes',
        'Performance implications',
        'Debugging complexity'
      ],
      affectedFiles: affectedFiles.size,
      affectedSymbols: functionCalls.length + 1,
      requiresTests: true,
      breakingChanges: false
    };

    const preview = this.generatePreview(fileChanges, 'inline_function', symbolName, 'inlined code');

    return {
      type: 'inline_function',
      description: `Inline function '${symbolName}' at all call sites`,
      files: fileChanges,
      preview,
      safety
    };
  }

  private async performInlineVariable(_request: InlineRequest): Promise<RefactoringOperation> {
    // Similar to inline function but for variables
    throw new Error("Inline variable not yet implemented");
  }

  private async performMove(_request: MoveRequest): Promise<RefactoringOperation> {
    // Move function or class to different file
    throw new Error("Move operation not yet implemented");
  }

  // Helper methods

  private isValidIdentifier(name: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
  }

  private async analyzeSafety(refs: SymbolReference[], operation: string): Promise<SafetyAnalysis> {
    const affectedFiles = new Set(refs.map((ref: SymbolReference) => ref.filePath)).size;
    const affectedSymbols = refs.length;

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    const potentialIssues: string[] = [];

    if (affectedFiles > 5) {
      riskLevel = 'medium';
      potentialIssues.push('Many files affected');
    }

    if (affectedSymbols > 20) {
      riskLevel = 'high';
      potentialIssues.push('Many symbol occurrences');
    }

    if (operation === 'rename') {
      potentialIssues.push('Potential naming conflicts');
    }

    return {
      riskLevel,
      potentialIssues,
      affectedFiles,
      affectedSymbols,
      requiresTests: affectedFiles > 1,
      breakingChanges: false
    };
  }

  private async generateRenameChanges(
    ref: SymbolReference,
    oldName: string,
    newName: string,
    includeComments: boolean,
    includeStrings: boolean
  ): Promise<TextChange[]> {
    const changes: TextChange[] = [];
    const content = await ops.promises.readFile(ref.filePath, 'utf-8');
    const lines = content.split('\n');

    // Simple text replacement for now
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comments and strings if not requested
      if (!includeComments && (line.trim().startsWith('//') || line.trim().startsWith('*'))) {
        continue;
      }

      if (!includeStrings && (line.includes('"') || line.includes("'"))) {
        continue;
      }

      // Find word boundaries to avoid partial matches
      const regex = new RegExp(`\\b${oldName}\\b`, 'g');
      let match;

      while ((match = regex.exec(line)) !== null) {
        changes.push({
          startLine: i,
          startColumn: match.index,
          endLine: i,
          endColumn: match.index + oldName.length,
          oldText: oldName,
          newText: newName,
          type: 'replace'
        });
      }
    }

    return changes;
  }

  private async analyzeExtractedCode(code: string, filePath: string): Promise<{
    parameters: ExtractedParameter[];
    localVariables: string[];
    inferredReturnType: string;
    returnVariable: string | undefined;
    externalReferences: Set<string>;
    confidence: number;
  }> {
    const parameters: ExtractedParameter[] = [];
    const localVariables: string[] = [];
    const externalReferences = new Set<string>();
    let inferredReturnType = 'void';
    let returnVariable: string | undefined;
    let confidence = 0.5; // Default confidence

    try {
      // Parse the extracted code as TypeScript
      const { parse } = await import("@typescript-eslint/typescript-estree");

      // Wrap code in a function to make it parseable
      const wrappedCode = `function __temp__() {\n${code}\n}`;

      const ast = parse(wrappedCode, {
        jsx: filePath.endsWith('.tsx') || filePath.endsWith('.jsx'),
        loc: true,
        range: true,
        errorOnUnknownASTType: false,
        errorOnTypeScriptSyntacticAndSemanticIssues: false
      });

      // Get all symbols from the parent file for context
      const fileSymbols = this.intelligenceEngine.getFileSymbols(filePath);
      const fileSymbolNames = new Set(fileSymbols.map(s => s.name));

      // Track variables declared within the extracted code
      const declaredVariables = new Set<string>();
      const usedVariables = new Set<string>();
      const returnStatements: any[] = [];

      // Traverse AST to find variable declarations and usages
      const visit = (node: any) => {
        if (!node) return;

        switch (node.type) {
          case 'VariableDeclaration':
            node.declarations?.forEach((decl: any) => {
              const varName = decl.id?.name;
              if (varName) {
                declaredVariables.add(varName);
                localVariables.push(varName);
              }
            });
            break;

          case 'Identifier':
            // Track identifier usage
            const idName = node.name;
            if (idName && !declaredVariables.has(idName)) {
              usedVariables.add(idName);
            }
            break;

          case 'ReturnStatement':
            returnStatements.push(node);
            if (node.argument) {
              // Analyze return value
              if (node.argument.type === 'Identifier') {
                returnVariable = node.argument.name;
              } else if (node.argument.type === 'ObjectExpression') {
                inferredReturnType = 'object';
              } else if (node.argument.type === 'ArrayExpression') {
                inferredReturnType = 'any[]';
              } else if (node.argument.type === 'Literal') {
                inferredReturnType = typeof node.argument.value;
              }
            }
            break;

          case 'FunctionDeclaration':
          case 'ArrowFunctionExpression':
          case 'FunctionExpression':
            // Don't traverse into nested functions for variable analysis
            return;
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

      // Determine parameters: variables used but not declared locally
      for (const varName of usedVariables) {
        if (!declaredVariables.has(varName)) {
          // Check if it's a symbol from the parent file
          const isFileSymbol = fileSymbolNames.has(varName);
          const isGlobal = this.isGlobalIdentifier(varName);

          if (!isGlobal) {
            if (isFileSymbol) {
              // It's a reference to a file-level symbol
              externalReferences.add(varName);
            } else {
              // It's likely a parameter
              parameters.push({
                name: varName,
                type: this.inferParameterType(varName, code)
              });
            }
          }
        }
      }

      // Infer return type from return statements
      if (returnStatements.length > 0) {
        if (returnVariable && declaredVariables.has(returnVariable)) {
          // Variable is declared locally and returned
          inferredReturnType = this.inferVariableType(returnVariable, code);
        } else if (returnVariable && !declaredVariables.has(returnVariable)) {
          // Variable is a parameter or external reference
          inferredReturnType = 'any';
        }
      } else {
        inferredReturnType = 'void';
      }

      // Calculate confidence based on analysis quality
      confidence = this.calculateAnalysisConfidence({
        hasReturnStatements: returnStatements.length > 0,
        parametersDetected: parameters.length,
        localVariablesDetected: localVariables.length,
        externalReferencesDetected: externalReferences.size,
        returnTypeInferred: inferredReturnType !== 'any'
      });

    } catch (error) {
      // Fallback to simple regex-based analysis
      console.warn('AST analysis failed, using fallback:', error);

      const lines = code.split('\n');
      for (const line of lines) {
        if (line.includes('return ')) {
          const returnMatch = line.match(/return\s+([^;]+)/);
          if (returnMatch) {
            returnVariable = returnMatch[1].trim();
            inferredReturnType = 'any';
          }
        }
      }

      confidence = 0.3; // Low confidence for fallback
    }

    return {
      parameters,
      localVariables,
      inferredReturnType,
      returnVariable,
      externalReferences,
      confidence
    };
  }

  private isGlobalIdentifier(name: string): boolean {
    // Common global identifiers that shouldn't be parameters
    const globals = new Set([
      'console', 'window', 'document', 'process', 'global', 'require', 'module', 'exports',
      'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Promise', 'Array',
      'Object', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON', 'RegExp',
      'Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'Map', 'Set', 'WeakMap',
      'WeakSet', 'Symbol', 'Proxy', 'Reflect', 'Buffer', 'undefined', 'null', 'true',
      'false', 'NaN', 'Infinity', 'isNaN', 'isFinite', 'parseInt', 'parseFloat',
      'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent'
    ]);

    return globals.has(name);
  }

  private inferParameterType(paramName: string, code: string): string {
    // Try to infer type from usage patterns
    const lines = code.split('\n');

    for (const line of lines) {
      // Check for method calls
      if (line.includes(`${paramName}.`)) {
        if (line.includes('.map(') || line.includes('.filter(') || line.includes('.forEach(')) {
          return 'any[]';
        }
        if (line.includes('.toString(') || line.includes('.toLowerCase(') || line.includes('.toUpperCase(')) {
          return 'string';
        }
        if (line.includes('.toFixed(') || line.includes('.toPrecision(')) {
          return 'number';
        }
      }

      // Check for arithmetic operations
      if (new RegExp(`${paramName}\\s*[+\\-*/]\\s*\\d`).test(line)) {
        return 'number';
      }

      // Check for string operations
      if (new RegExp(`${paramName}\\s*\\+\\s*['"\`]`).test(line) || new RegExp(`['"\`]\\s*\\+\\s*${paramName}`).test(line)) {
        return 'string';
      }

      // Check for boolean operations
      if (new RegExp(`${paramName}\\s*(&&|\\|\\||!)\\s*`).test(line)) {
        return 'boolean';
      }
    }

    return 'any'; // Default to any if we can't infer
  }

  private inferVariableType(varName: string, code: string): string {
    // Try to infer type from variable declaration
    const lines = code.split('\n');

    for (const line of lines) {
      // Look for variable declaration
      const declMatch = line.match(new RegExp(`(?:const|let|var)\\s+${varName}\\s*=\\s*(.+)`));
      if (declMatch) {
        const value = declMatch[1].trim();

        // Check literal types
        if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) {
          return 'string';
        }
        if (/^\d+$/.test(value) || /^\d+\.\d+$/.test(value)) {
          return 'number';
        }
        if (value === 'true' || value === 'false') {
          return 'boolean';
        }
        if (value.startsWith('[')) {
          return 'any[]';
        }
        if (value.startsWith('{')) {
          return 'object';
        }
      }

      // Look for type annotation
      const typeMatch = line.match(new RegExp(`(?:const|let|var)\\s+${varName}\\s*:\\s*([^=]+)`));
      if (typeMatch) {
        return typeMatch[1].trim();
      }
    }

    return 'any';
  }

  private calculateAnalysisConfidence(metrics: {
    hasReturnStatements: boolean;
    parametersDetected: number;
    localVariablesDetected: number;
    externalReferencesDetected: number;
    returnTypeInferred: boolean;
  }): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence for successful analysis
    if (metrics.hasReturnStatements) confidence += 0.1;
    if (metrics.parametersDetected > 0) confidence += 0.1;
    if (metrics.localVariablesDetected > 0) confidence += 0.1;
    if (metrics.returnTypeInferred) confidence += 0.15;

    // Decrease confidence for complex scenarios
    if (metrics.externalReferencesDetected > 3) confidence -= 0.1;
    if (metrics.parametersDetected > 5) confidence -= 0.05;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private generateFunctionSignature(
    name: string,
    parameters: ExtractedParameter[],
    returnType: string
  ): string {
    const params = parameters.map(p =>
      `${p.name}${p.type ? `: ${p.type}` : ''}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`
    ).join(', ');

    return `function ${name}(${params})${returnType !== 'void' ? `: ${returnType}` : ''}`;
  }

  private createExtractedFunction(
    signature: string,
    body: string,
    _localVars: string[]
  ): string {
    return `${signature} {\n${body}\n}`;
  }

  private generateFunctionCall(
    name: string,
    parameters: ExtractedParameter[],
    returnVar?: string
  ): string {
    const args = parameters.map(p => p.name).join(', ');
    const call = `${name}(${args})`;

    return returnVar ? `const ${returnVar} = ${call};` : `${call};`;
  }

  private getIndentation(line: string): string {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : '';
  }

  private extractFunctionBody(functionCode: string): string {
    // Extract just the body content between { }
    const lines = functionCode.split('\n');
    const bodyStart = lines.findIndex(line => line.includes('{')) + 1;
    const bodyEnd = lines.length - 1; // Assume last line has }

    return lines.slice(bodyStart, bodyEnd).join('\n');
  }

  private findFunctionCalls(usages: SymbolReference[], _functionName: string): any[] {
    // Find actual function calls vs just references
    const calls: any[] = [];

    for (const usage of usages) {
      for (const u of usage.usages) {
        if (u.type === 'call') {
          calls.push({
            filePath: usage.filePath,
            line: u.line,
            column: u.column,
            text: u.context,
            arguments: [] // Would parse actual arguments
          });
        }
      }
    }

    return calls;
  }

  private inlineFunction(functionBody: string, _args: string[]): string {
    // Replace parameters with arguments in function body
    // This is a simplified implementation
    return functionBody;
  }

  private extractComments(code: string): string {
    const lines = code.split('\n');
    const comments = lines.filter(line =>
      line.trim().startsWith('//') ||
      line.trim().startsWith('*') ||
      line.trim().startsWith('/*')
    );
    return comments.join('\n');
  }

  private generatePreview(
    fileChanges: RefactoringFileChange[],
    operation: string,
    oldValue: string,
    newValue: string
  ): string {
    let preview = `${operation.toUpperCase()}: ${oldValue} → ${newValue}\n\n`;

    for (const fileChange of fileChanges) {
      preview += `File: ${fileChange.filePath}\n`;
      preview += `Changes: ${fileChange.changes.length}\n`;

      for (const change of fileChange.changes.slice(0, 3)) { // Show first 3 changes
        preview += `  Line ${change.startLine}: ${change.oldText} → ${change.newText}\n`;
      }

      if (fileChange.changes.length > 3) {
        preview += `  ... and ${fileChange.changes.length - 3} more changes\n`;
      }

      preview += '\n';
    }

    return preview;
  }

  getSchema() {
    return {
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
        startColumn: {
          type: "integer",
          description: "Start column for extract variable operation"
        },
        endColumn: {
          type: "integer",
          description: "End column for extract variable operation"
        },
        functionName: {
          type: "string",
          description: "Name for extracted function"
        },
        variableName: {
          type: "string",
          description: "Name for extracted variable"
        },
        variableType: {
          type: "string",
          description: "Type annotation for extracted variable"
        },
        parameters: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              defaultValue: { type: "string" }
            },
            required: ["name"]
          },
          description: "Parameters for extracted function"
        },
        returnType: {
          type: "string",
          description: "Return type for extracted function"
        },
        targetFile: {
          type: "string",
          description: "Target file for move operations"
        },
        createTargetFile: {
          type: "boolean",
          description: "Create target file if it doesn't exist",
          default: false
        },
        preserveComments: {
          type: "boolean",
          description: "Preserve comments in inline operations",
          default: true
        }
      },
      required: ["operation"]
    };
  }
}