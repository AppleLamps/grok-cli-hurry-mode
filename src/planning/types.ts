/**
 * Task Planning Framework Types
 * 
 * Defines interfaces for intelligent multi-step task orchestration
 */

export type TaskStepType = 
  | 'analyze' 
  | 'refactor' 
  | 'move' 
  | 'create' 
  | 'delete' 
  | 'test' 
  | 'validate'
  | 'document';

export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'rolled_back';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface TaskStep {
  id: string;
  type: TaskStepType;
  description: string;
  tool: string;
  args: Record<string, any>;
  dependencies: string[]; // IDs of steps that must complete first
  estimatedDuration: number; // milliseconds
  riskLevel: RiskLevel;
  status: TaskStepStatus;
  result?: any;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface TaskPlan {
  id: string;
  userIntent: string;
  description: string;
  steps: TaskStep[];
  totalEstimatedDuration: number;
  overallRiskLevel: RiskLevel;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'draft' | 'validated' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  metadata: {
    filesAffected: string[];
    toolsUsed: string[];
    dependenciesAnalyzed: boolean;
    risksAssessed: boolean;
  };
}

export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  estimatedSuccessRate: number; // 0-100
}

export interface PlanExecutionProgress {
  planId: string;
  currentStep: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  elapsedTime: number;
  estimatedTimeRemaining: number;
  currentStepDescription: string;
}

export interface RollbackPoint {
  stepId: string;
  timestamp: number;
  fileSnapshots: Map<string, string>; // filePath -> content
  metadata: Record<string, any>;
}

export interface TaskAnalysis {
  intent: string;
  scope: {
    files: string[];
    symbols: string[];
    dependencies: string[];
  };
  complexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
  estimatedSteps: number;
  suggestedApproach: string;
  potentialRisks: string[];
  requiredTools: string[];
}

export interface PlannerConfig {
  maxSteps: number;
  maxDuration: number; // milliseconds
  allowRiskyOperations: boolean;
  requireConfirmation: boolean;
  autoRollbackOnFailure: boolean;
  parallelExecution: boolean;
  maxParallelSteps: number;
}

export interface StepExecutionResult {
  stepId: string;
  success: boolean;
  output?: any;
  error?: string;
  duration: number;
  filesModified: string[];
  rollbackData?: any;
}

