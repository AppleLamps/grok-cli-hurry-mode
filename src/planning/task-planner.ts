/**
 * Task Planner
 * 
 * Generates executable plans from task analysis
 */

import { TaskAnalyzer } from './task-analyzer.js';
import { RiskAssessor } from './risk-assessor.js';
import { CodeIntelligenceEngine } from '../tools/intelligence/engine.js';
import {
  TaskPlan,
  TaskStep,
  RiskLevel,
  PlanValidationResult,
  PlannerConfig,
  TaskAnalysis
} from './types.js';

export class TaskPlanner {
  private analyzer: TaskAnalyzer;
  private riskAssessor: RiskAssessor;
  private intelligenceEngine: CodeIntelligenceEngine;
  private config: PlannerConfig;
  private rootPath: string;

  constructor(rootPath: string, config?: Partial<PlannerConfig>) {
    this.rootPath = rootPath;
    this.analyzer = new TaskAnalyzer(rootPath);
    this.riskAssessor = new RiskAssessor(rootPath);
    this.intelligenceEngine = new CodeIntelligenceEngine(rootPath);
    this.config = {
      maxSteps: 50,
      maxDuration: 300000, // 5 minutes
      allowRiskyOperations: false,
      requireConfirmation: true,
      autoRollbackOnFailure: true,
      parallelExecution: false,
      maxParallelSteps: 3,
      ...config
    };
  }

  /**
   * Create a plan from user request
   * Now leverages CodeIntelligenceEngine for context-aware planning
   */
  async createPlan(userRequest: string, context?: { currentDirectory?: string }): Promise<TaskPlan> {
    // Initialize intelligence engine if not already done
    if (!this.intelligenceEngine['isInitialized']) {
      await this.intelligenceEngine.initialize();
    }

    // Analyze the request
    const analysis = await this.analyzer.analyzeRequest(userRequest, context);

    // Enhance analysis with code intelligence
    const enhancedAnalysis = await this.enhanceAnalysisWithIntelligence(analysis, userRequest);

    // Generate steps using enhanced analysis
    const steps = await this.generateSteps(enhancedAnalysis, userRequest);

    // Calculate overall metrics
    const totalEstimatedDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
    const overallRiskLevel = this.calculateOverallRisk(steps);

    // Create plan
    const plan: TaskPlan = {
      id: this.generatePlanId(),
      userIntent: userRequest,
      description: enhancedAnalysis.suggestedApproach,
      steps,
      totalEstimatedDuration,
      overallRiskLevel,
      createdAt: Date.now(),
      status: 'draft',
      metadata: {
        filesAffected: enhancedAnalysis.scope.files,
        toolsUsed: enhancedAnalysis.requiredTools,
        dependenciesAnalyzed: true,
        risksAssessed: true
      }
    };

    return plan;
  }

  /**
   * Enhance task analysis with code intelligence
   * Uses symbol search and dependency analysis to find relevant files
   */
  private async enhanceAnalysisWithIntelligence(
    analysis: TaskAnalysis,
    userRequest: string
  ): Promise<TaskAnalysis> {
    const enhancedScope = { ...analysis.scope };

    // Extract keywords from user request for symbol search
    const keywords = this.extractKeywords(userRequest);

    // Find relevant files using symbol search
    if (keywords.length > 0) {
      const relevantFiles = await this.findRelevantFiles(keywords, analysis.intent);
      enhancedScope.files = [...new Set([...enhancedScope.files, ...relevantFiles])];
    }

    // If this is an endpoint-related task, find route/controller/service files
    if (this.isEndpointRelated(userRequest)) {
      const endpointFiles = await this.findEndpointRelatedFiles(userRequest);
      enhancedScope.files = [...new Set([...enhancedScope.files, ...endpointFiles.files])];
      enhancedScope.symbols = [...new Set([...enhancedScope.symbols, ...endpointFiles.symbols])];
    }

    // Analyze dependencies for affected files
    if (enhancedScope.files.length > 0) {
      const dependencies = await this.analyzeDependencies(enhancedScope.files);
      enhancedScope.dependencies = dependencies;
    }

    return {
      ...analysis,
      scope: enhancedScope
    };
  }

