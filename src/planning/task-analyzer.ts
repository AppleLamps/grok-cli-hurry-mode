/**
 * Task Analyzer
 * 
 * Analyzes user requests to understand intent, scope, and complexity
 */

import { CodeIntelligenceEngine } from '../tools/intelligence/engine.js';
import { DependencyAnalyzerTool } from '../tools/intelligence/dependency-analyzer.js';
import { TaskAnalysis } from './types.js';

export class TaskAnalyzer {
  private intelligenceEngine: CodeIntelligenceEngine;
  private dependencyAnalyzer: DependencyAnalyzerTool;

  constructor(rootPath: string) {
    this.intelligenceEngine = new CodeIntelligenceEngine(rootPath);
    this.dependencyAnalyzer = new DependencyAnalyzerTool(this.intelligenceEngine);
  }

  /**
   * Analyze a user request to understand what needs to be done
   */
  async analyzeRequest(userRequest: string, context?: { currentDirectory?: string }): Promise<TaskAnalysis> {
    const intent = this.extractIntent(userRequest);
    const scope = await this.determineScope(userRequest, context);
    const complexity = this.assessComplexity(userRequest, scope);
    const estimatedSteps = this.estimateSteps(intent, scope, complexity);
    const suggestedApproach = this.suggestApproach(intent, scope, complexity);
    const potentialRisks = await this.identifyRisks(intent, scope);
    const requiredTools = this.identifyRequiredTools(intent, scope);

    return {
      intent,
      scope,
      complexity,
      estimatedSteps,
      suggestedApproach,
      potentialRisks,
      requiredTools
    };
  }

  /**
   * Extract the primary intent from user request
   */
  private extractIntent(request: string): string {
    const lowerRequest = request.toLowerCase();

    // Refactoring intents
    if (lowerRequest.includes('refactor')) return 'refactor';
    if (lowerRequest.includes('rename')) return 'rename';
    if (lowerRequest.includes('extract')) return 'extract';
    if (lowerRequest.includes('move')) return 'move';
    if (lowerRequest.includes('inline')) return 'inline';

    // Creation intents
    if (lowerRequest.includes('create') || lowerRequest.includes('add')) return 'create';
    if (lowerRequest.includes('implement')) return 'implement';
    if (lowerRequest.includes('generate')) return 'generate';

    // Modification intents
    if (lowerRequest.includes('update') || lowerRequest.includes('modify')) return 'modify';
    if (lowerRequest.includes('fix') || lowerRequest.includes('repair')) return 'fix';

    // Cleanup intents
    if (lowerRequest.includes('remove') || lowerRequest.includes('delete')) return 'remove';
    if (lowerRequest.includes('clean')) return 'cleanup';

    // Analysis intents
    if (lowerRequest.includes('analyze') || lowerRequest.includes('find')) return 'analyze';

    return 'general';
  }

  /**
   * Determine the scope of the task
   */
  private async determineScope(request: string, _context?: { currentDirectory?: string }): Promise<{
    files: string[];
    symbols: string[];
    dependencies: string[];
  }> {
    const files: string[] = [];
    const symbols: string[] = [];
    const dependencies: string[] = [];

    // Extract file patterns from request
    const filePatterns = this.extractFilePatterns(request);

    // Extract symbol names from request
    const symbolNames = this.extractSymbolNames(request);
    symbols.push(...symbolNames);

    // If specific files mentioned, add them
    if (filePatterns.length > 0) {
      files.push(...filePatterns);
    }

    // If symbols mentioned, find their files
    if (symbolNames.length > 0) {
      for (const symbolName of symbolNames) {
        const symbolRefs = this.intelligenceEngine.findSymbol(symbolName);
        for (const ref of symbolRefs) {
          if (!files.includes(ref.filePath)) {
            files.push(ref.filePath);
          }
        }
      }
    }

    // Analyze dependencies for affected files
    if (files.length > 0) {
      for (const file of files) {
        const deps = this.intelligenceEngine.getDependencies(file);
        const dependents = this.intelligenceEngine.getDependents(file);

        deps.forEach(dep => {
          if (!dependencies.includes(dep)) {
            dependencies.push(dep);
          }
        });

        dependents.forEach(dep => {
          if (!dependencies.includes(dep)) {
            dependencies.push(dep);
          }
        });
      }
    }

    return { files, symbols, dependencies };
  }

  /**
   * Extract file patterns from request
   */
  private extractFilePatterns(request: string): string[] {
    const patterns: string[] = [];

    // Match file paths (e.g., src/tools/file.ts)
    const filePathRegex = /(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-z]{2,4})(?:\s|$)/g;
    let match;
    while ((match = filePathRegex.exec(request)) !== null) {
      patterns.push(match[1]);
    }

    // Match directory patterns (e.g., src/tools/)
    const dirPathRegex = /(?:^|\s)([a-zA-Z0-9_\-./]+\/)(?:\s|$)/g;
    while ((match = dirPathRegex.exec(request)) !== null) {
      patterns.push(match[1] + '**/*');
    }

