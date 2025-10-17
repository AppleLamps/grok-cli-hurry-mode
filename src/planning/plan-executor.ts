/**
 * Plan Executor
 * 
 * Executes task plans with progress tracking and rollback support
 */

import { EventEmitter } from 'events';
import {
  TaskPlan,
  TaskStep,
  PlanExecutionProgress,
  StepExecutionResult,
  RollbackPoint,
  PlannerConfig
} from './types.js';
import { OperationHistoryTool } from '../tools/advanced/operation-history.js';
import * as fs from 'fs';

export class PlanExecutor extends EventEmitter {
  private operationHistory: OperationHistoryTool;
  private rollbackPoints: Map<string, RollbackPoint> = new Map();
  private config: PlannerConfig;

  constructor(config?: Partial<PlannerConfig>) {
    super();
    this.operationHistory = new OperationHistoryTool();
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
  }

  /**
   * Execute a task plan
   */
  async executePlan(plan: TaskPlan, toolExecutor: (toolName: string, args: any) => Promise<any>): Promise<boolean> {
    plan.status = 'executing';
    plan.startedAt = Date.now();

    const startTime = Date.now();
    let completedSteps = 0;
    let failedSteps = 0;

    try {
      // Execute steps in dependency order
      const executionOrder = this.determineExecutionOrder(plan.steps);

      for (let i = 0; i < executionOrder.length; i++) {
        const step = executionOrder[i];

        // Emit progress
        this.emitProgress(plan, i, executionOrder.length, completedSteps, failedSteps, startTime);

        // Create rollback point before execution
        await this.createRollbackPoint(step);

        // Execute step
        const result = await this.executeStep(step, toolExecutor);

        if (result.success) {
          step.status = 'completed';
          step.result = result.output;
          completedSteps++;

          // Record in operation history
          await this.recordOperation(step, result);
        } else {
          step.status = 'failed';
          step.error = result.error;
          failedSteps++;

          // Handle failure
          if (this.config.autoRollbackOnFailure) {
            await this.rollbackPlan(plan, i);
            plan.status = 'rolled_back';
            return false;
          } else {
            plan.status = 'failed';
            return false;
          }
        }
      }

      plan.status = 'completed';
      plan.completedAt = Date.now();
      return true;

    } catch (error: any) {
      plan.status = 'failed';

      if (this.config.autoRollbackOnFailure) {
        await this.rollbackPlan(plan, plan.steps.length);
        plan.status = 'rolled_back';
      }

      throw error;
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(step: TaskStep, toolExecutor: (toolName: string, args: any) => Promise<any>): Promise<StepExecutionResult> {
    step.status = 'running';
    step.startTime = Date.now();

    try {
      // Execute the tool
      const output = await toolExecutor(step.tool, step.args);

      step.endTime = Date.now();
      const duration = step.endTime - step.startTime;

      return {
        stepId: step.id,
        success: true,
        output,
        duration,
        filesModified: this.extractModifiedFiles(output)
      };

    } catch (error: any) {
      step.endTime = Date.now();
      const duration = step.endTime - step.startTime;

      return {
        stepId: step.id,
        success: false,
        error: error.message,
        duration,
        filesModified: []
      };
    }
  }

  /**
   * Determine execution order based on dependencies
   */
  private determineExecutionOrder(steps: TaskStep[]): TaskStep[] {
    const ordered: TaskStep[] = [];
    const completed = new Set<string>();
    const remaining = [...steps];

    while (remaining.length > 0) {
      const canExecute = remaining.filter(step =>
        step.dependencies.every(depId => completed.has(depId))
      );

      if (canExecute.length === 0) {
        throw new Error('Circular dependency detected or invalid dependencies');
      }

      // Execute steps with no pending dependencies
      for (const step of canExecute) {
        ordered.push(step);
        completed.add(step.id);
        remaining.splice(remaining.indexOf(step), 1);
      }
    }

    return ordered;
  }

  /**
   * Create rollback point before step execution
   */
  private async createRollbackPoint(step: TaskStep): Promise<void> {
    const fileSnapshots = new Map<string, string>();

    // Get files that might be affected
    const affectedFiles = this.getAffectedFiles(step);

    // Create snapshots
    for (const filePath of affectedFiles) {
      try {
        if (fs.existsSync(filePath)) {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          fileSnapshots.set(filePath, content);
        }
      } catch {
        // File might not exist yet, skip
      }
    }

    this.rollbackPoints.set(step.id, {
      stepId: step.id,
      timestamp: Date.now(),
      fileSnapshots,
      metadata: { ...step.args }
    });
  }

  /**
   * Rollback plan to a specific step
   */
  private async rollbackPlan(plan: TaskPlan, failedStepIndex: number): Promise<void> {
    // Rollback steps in reverse order
    for (let i = failedStepIndex - 1; i >= 0; i--) {
      const step = plan.steps[i];
      const rollbackPoint = this.rollbackPoints.get(step.id);

      if (rollbackPoint) {
        await this.rollbackStep(rollbackPoint);
        step.status = 'rolled_back';
      }
    }

    this.rollbackPoints.clear();
  }

  /**
   * Rollback a single step
   */
  private async rollbackStep(rollbackPoint: RollbackPoint): Promise<void> {
    // Restore file snapshots
    for (const [filePath, content] of rollbackPoint.fileSnapshots) {
      try {
        await fs.promises.writeFile(filePath, content, 'utf-8');
      } catch (error) {
        console.error(`Failed to rollback file ${filePath}:`, error);
      }
    }
  }

  /**
   * Record operation in history
   */
  private async recordOperation(step: TaskStep, result: StepExecutionResult): Promise<void> {
    // Map TaskStepType to OperationType
    const operationTypeMap: Record<string, string> = {
      'create': 'file_create',
      'edit': 'file_edit',
      'delete': 'file_delete',
      'move': 'file_move',
      'rename': 'file_rename',
      'refactor': 'refactor',
      'analyze': 'bulk_operation',
      'validate': 'bulk_operation',
      'test': 'bulk_operation'
    };

    const operationType = operationTypeMap[step.type] || 'bulk_operation';

    await this.operationHistory.recordOperation(
      operationType as any,
      step.description,
      result.filesModified,
      {
        type: 'file_operations',
        files: result.filesModified.map(f => ({
          filePath: f,
          existed: true,
          content: ''
        }))
      },
      {
        tool: step.tool,
        sessionId: step.id,
        estimatedTime: result.duration
      }
    );
  }

  /**
   * Emit progress event
   */
  private emitProgress(
    plan: TaskPlan,
    currentIndex: number,
    totalSteps: number,
    completedSteps: number,
    failedSteps: number,
    startTime: number
  ): void {
    const elapsedTime = Date.now() - startTime;
    const avgTimePerStep = completedSteps > 0 ? elapsedTime / completedSteps : 0;
    const remainingSteps = totalSteps - currentIndex;
    const estimatedTimeRemaining = avgTimePerStep * remainingSteps;

    const progress: PlanExecutionProgress = {
      planId: plan.id,
      currentStep: currentIndex + 1,
      totalSteps,
      completedSteps,
      failedSteps,
      skippedSteps: 0,
      elapsedTime,
      estimatedTimeRemaining,
      currentStepDescription: plan.steps[currentIndex]?.description || ''
    };

    this.emit('progress', progress);
  }

  /**
   * Get files affected by a step
   */
  private getAffectedFiles(step: TaskStep): string[] {
    const files: string[] = [];

    // Extract from args
    if (step.args.filePath) files.push(step.args.filePath);
    if (step.args.files) files.push(...step.args.files);
    if (step.args.targetFile) files.push(step.args.targetFile);
    if (step.args.sourceFile) files.push(step.args.sourceFile);

    return files;
  }

  /**
   * Extract modified files from tool output
   */
  private extractModifiedFiles(output: any): string[] {
    const files: string[] = [];

    if (typeof output === 'object' && output !== null) {
      if (output.filesModified) files.push(...output.filesModified);
      if (output.filePath) files.push(output.filePath);
      if (output.files) files.push(...output.files);
    }

    return files;
  }

  /**
   * Get execution statistics
   */
  getStatistics(plan: TaskPlan): {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    totalDuration: number;
    averageStepDuration: number;
  } {
    const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
    const failedSteps = plan.steps.filter(s => s.status === 'failed').length;
    const totalDuration = plan.completedAt ? plan.completedAt - (plan.startedAt || 0) : 0;
    const stepsWithDuration = plan.steps.filter(s => s.startTime && s.endTime);
    const averageStepDuration = stepsWithDuration.length > 0
      ? stepsWithDuration.reduce((sum, s) => sum + ((s.endTime || 0) - (s.startTime || 0)), 0) / stepsWithDuration.length
      : 0;

    return {
      totalSteps: plan.steps.length,
      completedSteps,
      failedSteps,
      totalDuration,
      averageStepDuration
    };
  }
}