  /**
   * Extract keywords from user request for symbol search
   */
  private extractKeywords(request: string): string[] {
    const keywords: string[] = [];
    const lowerRequest = request.toLowerCase();

    // Extract quoted strings as exact keywords
    const quotedMatches = request.match(/"([^"]+)"|'([^']+)'/g);
    if (quotedMatches) {
      keywords.push(...quotedMatches.map(m => m.replace(/['"]/g, '')));
    }

    // Extract camelCase/PascalCase identifiers
    const identifierMatches = request.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)*\b|\b[a-z]+(?:[A-Z][a-z]+)+\b/g);
    if (identifierMatches) {
      keywords.push(...identifierMatches);
    }

    // Extract common code-related terms
    const codeTerms = ['route', 'controller', 'service', 'model', 'component', 'function', 'class', 'interface'];
    for (const term of codeTerms) {
      if (lowerRequest.includes(term)) {
        keywords.push(term);
      }
    }

    return [...new Set(keywords)];
  }

  /**
   * Check if request is endpoint-related
   */
  private isEndpointRelated(request: string): boolean {
    const endpointKeywords = ['endpoint', 'route', 'api', '/users', '/api', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const lowerRequest = request.toLowerCase();
    return endpointKeywords.some(keyword => lowerRequest.includes(keyword.toLowerCase()));
  }

  /**
   * Find files related to endpoint creation/modification
   */
  private async findEndpointRelatedFiles(request: string): Promise<{ files: string[]; symbols: string[] }> {
    const files: string[] = [];
    const symbols: string[] = [];

    try {
      // Search for route files
      const routeResults = this.intelligenceEngine.findSymbolByPattern('route', false);
      files.push(...routeResults.map((r: any) => r.filePath));

      // Search for controller files
      const controllerResults = this.intelligenceEngine.findSymbolByPattern('controller', false);
      files.push(...controllerResults.map((r: any) => r.filePath));
      symbols.push(...controllerResults.map((r: any) => r.symbol.name));

      // Search for service files
      const serviceResults = this.intelligenceEngine.findSymbolByPattern('service', false);
      files.push(...serviceResults.map((r: any) => r.filePath));
      symbols.push(...serviceResults.map((r: any) => r.symbol.name));

      // Extract specific endpoint path if mentioned (e.g., /users/:id)
      const pathMatch = request.match(/\/[\w/:]+/);
      if (pathMatch) {
        const pathParts = pathMatch[0].split('/').filter(Boolean);
        for (const part of pathParts) {
          const results = this.intelligenceEngine.findSymbolByPattern(part, false);
          files.push(...results.map((r: any) => r.filePath));
          symbols.push(...results.map((r: any) => r.symbol.name));
        }
      }
    } catch (error) {
      console.warn('Error finding endpoint-related files:', error);
    }

    return {
      files: [...new Set(files)],
      symbols: [...new Set(symbols)]
    };
  }

  /**
   * Find relevant files using symbol search
   */
  private async findRelevantFiles(keywords: string[], _intent: string): Promise<string[]> {
    const files: string[] = [];

    try {
      for (const keyword of keywords) {
        const results = this.intelligenceEngine.findSymbolByPattern(keyword, false);
        files.push(...results.map((r: any) => r.filePath));
      }
    } catch (error) {
      console.warn('Error finding relevant files:', error);
    }

    return [...new Set(files)];
  }

  /**
   * Analyze dependencies for given files
   */
  private async analyzeDependencies(files: string[]): Promise<string[]> {
    const dependencies: string[] = [];

    try {
      for (const file of files) {
        const deps = this.intelligenceEngine.getDependencies(file);
        dependencies.push(...Array.from(deps));
      }
    } catch (error) {
      console.warn('Error analyzing dependencies:', error);
    }

    return [...new Set(dependencies)];
  }

  /**
   * Validate a plan before execution
   */
  async validatePlan(plan: TaskPlan): Promise<PlanValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check step count
    if (plan.steps.length > this.config.maxSteps) {
      errors.push(`Plan has ${plan.steps.length} steps, exceeds maximum of ${this.config.maxSteps}`);
    }

    // Check duration
    if (plan.totalEstimatedDuration > this.config.maxDuration) {
      warnings.push(`Estimated duration ${Math.round(plan.totalEstimatedDuration / 1000)}s exceeds recommended ${Math.round(this.config.maxDuration / 1000)}s`);
    }

    // Check risk level
    if (plan.overallRiskLevel === 'critical' && !this.config.allowRiskyOperations) {
      errors.push('Plan contains critical risk operations which are not allowed');
    }
    if (plan.overallRiskLevel === 'high') {
      warnings.push('Plan contains high-risk operations - proceed with caution');
    }

    // Check for circular dependencies in steps
    const circularDeps = this.detectCircularDependencies(plan.steps);
    if (circularDeps.length > 0) {
      errors.push(`Circular dependencies detected: ${circularDeps.join(', ')}`);
    }

    // Check for missing dependencies
    const missingDeps = this.detectMissingDependencies(plan.steps);
    if (missingDeps.length > 0) {
      errors.push(`Steps reference non-existent dependencies: ${missingDeps.join(', ')}`);
    }

    // Suggestions
    if (plan.steps.length > 10) {
      suggestions.push('Consider breaking this into smaller tasks');
    }
    if (plan.overallRiskLevel !== 'low') {
      suggestions.push('Review the plan carefully before execution');
      suggestions.push('Ensure you have version control or backups');
    }

    // Calculate success rate
    const estimatedSuccessRate = this.estimateSuccessRate(plan, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      estimatedSuccessRate
    };
  }

  /**
   * Generate steps from analysis
   * Now creates concrete, executable tool calls with specific file paths
   */
  private async generateSteps(analysis: TaskAnalysis, userRequest: string): Promise<TaskStep[]> {
    const steps: TaskStep[] = [];
    let stepCounter = 0;

    // Step 1: Always start with analysis if files are involved
    if (analysis.scope.files.length > 0) {
      steps.push({
        id: `step_${++stepCounter}`,
        type: 'analyze',
        description: `Analyze ${analysis.scope.files.length} affected files and dependencies`,
        tool: 'code_context',
        args: {
          operation: 'analyze_context',
          files: analysis.scope.files.slice(0, 10) // Limit to first 10 files
        },
        dependencies: [],
        estimatedDuration: 2000,
        riskLevel: 'low',
        status: 'pending'
      });
    }

    // Generate intent-specific steps with concrete tool calls
    switch (analysis.intent) {
      case 'refactor':
        steps.push(...await this.generateRefactoringSteps(analysis, stepCounter, userRequest));
        break;
      case 'move':
        steps.push(...await this.generateMoveSteps(analysis, stepCounter, userRequest));
        break;
      case 'extract':
        steps.push(...await this.generateExtractSteps(analysis, stepCounter, userRequest));
        break;
      case 'rename':
        steps.push(...await this.generateRenameSteps(analysis, stepCounter, userRequest));
        break;
      case 'create':
        steps.push(...await this.generateCreateSteps(analysis, stepCounter, userRequest));
        break;
      case 'remove':
        steps.push(...await this.generateRemoveSteps(analysis, stepCounter, userRequest));
        break;
      case 'implement':
      case 'generate':
        // For endpoint creation, use specialized generation
        if (this.isEndpointRelated(userRequest)) {
          steps.push(...await this.generateEndpointSteps(analysis, stepCounter, userRequest));
        } else {
          steps.push(...await this.generateGenericSteps(analysis, stepCounter, userRequest));
        }
        break;
      default:
        steps.push(...await this.generateGenericSteps(analysis, stepCounter, userRequest));
    }

    // Final step: Always validate if we made changes
    if (steps.length > 1) {
      steps.push({
        id: `step_${steps.length + 1}`,
        type: 'validate',
        description: 'Validate changes and check for errors',
        tool: 'dependency_analyzer',
        args: {
          operation: 'analyze_dependencies',
          rootPath: '.'
        },
        dependencies: steps.map(s => s.id),
        estimatedDuration: 3000,
        riskLevel: 'low',
        status: 'pending'
      });
    }

    return steps;
  }

  /**
   * Generate steps for endpoint creation (e.g., "Add a new /users/:id endpoint")
   */
  private async generateEndpointSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    userRequest: string
  ): Promise<TaskStep[]> {
    const steps: TaskStep[] = [];
    let counter = startCounter;

    // Extract endpoint details from request
    const pathMatch = userRequest.match(/\/[\w/:]+/);
    const methodMatch = userRequest.match(/\b(GET|POST|PUT|DELETE|PATCH)\b/i);
    const endpointPath = pathMatch ? pathMatch[0] : '/api/resource';
    const httpMethod = methodMatch ? methodMatch[0].toUpperCase() : 'GET';

    // Find route, controller, and service files
    const routeFiles = analysis.scope.files.filter(f =>
      f.includes('route') || f.includes('router')
    );
    const controllerFiles = analysis.scope.files.filter(f =>
      f.includes('controller') || f.includes('handler')
    );
    const serviceFiles = analysis.scope.files.filter(f =>
      f.includes('service') || f.includes('repository')
    );

    // Step 1: Modify router file to add the new endpoint
    if (routeFiles.length > 0) {
      steps.push({
        id: `step_${++counter}`,
        type: 'create',
        description: `Add ${httpMethod} ${endpointPath} route to ${routeFiles[0]}`,
        tool: 'multi_file_edit',
        args: {
          operation: 'execute_multi_file',
          operations: [{
            type: 'edit',
            filePath: routeFiles[0],
            description: `Add new ${httpMethod} route for ${endpointPath}`
          }],
          description: `Add ${httpMethod} ${endpointPath} endpoint to router`
        },
        dependencies: analysis.scope.files.length > 0 ? ['step_1'] : [],
        estimatedDuration: 3000,
        riskLevel: 'low',
        status: 'pending'
      });
    }

    // Step 2: Create/modify controller function
    if (controllerFiles.length > 0) {
      const functionName = this.generateFunctionName(endpointPath, httpMethod);
      steps.push({
        id: `step_${++counter}`,
        type: 'create',
        description: `Create ${functionName} function in ${controllerFiles[0]}`,
        tool: 'code_analysis',
        args: {
          operation: 'smart_insert',
          file_path: controllerFiles[0],
          code: `// Controller function for ${httpMethod} ${endpointPath}`,
          location: 'end',
          target: functionName
        },
        dependencies: [`step_${counter - 1}`],
        estimatedDuration: 4000,
        riskLevel: 'medium',
        status: 'pending'
      });
    }

    // Step 3: Create/modify service method
    if (serviceFiles.length > 0) {
      const methodName = this.generateServiceMethodName(endpointPath, httpMethod);
      steps.push({
        id: `step_${++counter}`,
        type: 'create',
        description: `Add ${methodName} method to ${serviceFiles[0]}`,
        tool: 'code_analysis',
        args: {
          operation: 'smart_insert',
          file_path: serviceFiles[0],
          code: `// Service method for ${httpMethod} ${endpointPath}`,
          location: 'end',
          target: methodName
        },
        dependencies: [`step_${counter - 1}`],
        estimatedDuration: 4000,
        riskLevel: 'medium',
        status: 'pending'
      });
    }

    // Step 4: Update imports if needed
    if (routeFiles.length > 0 && controllerFiles.length > 0) {
      steps.push({
        id: `step_${++counter}`,
        type: 'refactor',
        description: 'Update import statements in affected files',
        tool: 'code_analysis',
        args: {
          operation: 'add_imports',
          file_path: routeFiles[0],
          symbols: [this.generateFunctionName(endpointPath, httpMethod)]
        },
        dependencies: [`step_${counter - 1}`],
        estimatedDuration: 2000,
        riskLevel: 'low',
        status: 'pending'
      });
    }

    return steps;
  }

