/**
 * Task Orchestrator
 * 
 * Main interface for intelligent task planning and execution
 */

import { EventEmitter } from 'events';
import { TaskAnalyzer } from './task-analyzer.js';
import { TaskPlanner } from './task-planner.js';
import { RiskAssessor } from './risk-assessor.js';
import { PlanExecutor } from './plan-executor.js';
import { 
  TaskPlan, 
  PlanValidationResult, 
  PlanExecutionProgress,
  PlannerConfig,
  TaskAnalysis
} from './types.js';

export interface OrchestratorResult {
  success: boolean;
  plan: TaskPlan;
  validation: PlanValidationResult;
  analysis: TaskAnalysis;
  executionTime?: number;
  error?: string;
}

export class TaskOrchestrator extends EventEmitter {
  private analyzer: TaskAnalyzer;
  private planner: TaskPlanner;
  private riskAssessor: RiskAssessor;
  private executor: PlanExecutor;
  private rootPath: string;
  private config: PlannerConfig;

  constructor(rootPath: string, config?: Partial<PlannerConfig>) {
    super();
    this.rootPath = rootPath;
    this.config = {
      maxSteps: 50,
      maxDuration: 300000,
      allowRiskyOperations: false,
      requireConfirmation: true,
      autoRollbackOnFailure: true,
      parallelExecution: false,
      maxParallelSteps: 3,
      ...config
    };

    this.analyzer = new TaskAnalyzer(rootPath);
    this.planner = new TaskPlanner(rootPath, this.config);
    this.riskAssessor = new RiskAssessor(rootPath);
    this.executor = new PlanExecutor(this.config);

    // Forward executor events
    this.executor.on('progress', (progress: PlanExecutionProgress) => {
      this.emit('progress', progress);
    });
  }

