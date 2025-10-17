import pLimit from 'p-limit';
import * as os from 'os';

/**
 * Concurrency pool for parallel operations
 */
export class ConcurrencyPool {
  private static instance: ConcurrencyPool;
  private readLimit: ReturnType<typeof pLimit>;
  private writeLimit: ReturnType<typeof pLimit>;
  private cpuLimit: ReturnType<typeof pLimit>;

  private constructor() {
    const cpuCount = os.cpus().length;

    // Read operations can be more parallel (I/O bound)
    // On Windows, be conservative with file handles
    this.readLimit = pLimit(Math.min(cpuCount * 2, 8));

    // Write operations should be more conservative (safety)
    this.writeLimit = pLimit(2);

    // CPU-intensive operations (parsing, analysis)
    this.cpuLimit = pLimit(Math.max(cpuCount - 1, 1));
  }

  static getInstance(): ConcurrencyPool {
    if (!ConcurrencyPool.instance) {
      ConcurrencyPool.instance = new ConcurrencyPool();
    }
    return ConcurrencyPool.instance;
  }

  /**
   * Execute read operations in parallel with concurrency limit
   */
  async executeReads<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(operations.map(op => this.readLimit(op)));
  }

  /**
   * Execute write operations with concurrency limit
   */
  async executeWrites<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(operations.map(op => this.writeLimit(op)));
  }

  /**
   * Execute CPU-intensive operations with concurrency limit
   */
  async executeCPU<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(operations.map(op => this.cpuLimit(op)));
  }

  /**
   * Execute a single read operation
   */
  async read<T>(operation: () => Promise<T>): Promise<T> {
    return this.readLimit(operation);
  }

  /**
   * Execute a single write operation
   */
  async write<T>(operation: () => Promise<T>): Promise<T> {
    return this.writeLimit(operation);
  }

  /**
   * Execute a single CPU operation
   */
  async cpu<T>(operation: () => Promise<T>): Promise<T> {
    return this.cpuLimit(operation);
  }

  /**
   * Get current concurrency limits
   */
  getLimits() {
    return {
      read: this.readLimit.activeCount + '/' + this.readLimit.pendingCount,
      write: this.writeLimit.activeCount + '/' + this.writeLimit.pendingCount,
      cpu: this.cpuLimit.activeCount + '/' + this.cpuLimit.pendingCount
    };
  }

  /**
   * Clear all pending operations (for cleanup)
   */
  clearAll() {
    this.readLimit.clearQueue();
    this.writeLimit.clearQueue();
    this.cpuLimit.clearQueue();
  }
}

/**
 * Helper functions for common patterns
 */

/**
 * Read multiple files in parallel
 */
export async function readFilesParallel<T>(
  filePaths: string[],
  readFn: (path: string) => Promise<T>
): Promise<T[]> {
  const pool = ConcurrencyPool.getInstance();
  return pool.executeReads(filePaths.map(path => () => readFn(path)));
}

/**
 * Process items in parallel with concurrency limit
 */
export async function processParallel<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  type: 'read' | 'write' | 'cpu' = 'read'
): Promise<R[]> {
  const pool = ConcurrencyPool.getInstance();
  const operations = items.map(item => () => processFn(item));

  switch (type) {
    case 'read':
      return pool.executeReads(operations);
    case 'write':
      return pool.executeWrites(operations);
    case 'cpu':
      return pool.executeCPU(operations);
  }
}

/**
 * Batch process items with progress callback
 */
export async function batchProcess<T, R>(
  items: T[],
  processFn: (item: T) => Promise<R>,
  options: {
    type?: 'read' | 'write' | 'cpu';
    onProgress?: (completed: number, total: number) => void;
    batchSize?: number;
  } = {}
): Promise<R[]> {
  const { type = 'read', onProgress, batchSize } = options;
  const pool = ConcurrencyPool.getInstance();
  const results: R[] = [];
  let completed = 0;

  // Process in batches if specified
  if (batchSize && batchSize < items.length) {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await processParallel(batch, processFn, type);
      results.push(...batchResults);
      completed += batch.length;

      if (onProgress) {
        onProgress(completed, items.length);
      }
    }
  } else {
    // Process all at once with concurrency limit
    const operations = items.map((item, _index) => async () => {
      const result = await processFn(item);
      completed++;
      if (onProgress) {
        onProgress(completed, items.length);
      }
      return result;
    });

    switch (type) {
      case 'read':
        return pool.executeReads(operations);
      case 'write':
        return pool.executeWrites(operations);
      case 'cpu':
        return pool.executeCPU(operations);
    }
  }

  return results;
}

