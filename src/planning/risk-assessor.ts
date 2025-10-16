/**
 * Risk Assessor
 * 
 * Assesses risks for planned operations
 */

import { CodeIntelligenceEngine } from '../tools/intelligence/engine.js';
import { DependencyAnalyzerTool } from '../tools/intelligence/dependency-analyzer.js';
import { RiskLevel, TaskStep } from './types.js';

export interface RiskAssessment {
  level: RiskLevel;
  factors: string[];
  mitigations: string[];
  score: number; // 0-100
}

export class RiskAssessor {
  private intelligenceEngine: CodeIntelligenceEngine;
  private dependencyAnalyzer: DependencyAnalyzerTool;

  constructor(rootPath: string) {
    this.intelligenceEngine = new CodeIntelligenceEngine(rootPath);
    this.dependencyAnalyzer = new DependencyAnalyzerTool(this.intelligenceEngine);
  }

  /**
   * Assess risk for a single step
   */
  async assessStepRisk(step: TaskStep): Promise<RiskAssessment> {
    const factors: string[] = [];
    let score = 0;

    // Tool-based risk
    const toolRisk = this.assessToolRisk(step.tool);
    score += toolRisk.score;
    factors.push(...toolRisk.factors);

    // Operation type risk
    const typeRisk = this.assessTypeRisk(step.type);
    score += typeRisk.score;
    factors.push(...typeRisk.factors);

    // Dependency risk
    if (step.dependencies.length > 5) {
      score += 10;
      factors.push('High dependency count');
    }

    // Determine level
    let level: RiskLevel;
    if (score >= 70) level = 'critical';
    else if (score >= 50) level = 'high';
    else if (score >= 30) level = 'medium';
    else level = 'low';

    // Generate mitigations
    const mitigations = this.generateMitigations(factors, level);

    return { level, factors, mitigations, score };
  }

  /**
   * Assess risk for entire plan
   */
  async assessPlanRisk(steps: TaskStep[]): Promise<RiskAssessment> {
    const stepAssessments = await Promise.all(
      steps.map(step => this.assessStepRisk(step))
    );

    const factors: string[] = [];
    const mitigations: string[] = [];
    let totalScore = 0;

    for (const assessment of stepAssessments) {
      totalScore += assessment.score;
      factors.push(...assessment.factors);
      mitigations.push(...assessment.mitigations);
    }

    const avgScore = totalScore / steps.length;

    let level: RiskLevel;
    if (avgScore >= 70) level = 'critical';
    else if (avgScore >= 50) level = 'high';
    else if (avgScore >= 30) level = 'medium';
    else level = 'low';

    return {
      level,
      factors: [...new Set(factors)],
      mitigations: [...new Set(mitigations)],
      score: avgScore
    };
  }

  /**
   * Assess tool-specific risk
   */
  private assessToolRisk(tool: string): { score: number; factors: string[] } {
    const toolRisks: Record<string, { score: number; factor: string }> = {
      'multi_file_editor': { score: 40, factor: 'Multi-file operations can affect many files' },
      'refactoring_assistant': { score: 30, factor: 'Refactoring may introduce bugs' },
      'code_aware_editor': { score: 20, factor: 'Code modifications require careful review' },
      'str_replace_editor': { score: 15, factor: 'String replacement may have unintended matches' },
      'bash': { score: 50, factor: 'Shell commands can have system-wide effects' },
      'dependency_analyzer': { score: 5, factor: 'Read-only analysis' },
      'code_context': { score: 5, factor: 'Read-only analysis' },
      'symbol_search': { score: 5, factor: 'Read-only search' }
    };

    const risk = toolRisks[tool] || { score: 25, factor: 'Unknown tool risk' };
    return { score: risk.score, factors: [risk.factor] };
  }

  /**
   * Assess operation type risk
   */
  private assessTypeRisk(type: string): { score: number; factors: string[] } {
    const typeRisks: Record<string, { score: number; factor: string }> = {
      'delete': { score: 50, factor: 'Deletion is irreversible' },
      'move': { score: 30, factor: 'Moving code can break imports' },
      'refactor': { score: 25, factor: 'Refactoring may introduce bugs' },
      'create': { score: 10, factor: 'Creating new files is low risk' },
      'analyze': { score: 0, factor: 'Analysis is read-only' },
      'validate': { score: 0, factor: 'Validation is read-only' },
      'test': { score: 5, factor: 'Testing is generally safe' },
      'document': { score: 5, factor: 'Documentation changes are low risk' }
    };

    const risk = typeRisks[type] || { score: 20, factor: 'Unknown operation type' };
    return { score: risk.score, factors: [risk.factor] };
  }

  /**
   * Generate risk mitigations
   */
  private generateMitigations(factors: string[], level: RiskLevel): string[] {
    const mitigations: string[] = [];

    if (level === 'critical' || level === 'high') {
      mitigations.push('Create backup or commit changes before proceeding');
      mitigations.push('Review plan carefully before execution');
      mitigations.push('Consider breaking into smaller steps');
    }

    if (factors.some(f => f.includes('Multi-file'))) {
      mitigations.push('Use transaction support to enable rollback');
    }

    if (factors.some(f => f.includes('Deletion'))) {
      mitigations.push('Verify files are not needed before deletion');
      mitigations.push('Ensure version control is in place');
    }

    if (factors.some(f => f.includes('imports'))) {
      mitigations.push('Validate all import paths after changes');
    }

    if (factors.some(f => f.includes('Shell'))) {
      mitigations.push('Review shell commands before execution');
      mitigations.push('Use dry-run mode if available');
    }

    return mitigations;
  }

  /**
   * Check if operation should require confirmation
   */
  shouldRequireConfirmation(assessment: RiskAssessment): boolean {
    return assessment.level === 'high' || assessment.level === 'critical';
  }

  /**
   * Check if operation should be blocked
   */
  shouldBlockOperation(assessment: RiskAssessment, allowRisky: boolean): boolean {
    return assessment.level === 'critical' && !allowRisky;
  }
}