    return patterns;
  }

  /**
   * Extract symbol names from request
   */
  private extractSymbolNames(request: string): string[] {
    const symbols: string[] = [];

    // Match PascalCase (classes, interfaces)
    const pascalCaseRegex = /\b([A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+)\b/g;
    let match;
    while ((match = pascalCaseRegex.exec(request)) !== null) {
      symbols.push(match[1]);
    }

    // Match camelCase (functions, variables)
    const camelCaseRegex = /\b([a-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+)\b/g;
    while ((match = camelCaseRegex.exec(request)) !== null) {
      symbols.push(match[1]);
    }

    return symbols;
  }

  /**
   * Assess task complexity
   */
  private assessComplexity(request: string, scope: TaskAnalysis['scope']): TaskAnalysis['complexity'] {
    let complexityScore = 0;

    // File count factor
    if (scope.files.length > 10) complexityScore += 3;
    else if (scope.files.length > 5) complexityScore += 2;
    else if (scope.files.length > 1) complexityScore += 1;

    // Dependency factor
    if (scope.dependencies.length > 20) complexityScore += 3;
    else if (scope.dependencies.length > 10) complexityScore += 2;
    else if (scope.dependencies.length > 5) complexityScore += 1;

    // Intent factor
    const complexIntents = ['refactor', 'move', 'extract', 'implement'];
    if (complexIntents.some(intent => request.toLowerCase().includes(intent))) {
      complexityScore += 2;
    }

    // Determine complexity level
    if (complexityScore >= 7) return 'very_complex';
    if (complexityScore >= 5) return 'complex';
    if (complexityScore >= 3) return 'moderate';
    return 'simple';
  }

  /**
   * Estimate number of steps required
   */
  private estimateSteps(intent: string, scope: TaskAnalysis['scope'], complexity: TaskAnalysis['complexity']): number {
    let baseSteps = 1;

    // Base steps by intent
    const intentSteps: Record<string, number> = {
      'refactor': 5,
      'move': 4,
      'extract': 3,
      'rename': 3,
      'create': 2,
      'modify': 2,
      'remove': 2,
      'analyze': 1
    };

    baseSteps = intentSteps[intent] || 2;

    // Multiply by file count
    const fileMultiplier = Math.min(scope.files.length, 5);
    baseSteps *= fileMultiplier;

    // Adjust by complexity
    const complexityMultipliers = {
      'simple': 1,
      'moderate': 1.5,
      'complex': 2,
      'very_complex': 3
    };

    return Math.ceil(baseSteps * complexityMultipliers[complexity]);
  }

  /**
   * Suggest an approach for the task
   */
  private suggestApproach(intent: string, _scope: TaskAnalysis['scope'], _complexity: TaskAnalysis['complexity']): string {
    const approaches: Record<string, string> = {
      'refactor': 'Analyze dependencies → Create new structure → Move code → Update imports → Validate',
      'move': 'Identify symbol → Extract code → Update imports → Validate references',
      'extract': 'Analyze code → Detect parameters → Create new function → Replace usage',
      'rename': 'Find all usages → Update references → Validate no breakage',
      'create': 'Analyze requirements → Generate code → Add to project → Validate',
      'remove': 'Find dependencies → Remove references → Delete files → Validate',
      'analyze': 'Scan codebase → Build dependency graph → Generate report'
    };

    return approaches[intent] || 'Analyze → Plan → Execute → Validate';
  }

  /**
   * Identify potential risks
   */
  private async identifyRisks(intent: string, scope: TaskAnalysis['scope']): Promise<string[]> {
    const risks: string[] = [];

    // Check for circular dependencies
    if (scope.dependencies.length > 0) {
      // This would use dependency analyzer to check for circular deps
      risks.push('Potential circular dependency issues');
    }

    // Check for high-impact files
    if (scope.files.some(f => f.includes('index.ts') || f.includes('main.ts'))) {
      risks.push('Modifying entry point files - high impact');
    }

    // Check for large scope
    if (scope.files.length > 10) {
      risks.push('Large scope - affects many files');
    }

    // Intent-specific risks
    if (intent === 'refactor') {
      risks.push('Refactoring may break existing functionality');
    }
    if (intent === 'move') {
      risks.push('Moving code may break import paths');
    }
    if (intent === 'remove') {
      risks.push('Deletion is irreversible without version control');
    }

    return risks;
  }

  /**
   * Identify required tools
   */
  private identifyRequiredTools(intent: string, _scope: TaskAnalysis['scope']): string[] {
    const tools: string[] = [];

    // Always need code context
    tools.push('code_context');

    // Intent-specific tools
    const intentTools: Record<string, string[]> = {
      'refactor': ['refactoring_assistant', 'dependency_analyzer', 'symbol_search'],
      'move': ['refactoring_assistant', 'code_context'],
      'extract': ['refactoring_assistant', 'code_aware_editor'],
      'rename': ['refactoring_assistant', 'symbol_search'],
      'create': ['code_aware_editor', 'str_replace_editor'],
      'modify': ['str_replace_editor', 'code_aware_editor'],
      'remove': ['multi_file_editor', 'dependency_analyzer'],
      'analyze': ['dependency_analyzer', 'symbol_search', 'code_context']
    };

    const specificTools = intentTools[intent] || ['str_replace_editor'];
    tools.push(...specificTools);

    return [...new Set(tools)]; // Remove duplicates
  }
}