  /**
   * Generate function name from endpoint path and HTTP method
   */
  private generateFunctionName(path: string, method: string): string {
    const parts = path.split('/').filter(Boolean);
    const resource = parts[parts.length - 1]?.replace(/[^a-zA-Z0-9]/g, '') || 'resource';
    const action = method.toLowerCase();

    if (action === 'get' && path.includes(':')) {
      return `get${this.capitalize(resource)}ById`;
    } else if (action === 'get') {
      return `get${this.capitalize(resource)}s`;
    } else if (action === 'post') {
      return `create${this.capitalize(resource)}`;
    } else if (action === 'put' || action === 'patch') {
      return `update${this.capitalize(resource)}`;
    } else if (action === 'delete') {
      return `delete${this.capitalize(resource)}`;
    }

    return `${action}${this.capitalize(resource)}`;
  }

  /**
   * Generate service method name from endpoint path and HTTP method
   */
  private generateServiceMethodName(path: string, method: string): string {
    const parts = path.split('/').filter(Boolean);
    const resource = parts[parts.length - 1]?.replace(/[^a-zA-Z0-9]/g, '') || 'resource';
    const action = method.toLowerCase();

    if (action === 'get' && path.includes(':')) {
      return `find${this.capitalize(resource)}ById`;
    } else if (action === 'get') {
      return `findAll${this.capitalize(resource)}s`;
    } else if (action === 'post') {
      return `create${this.capitalize(resource)}`;
    } else if (action === 'put' || action === 'patch') {
      return `update${this.capitalize(resource)}`;
    } else if (action === 'delete') {
      return `delete${this.capitalize(resource)}`;
    }

    return `${action}${this.capitalize(resource)}`;
  }

