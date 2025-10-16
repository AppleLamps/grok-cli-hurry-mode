export { SymbolSearchTool } from "./symbol-search.js";
export { DependencyAnalyzerTool } from "./dependency-analyzer.js";
export { CodeContextTool } from "./code-context.js";
export { RefactoringAssistantTool } from "./refactoring-assistant.js";

// Export types
export type {
  ASTNode,
  ParseResult,
  SymbolInfo,
  ParameterInfo,
  ImportInfo,
  ExportInfo,
  ParseError
} from "./types.js";

export type {
  SymbolReference,
  SymbolUsage,
  SearchResult,
  CrossReference
} from "./symbol-search.js";

export type {
  DependencyNode,
  DependencyGraph,
  CircularDependency,
  DependencyStatistics,
  ModuleAnalysis
} from "./dependency-analyzer.js";

export type {
  CodeContext,
  ContextualSymbol,
  ContextualDependency,
  CodeRelationship,
  SemanticContext,
  DesignPattern,
  UsagePattern,
  CodeMetrics,
  ComplexityMetrics,
  QualityMetrics,
  ProjectContext,
  ArchitectureInfo
} from "./code-context.js";

export type {
  RefactoringOperation,
  RefactoringFileChange,
  TextChange,
  SafetyAnalysis,
  RenameRequest,
  ExtractFunctionRequest,
  ExtractedParameter,
  MoveRequest,
  InlineRequest
} from "./refactoring-assistant.js";