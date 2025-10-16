// ==================== AST and Parse Result Types ====================

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

// ==================== Symbol Types ====================

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

// ==================== Import/Export Types ====================

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

// ==================== Error Types ====================

export interface ParseError {
  message: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
}