  /**
   * Capitalize first letter of string
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Generate refactoring steps
   */
  private async generateRefactoringSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    _userRequest: string
  ): Promise<TaskStep[]> {
    const steps: TaskStep[] = [];
    let counter = startCounter;

    // Analyze dependencies
    steps.push({
      id: `step_${++counter}`,
      type: 'analyze',
      description: 'Analyze dependencies and impact',
      tool: 'dependency_analyzer',
      args: { operation: 'analyze_dependencies', files: analysis.scope.files },
      dependencies: analysis.scope.files.length > 0 ? ['step_1'] : [],
      estimatedDuration: 3000,
      riskLevel: 'low',
      status: 'pending'
    });

    // Plan refactoring
    steps.push({
      id: `step_${++counter}`,
      type: 'refactor',
      description: 'Execute refactoring operations',
      tool: 'refactoring_assistant',
      args: { operation: 'refactor', scope: analysis.scope },
      dependencies: [`step_${counter - 1}`],
      estimatedDuration: 5000,
      riskLevel: 'medium',
      status: 'pending'
    });

    // Update imports
    steps.push({
      id: `step_${++counter}`,
      type: 'refactor',
      description: 'Update import statements',
      tool: 'multi_file_edit',
      args: {
        operation: 'execute_multi_file',
        operations: analysis.scope.files.map(file => ({
          type: 'edit',
          filePath: file,
          description: 'Update imports after refactoring'
        })),
        description: 'Update imports in affected files'
      },
      dependencies: [`step_${counter - 1}`],
      estimatedDuration: 2000,
      riskLevel: 'low',
      status: 'pending'
    });

    return steps;
  }

  /**
   * Generate move steps
   */
  private async generateMoveSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    _userRequest: string
  ): Promise<TaskStep[]> {
    const steps: TaskStep[] = [];
    let counter = startCounter;

    for (const symbol of analysis.scope.symbols) {
      steps.push({
        id: `step_${++counter}`,
        type: 'move',
        description: `Move ${symbol} to new location`,
        tool: 'refactoring_assistant',
        args: { operation: 'move_function', symbolName: symbol },
        dependencies: ['step_1'],
        estimatedDuration: 4000,
        riskLevel: 'medium',
        status: 'pending'
      });
    }

    return steps;
  }

  /**
   * Generate extract steps
   */
  private async generateExtractSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    _userRequest: string
  ): Promise<TaskStep[]> {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'refactor',
      description: 'Extract code into new function',
      tool: 'refactoring_assistant',
      args: { operation: 'extract_function' },
      dependencies: analysis.scope.files.length > 0 ? ['step_1'] : [],
      estimatedDuration: 3000,
      riskLevel: 'low',
      status: 'pending'
    }];
  }

  /**
   * Generate rename steps
   */
  private async generateRenameSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    _userRequest: string
  ): Promise<TaskStep[]> {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'refactor',
      description: 'Rename symbol across codebase',
      tool: 'refactoring_assistant',
      args: { operation: 'rename_symbol' },
      dependencies: analysis.scope.files.length > 0 ? ['step_1'] : [],
      estimatedDuration: 3000,
      riskLevel: 'low',
      status: 'pending'
    }];
  }

  /**
   * Generate create steps
   */
  private async generateCreateSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    _userRequest: string
  ): Promise<TaskStep[]> {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'create',
      description: 'Create new files and code',
      tool: 'code_analysis',
      args: { operation: 'smart_insert' },
      dependencies: analysis.scope.files.length > 0 ? ['step_1'] : [],
      estimatedDuration: 2000,
      riskLevel: 'low',
      status: 'pending'
    }];
  }

  /**
   * Generate remove steps
   */
  private async generateRemoveSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    _userRequest: string
  ): Promise<TaskStep[]> {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'delete',
      description: 'Remove files and clean up references',
      tool: 'multi_file_edit',
      args: {
        operation: 'execute_multi_file',
        operations: analysis.scope.files.map(file => ({
          type: 'delete',
          filePath: file
        })),
        description: 'Remove files and clean up'
      },
      dependencies: analysis.scope.files.length > 0 ? ['step_1'] : [],
      estimatedDuration: 2000,
      riskLevel: 'high',
      status: 'pending'
    }];
  }

  /**
   * Generate generic steps
   */
  private async generateGenericSteps(
    analysis: TaskAnalysis,
    startCounter: number,
    _userRequest: string
  ): Promise<TaskStep[]> {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'refactor',
      description: 'Execute requested operation',
      tool: 'str_replace_editor',
      args: {},
      dependencies: analysis.scope.files.length > 0 ? ['step_1'] : [],
      estimatedDuration: 3000,
      riskLevel: 'medium',
      status: 'pending'
    }];
  }

  // Helper methods
  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private calculateOverallRisk(steps: TaskStep[]): RiskLevel {
    const riskScores = { low: 1, medium: 2, high: 3, critical: 4 };
    const maxRisk = Math.max(...steps.map(s => riskScores[s.riskLevel]));

    if (maxRisk >= 4) return 'critical';
    if (maxRisk >= 3) return 'high';
    if (maxRisk >= 2) return 'medium';
    return 'low';
  }

  private detectCircularDependencies(_steps: TaskStep[]): string[] {
    // Simple cycle detection - would need more sophisticated algorithm for production
    return [];
  }

  private detectMissingDependencies(steps: TaskStep[]): string[] {
    const stepIds = new Set(steps.map(s => s.id));
    const missing: string[] = [];

    for (const step of steps) {
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          missing.push(`${step.id} -> ${depId}`);
        }
      }
    }

    return missing;
  }

  private estimateSuccessRate(plan: TaskPlan, errors: string[], warnings: string[]): number {
    let rate = 100;

    rate -= errors.length * 20;
    rate -= warnings.length * 5;

    if (plan.overallRiskLevel === 'critical') rate -= 30;
    else if (plan.overallRiskLevel === 'high') rate -= 15;
    else if (plan.overallRiskLevel === 'medium') rate -= 5;

    return Math.max(0, Math.min(100, rate));
  }
}