  /**
   * Plan and execute a task from user request
   */
  async planAndExecute(
    userRequest: string, 
    toolExecutor: (toolName: string, args: any) => Promise<any>,
    context?: { currentDirectory?: string }
  ): Promise<OrchestratorResult> {
    const startTime = Date.now();

    try {
      // Step 1: Analyze the request
      this.emit('phase', { phase: 'analyzing', message: 'Analyzing request...' });
      const analysis = await this.analyzer.analyzeRequest(userRequest, context);
      
      this.emit('analysis', analysis);

      // Step 2: Create plan
      this.emit('phase', { phase: 'planning', message: 'Creating execution plan...' });
      const plan = await this.planner.createPlan(userRequest, context);
      
      this.emit('plan', plan);

      // Step 3: Validate plan
      this.emit('phase', { phase: 'validating', message: 'Validating plan...' });
      const validation = await this.planner.validatePlan(plan);
      
      this.emit('validation', validation);

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

      // Check if confirmation required
      if (this.config.requireConfirmation && (plan.overallRiskLevel === 'high' || plan.overallRiskLevel === 'critical')) {
        this.emit('confirmation_required', { plan, validation });
        // In real implementation, would wait for user confirmation
        // For now, we'll proceed
      }

      // Step 4: Execute plan
      this.emit('phase', { phase: 'executing', message: 'Executing plan...' });
      plan.status = 'validated';
      
      const success = await this.executor.executePlan(plan, toolExecutor);

      const executionTime = Date.now() - startTime;

      return {
        success,
        plan,
        validation,
        analysis,
        executionTime
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      return {
        success: false,
        plan: {} as TaskPlan,
        validation: { isValid: false, errors: [error.message], warnings: [], suggestions: [], estimatedSuccessRate: 0 },
        analysis: {} as TaskAnalysis,
        executionTime,
        error: error.message
      };
    }
  }

  /**
   * Create a plan without executing it
   */
  async createPlan(userRequest: string, context?: { currentDirectory?: string }): Promise<{
    plan: TaskPlan;
    validation: PlanValidationResult;
    analysis: TaskAnalysis;
  }> {
    const analysis = await this.analyzer.analyzeRequest(userRequest, context);
    const plan = await this.planner.createPlan(userRequest, context);
    const validation = await this.planner.validatePlan(plan);

    return { plan, validation, analysis };
  }

  /**
   * Execute an existing plan
   */
  async executePlan(
    plan: TaskPlan,
    toolExecutor: (toolName: string, args: any) => Promise<any>
  ): Promise<boolean> {
    return await this.executor.executePlan(plan, toolExecutor);
  }

  /**
   * Get plan preview as formatted string
   */
  formatPlanPreview(plan: TaskPlan, validation: PlanValidationResult): string {
    let output = '';

    output += `\n📋 Task Plan: ${plan.userIntent}\n`;
    output += `${'='.repeat(60)}\n\n`;

    output += `Description: ${plan.description}\n`;
    output += `Total Steps: ${plan.steps.length}\n`;
    output += `Estimated Duration: ${Math.round(plan.totalEstimatedDuration / 1000)}s\n`;
    output += `Risk Level: ${this.formatRiskLevel(plan.overallRiskLevel)}\n`;
    output += `Files Affected: ${plan.metadata.filesAffected.length}\n\n`;

    output += `Steps:\n`;
    output += `${'-'.repeat(60)}\n`;
    
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      output += `${i + 1}. [${step.type.toUpperCase()}] ${step.description}\n`;
      output += `   Tool: ${step.tool}\n`;
      output += `   Risk: ${this.formatRiskLevel(step.riskLevel)}\n`;
      output += `   Duration: ~${Math.round(step.estimatedDuration / 1000)}s\n`;
      if (step.dependencies.length > 0) {
        output += `   Dependencies: ${step.dependencies.join(', ')}\n`;
      }
      output += `\n`;
    }

    output += `\nValidation:\n`;
    output += `${'-'.repeat(60)}\n`;
    output += `Valid: ${validation.isValid ? '✅ Yes' : '❌ No'}\n`;
    output += `Success Rate: ${validation.estimatedSuccessRate}%\n`;

    if (validation.errors.length > 0) {
      output += `\n❌ Errors:\n`;
      validation.errors.forEach(err => output += `  - ${err}\n`);
    }

    if (validation.warnings.length > 0) {
      output += `\n⚠️  Warnings:\n`;
      validation.warnings.forEach(warn => output += `  - ${warn}\n`);
    }

    if (validation.suggestions.length > 0) {
      output += `\n💡 Suggestions:\n`;
      validation.suggestions.forEach(sug => output += `  - ${sug}\n`);
    }

    return output;
  }

  /**
   * Format risk level with emoji
   */
  private formatRiskLevel(level: string): string {
    const icons: Record<string, string> = {
      'low': '🟢 Low',
      'medium': '🟡 Medium',
      'high': '🟠 High',
      'critical': '🔴 Critical'
    };
    return icons[level] || level;
  }

  /**
   * Format progress update
   */
  formatProgress(progress: PlanExecutionProgress): string {
    const percentage = Math.round((progress.completedSteps / progress.totalSteps) * 100);
    const bar = this.createProgressBar(percentage);
    
    let output = `\n📊 Progress: ${progress.completedSteps}/${progress.totalSteps} steps (${percentage}%)\n`;
    output += `${bar}\n`;
    output += `Current: ${progress.currentStepDescription}\n`;
    output += `Elapsed: ${Math.round(progress.elapsedTime / 1000)}s\n`;
    output += `Remaining: ~${Math.round(progress.estimatedTimeRemaining / 1000)}s\n`;
    
    if (progress.failedSteps > 0) {
      output += `❌ Failed: ${progress.failedSteps}\n`;
    }

    return output;
  }

  /**
   * Create progress bar
   */
  private createProgressBar(percentage: number, width: number = 40): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${' '.repeat(empty)}] ${percentage}%`;
  }

  /**
   * Get configuration
   */
  getConfig(): PlannerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PlannerConfig>): void {
    this.config = { ...this.config, ...config };
    this.planner = new TaskPlanner(this.rootPath, this.config);
    this.executor = new PlanExecutor(this.config);
  }
}

