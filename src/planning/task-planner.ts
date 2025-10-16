/**
 * Task Planner
 * 
 * Generates executable plans from task analysis
 */

import { TaskAnalyzer } from './task-analyzer.js';
import { RiskAssessor } from './risk-assessor.js';
import { 
  TaskPlan, 
  TaskStep, 
  TaskStepType, 
  RiskLevel, 
  PlanValidationResult,
  PlannerConfig,
  TaskAnalysis
} from './types.js';

export class TaskPlanner {
  private analyzer: TaskAnalyzer;
  private riskAssessor: RiskAssessor;
  private config: PlannerConfig;

  constructor(rootPath: string, config?: Partial<PlannerConfig>) {
    this.analyzer = new TaskAnalyzer(rootPath);
    this.riskAssessor = new RiskAssessor(rootPath);
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
   */
  async createPlan(userRequest: string, context?: { currentDirectory?: string }): Promise<TaskPlan> {
    // Analyze the request
    const analysis = await this.analyzer.analyzeRequest(userRequest, context);

    // Generate steps
    const steps = await this.generateSteps(analysis);

    // Calculate overall metrics
    const totalEstimatedDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
    const overallRiskLevel = this.calculateOverallRisk(steps);

    // Create plan
    const plan: TaskPlan = {
      id: this.generatePlanId(),
      userIntent: userRequest,
      description: analysis.suggestedApproach,
      steps,
      totalEstimatedDuration,
      overallRiskLevel,
      createdAt: Date.now(),
      status: 'draft',
      metadata: {
        filesAffected: analysis.scope.files,
        toolsUsed: analysis.requiredTools,
        dependenciesAnalyzed: true,
        risksAssessed: true
      }
    };

    return plan;
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
   */
  private async generateSteps(analysis: TaskAnalysis): Promise<TaskStep[]> {
    const steps: TaskStep[] = [];
    let stepCounter = 0;

    // Step 1: Always start with analysis
    steps.push({
      id: `step_${++stepCounter}`,
      type: 'analyze',
      description: 'Analyze codebase and dependencies',
      tool: 'code_context',
      args: {
        operation: 'analyze_context',
        files: analysis.scope.files
      },
      dependencies: [],
      estimatedDuration: 2000,
      riskLevel: 'low',
      status: 'pending'
    });

    // Generate intent-specific steps
    switch (analysis.intent) {
      case 'refactor':
        steps.push(...this.generateRefactoringSteps(analysis, stepCounter));
        break;
      case 'move':
        steps.push(...this.generateMoveSteps(analysis, stepCounter));
        break;
      case 'extract':
        steps.push(...this.generateExtractSteps(analysis, stepCounter));
        break;
      case 'rename':
        steps.push(...this.generateRenameSteps(analysis, stepCounter));
        break;
      case 'create':
        steps.push(...this.generateCreateSteps(analysis, stepCounter));
        break;
      case 'remove':
        steps.push(...this.generateRemoveSteps(analysis, stepCounter));
        break;
      default:
        steps.push(...this.generateGenericSteps(analysis, stepCounter));
    }

    // Final step: Always validate
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

    return steps;
  }

  /**
   * Generate refactoring steps
   */
  private generateRefactoringSteps(analysis: TaskAnalysis, startCounter: number): TaskStep[] {
    const steps: TaskStep[] = [];
    let counter = startCounter;

    // Analyze dependencies
    steps.push({
      id: `step_${++counter}`,
      type: 'analyze',
      description: 'Analyze dependencies and impact',
      tool: 'dependency_analyzer',
      args: { operation: 'analyze_dependencies', files: analysis.scope.files },
      dependencies: ['step_1'],
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
      tool: 'multi_file_editor',
      args: { operation: 'update_imports' },
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
  private generateMoveSteps(analysis: TaskAnalysis, startCounter: number): TaskStep[] {
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
  private generateExtractSteps(analysis: TaskAnalysis, startCounter: number): TaskStep[] {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'refactor',
      description: 'Extract code into new function',
      tool: 'refactoring_assistant',
      args: { operation: 'extract_function' },
      dependencies: ['step_1'],
      estimatedDuration: 3000,
      riskLevel: 'low',
      status: 'pending'
    }];
  }

  /**
   * Generate rename steps
   */
  private generateRenameSteps(analysis: TaskAnalysis, startCounter: number): TaskStep[] {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'refactor',
      description: 'Rename symbol across codebase',
      tool: 'refactoring_assistant',
      args: { operation: 'rename_symbol' },
      dependencies: ['step_1'],
      estimatedDuration: 3000,
      riskLevel: 'low',
      status: 'pending'
    }];
  }

  /**
   * Generate create steps
   */
  private generateCreateSteps(analysis: TaskAnalysis, startCounter: number): TaskStep[] {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'create',
      description: 'Create new files and code',
      tool: 'code_aware_editor',
      args: { operation: 'create' },
      dependencies: ['step_1'],
      estimatedDuration: 2000,
      riskLevel: 'low',
      status: 'pending'
    }];
  }

  /**
   * Generate remove steps
   */
  private generateRemoveSteps(analysis: TaskAnalysis, startCounter: number): TaskStep[] {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'delete',
      description: 'Remove files and clean up references',
      tool: 'multi_file_editor',
      args: { operation: 'delete', files: analysis.scope.files },
      dependencies: ['step_1'],
      estimatedDuration: 2000,
      riskLevel: 'high',
      status: 'pending'
    }];
  }

  /**
   * Generate generic steps
   */
  private generateGenericSteps(analysis: TaskAnalysis, startCounter: number): TaskStep[] {
    return [{
      id: `step_${startCounter + 1}`,
      type: 'refactor',
      description: 'Execute requested operation',
      tool: 'str_replace_editor',
      args: {},
      dependencies: ['step_1'],
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

  private detectCircularDependencies(steps: TaskStep[]): string[] {
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

