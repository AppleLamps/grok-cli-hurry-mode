/**
 * Task Planner Tool
 * 
 * Exposes task planning capabilities as a Grok tool
 */

import { ToolResult } from '../types/index.js';
import { TaskOrchestrator } from '../planning/index.js';
import { TaskPlan, PlanValidationResult } from '../planning/types.js';

export class TaskPlannerTool {
  private orchestrator: TaskOrchestrator;

  constructor(rootPath: string = process.cwd()) {
    this.orchestrator = new TaskOrchestrator(rootPath, {
      maxSteps: 50,
      maxDuration: 300000,
      allowRiskyOperations: false,
      requireConfirmation: true,
      autoRollbackOnFailure: true,
      parallelExecution: false,
      maxParallelSteps: 3
    });
  }

  /**
   * Execute task planner operations
   */
  async execute(args: {
    operation: 'create_plan' | 'preview_plan' | 'validate_plan';
    userRequest: string;
    currentDirectory?: string;
    allowRisky?: boolean;
    autoRollback?: boolean;
  }): Promise<ToolResult> {
    try {
      const { operation, userRequest, currentDirectory, allowRisky, autoRollback } = args;

      // Update config if specified
      if (allowRisky !== undefined || autoRollback !== undefined) {
        const config = this.orchestrator.getConfig();
        this.orchestrator.updateConfig({
          ...config,
          allowRiskyOperations: allowRisky ?? config.allowRiskyOperations,
          autoRollbackOnFailure: autoRollback ?? config.autoRollbackOnFailure
        });
      }

      switch (operation) {
        case 'create_plan':
          return await this.createPlan(userRequest, currentDirectory);
        
        case 'preview_plan':
          return await this.previewPlan(userRequest, currentDirectory);
        
        case 'validate_plan':
          return await this.validatePlan(userRequest, currentDirectory);
        
        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Task planner error: ${error.message}`
      };
    }
  }

  /**
   * Create a plan from user request
   */
  private async createPlan(userRequest: string, currentDirectory?: string): Promise<ToolResult> {
    const { plan, validation, analysis } = await this.orchestrator.createPlan(
      userRequest,
      { currentDirectory }
    );

    const preview = this.orchestrator.formatPlanPreview(plan, validation);

    return {
      success: true,
      output: JSON.stringify({
        plan: {
          id: plan.id,
          description: plan.description,
          steps: plan.steps.map(s => ({
            id: s.id,
            type: s.type,
            description: s.description,
            tool: s.tool,
            riskLevel: s.riskLevel,
            estimatedDuration: s.estimatedDuration
          })),
          totalSteps: plan.steps.length,
          estimatedDuration: plan.totalEstimatedDuration,
          riskLevel: plan.overallRiskLevel,
          filesAffected: plan.metadata.filesAffected.length
        },
        validation: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
          suggestions: validation.suggestions,
          successRate: validation.estimatedSuccessRate
        },
        analysis: {
          intent: analysis.intent,
          complexity: analysis.complexity,
          estimatedSteps: analysis.estimatedSteps,
          potentialRisks: analysis.potentialRisks
        },
        preview
      }, null, 2)
    };
  }

  /**
   * Preview a plan with formatted output
   */
  private async previewPlan(userRequest: string, currentDirectory?: string): Promise<ToolResult> {
    const { plan, validation } = await this.orchestrator.createPlan(
      userRequest,
      { currentDirectory }
    );

    const preview = this.orchestrator.formatPlanPreview(plan, validation);

    return {
      success: true,
      output: preview
    };
  }

  /**
   * Validate a plan
   */
  private async validatePlan(userRequest: string, currentDirectory?: string): Promise<ToolResult> {
    const { plan, validation } = await this.orchestrator.createPlan(
      userRequest,
      { currentDirectory }
    );

    let output = `\n✅ Plan Validation Results\n`;
    output += `${'='.repeat(60)}\n\n`;
    output += `Valid: ${validation.isValid ? '✅ Yes' : '❌ No'}\n`;
    output += `Success Rate: ${validation.estimatedSuccessRate}%\n`;
    output += `Risk Level: ${plan.overallRiskLevel}\n\n`;

    if (validation.errors.length > 0) {
      output += `❌ Errors (${validation.errors.length}):\n`;
      validation.errors.forEach((err, i) => output += `  ${i + 1}. ${err}\n`);
      output += `\n`;
    }

    if (validation.warnings.length > 0) {
      output += `⚠️  Warnings (${validation.warnings.length}):\n`;
      validation.warnings.forEach((warn, i) => output += `  ${i + 1}. ${warn}\n`);
      output += `\n`;
    }

    if (validation.suggestions.length > 0) {
      output += `💡 Suggestions (${validation.suggestions.length}):\n`;
      validation.suggestions.forEach((sug, i) => output += `  ${i + 1}. ${sug}\n`);
      output += `\n`;
    }

    return {
      success: validation.isValid,
      output
    };
  }

  /**
   * Get the orchestrator instance for direct use
   */
  getOrchestrator(): TaskOrchestrator {
    return this.orchestrator;
  }
}

