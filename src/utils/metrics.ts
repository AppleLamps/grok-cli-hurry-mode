import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Metrics for tool execution
 */
export interface ToolMetrics {
  toolName: string;
  operationId: string;
  startTime: number;
  endTime?: number;
  latencyMs?: number;
  success: boolean;
  retryCount: number;
  fallbackUsed?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Aggregated metrics
 */
export interface AggregatedMetrics {
  totalOperations: number;
  successCount: number;
  failureCount: number;
  totalRetries: number;
  fallbackCount: number;
  averageLatencyMs: number;
  toolBreakdown: Record<string, {
    count: number;
    successRate: number;
    avgLatency: number;
    retries: number;
  }>;
}

/**
 * Lightweight metrics collection and logging
 */
export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: ToolMetrics[] = [];
  private activeOperations: Map<string, ToolMetrics> = new Map();
  private logFile: string | null = null;
  private verbose: boolean = false;

  private constructor() {
    // Initialize log file in temp directory
    const tempDir = os.tmpdir();
    const logDir = path.join(tempDir, 'grok-cli-logs');

    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(logDir, `grok-metrics-${timestamp}.jsonl`);
    } catch (error) {
      console.warn('Failed to initialize metrics log file:', error);
    }
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Enable verbose logging
   */
  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Start tracking an operation
   */
  startOperation(toolName: string, metadata?: Record<string, any>): string {
    const operationId = `${toolName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const metric: ToolMetrics = {
      toolName,
      operationId,
      startTime: Date.now(),
      success: false,
      retryCount: 0,
      metadata
    };

    this.activeOperations.set(operationId, metric);

    if (this.verbose) {
      console.log(`[METRICS] Started ${toolName} (${operationId})`);
    }

    return operationId;
  }

  /**
   * End tracking an operation
   */
  endOperation(
    operationId: string,
    success: boolean,
    error?: string,
    fallbackUsed?: string
  ): void {
    const metric = this.activeOperations.get(operationId);
    if (!metric) {
      console.warn(`[METRICS] Unknown operation ID: ${operationId}`);
      return;
    }

    metric.endTime = Date.now();
    metric.latencyMs = metric.endTime - metric.startTime;
    metric.success = success;
    metric.error = error;
    metric.fallbackUsed = fallbackUsed;

    this.activeOperations.delete(operationId);
    this.metrics.push(metric);

    // Write to log file
    this.writeToLog(metric);

    if (this.verbose) {
      const status = success ? '✓' : '✗';
      console.log(
        `[METRICS] ${status} ${metric.toolName} completed in ${metric.latencyMs}ms (${operationId})`
      );
      if (error) {
        console.log(`[METRICS]   Error: ${error.substring(0, 100)}`);
      }
      if (fallbackUsed) {
        console.log(`[METRICS]   Fallback: ${fallbackUsed}`);
      }
    }
  }

  /**
   * Increment retry count for an operation
   */
  incrementRetry(operationId: string): void {
    const metric = this.activeOperations.get(operationId);
    if (metric) {
      metric.retryCount++;

      if (this.verbose) {
        console.log(`[METRICS] Retry #${metric.retryCount} for ${metric.toolName} (${operationId})`);
      }
    }
  }

  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): AggregatedMetrics {
    const toolStats: Record<string, {
      count: number;
      successCount: number;
      totalLatency: number;
      retries: number;
    }> = {};

    let totalRetries = 0;
    let fallbackCount = 0;

    for (const metric of this.metrics) {
      if (!toolStats[metric.toolName]) {
        toolStats[metric.toolName] = {
          count: 0,
          successCount: 0,
          totalLatency: 0,
          retries: 0
        };
      }

      const stats = toolStats[metric.toolName];
      stats.count++;
      if (metric.success) stats.successCount++;
      stats.totalLatency += metric.latencyMs || 0;
      stats.retries += metric.retryCount;
      totalRetries += metric.retryCount;

      if (metric.fallbackUsed) {
        fallbackCount++;
      }
    }

    const toolBreakdown: Record<string, any> = {};
    for (const [toolName, stats] of Object.entries(toolStats)) {
      toolBreakdown[toolName] = {
        count: stats.count,
        successRate: stats.count > 0 ? (stats.successCount / stats.count) * 100 : 0,
        avgLatency: stats.count > 0 ? stats.totalLatency / stats.count : 0,
        retries: stats.retries
      };
    }

    const successCount = this.metrics.filter(m => m.success).length;
    const totalLatency = this.metrics.reduce((sum, m) => sum + (m.latencyMs || 0), 0);

    return {
      totalOperations: this.metrics.length,
      successCount,
      failureCount: this.metrics.length - successCount,
      totalRetries,
      fallbackCount,
      averageLatencyMs: this.metrics.length > 0 ? totalLatency / this.metrics.length : 0,
      toolBreakdown
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count: number = 10): ToolMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.activeOperations.clear();
  }

  /**
   * Write metric to log file
   */
  private writeToLog(metric: ToolMetrics): void {
    if (!this.logFile) return;

    try {
      const logEntry = JSON.stringify({
        ...metric,
        timestamp: new Date(metric.startTime).toISOString()
      }) + '\n';

      fs.appendFileSync(this.logFile, logEntry, 'utf-8');
    } catch {
      // Silently fail - don't disrupt operations for logging issues
    }
  }

  /**
   * Get log file path
   */
  getLogFilePath(): string | null {
    return this.logFile;
  }

  /**
   * Print summary to console
   */
  printSummary(): void {
    const agg = this.getAggregatedMetrics();

    console.log('\n=== Grok CLI Metrics Summary ===');
    console.log(`Total Operations: ${agg.totalOperations}`);
    console.log(`Success Rate: ${agg.totalOperations > 0 ? ((agg.successCount / agg.totalOperations) * 100).toFixed(1) : 0}%`);
    console.log(`Average Latency: ${agg.averageLatencyMs.toFixed(0)}ms`);
    console.log(`Total Retries: ${agg.totalRetries}`);
    console.log(`Fallbacks Used: ${agg.fallbackCount}`);

    if (Object.keys(agg.toolBreakdown).length > 0) {
      console.log('\nTool Breakdown:');
      for (const [tool, stats] of Object.entries(agg.toolBreakdown)) {
        console.log(`  ${tool}:`);
        console.log(`    Count: ${stats.count}`);
        console.log(`    Success Rate: ${stats.successRate.toFixed(1)}%`);
        console.log(`    Avg Latency: ${stats.avgLatency.toFixed(0)}ms`);
        if (stats.retries > 0) {
          console.log(`    Retries: ${stats.retries}`);
        }
      }
    }

    if (this.logFile) {
      console.log(`\nDetailed logs: ${this.logFile}`);
    }
    console.log('================================\n');
  }
}

/**
 * Helper to wrap tool execution with metrics
 */
export async function withMetrics<T>(
  toolName: string,
  operation: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const metrics = MetricsCollector.getInstance();
  const operationId = metrics.startOperation(toolName, metadata);

  try {
    const result = await operation();
    metrics.endOperation(operationId, true);
    return result;
  } catch (error: any) {
    metrics.endOperation(operationId, false, error.message);
    throw error;
  }
}

