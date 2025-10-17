/**
 * Operation Tracker
 * 
 * Tracks file operations and content hashes to prevent duplicate edits
 * and detect when the same operation has already been applied.
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface OperationRecord {
  id: string;
  type: 'create' | 'edit' | 'delete' | 'rename' | 'move';
  filePath: string;
  contentHash?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface IdempotencyCheck {
  isDuplicate: boolean;
  reason?: string;
  previousOperation?: OperationRecord;
  suggestion?: string;
}

export class OperationTracker {
  private static instance: OperationTracker;
  private operations: Map<string, OperationRecord[]> = new Map();
  private fileHashes: Map<string, string> = new Map();
  private readonly maxHistoryPerFile = 10;

  private constructor() { }

  static getInstance(): OperationTracker {
    if (!OperationTracker.instance) {
      OperationTracker.instance = new OperationTracker();
    }
    return OperationTracker.instance;
  }

  /**
   * Compute hash of file content
   */
  private computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /**
   * Get current hash of a file
   */
  async getFileHash(filePath: string): Promise<string | null> {
    try {
      const absolutePath = path.resolve(filePath);
      if (!fs.existsSync(absolutePath)) {
        return null;
      }
      const content = await fs.promises.readFile(absolutePath, 'utf-8');
      return this.computeHash(content);
    } catch {
      return null;
    }
  }

  /**
   * Check if an operation would be a duplicate
   */
  async checkIdempotency(
    type: OperationRecord['type'],
    filePath: string,
    newContent?: string
  ): Promise<IdempotencyCheck> {
    const absolutePath = path.resolve(filePath);
    const operations = this.operations.get(absolutePath) || [];

    // For create operations, check if file already exists
    if (type === 'create') {
      if (fs.existsSync(absolutePath)) {
        const lastOp = operations[operations.length - 1];
        return {
          isDuplicate: true,
          reason: 'File already exists',
          previousOperation: lastOp,
          suggestion: 'Use edit operation instead, or check if the file was already created'
        };
      }
    }

    // For edit operations, check if content would be identical
    if (type === 'edit' && newContent) {
      const newHash = this.computeHash(newContent);
      const currentHash = await this.getFileHash(absolutePath);

      if (currentHash === newHash) {
        const lastOp = operations[operations.length - 1];
        return {
          isDuplicate: true,
          reason: 'Content is identical to current file',
          previousOperation: lastOp,
          suggestion: 'File already has the desired content. No changes needed.'
        };
      }

      // Check if this exact edit was recently applied
      const recentIdenticalEdit = operations
        .slice(-3) // Check last 3 operations
        .find(op => op.type === 'edit' && op.contentHash === newHash);

      if (recentIdenticalEdit) {
        return {
          isDuplicate: true,
          reason: 'This exact edit was already applied recently',
          previousOperation: recentIdenticalEdit,
          suggestion: 'The file was already edited to this content. Verify the operation completed successfully.'
        };
      }
    }

    // For delete operations, check if file exists
    if (type === 'delete') {
      if (!fs.existsSync(absolutePath)) {
        const lastOp = operations[operations.length - 1];
        if (lastOp && lastOp.type === 'delete') {
          return {
            isDuplicate: true,
            reason: 'File was already deleted',
            previousOperation: lastOp,
            suggestion: 'File no longer exists. It may have been deleted already.'
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Record an operation
   */
  async recordOperation(
    type: OperationRecord['type'],
    filePath: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const absolutePath = path.resolve(filePath);
    const contentHash = await this.getFileHash(absolutePath);

    const record: OperationRecord = {
      id: `${type}_${absolutePath}_${Date.now()}`,
      type,
      filePath: absolutePath,
      contentHash: contentHash || undefined,
      timestamp: Date.now(),
      metadata
    };

    const operations = this.operations.get(absolutePath) || [];
    operations.push(record);

    // Keep only recent operations
    if (operations.length > this.maxHistoryPerFile) {
      operations.shift();
    }

    this.operations.set(absolutePath, operations);

    // Update file hash cache
    if (contentHash) {
      this.fileHashes.set(absolutePath, contentHash);
    } else {
      this.fileHashes.delete(absolutePath);
    }
  }

  /**
   * Get operation history for a file
   */
  getFileHistory(filePath: string): OperationRecord[] {
    const absolutePath = path.resolve(filePath);
    return this.operations.get(absolutePath) || [];
  }

  /**
   * Clear history for a file
   */
  clearFileHistory(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    this.operations.delete(absolutePath);
    this.fileHashes.delete(absolutePath);
  }

  /**
   * Clear all history
   */
  clearAll(): void {
    this.operations.clear();
    this.fileHashes.clear();
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalFiles: number;
    totalOperations: number;
    operationsByType: Record<string, number>;
  } {
    let totalOperations = 0;
    const operationsByType: Record<string, number> = {
      create: 0,
      edit: 0,
      delete: 0,
      rename: 0,
      move: 0
    };

    for (const operations of this.operations.values()) {
      totalOperations += operations.length;
      for (const op of operations) {
        operationsByType[op.type]++;
      }
    }

    return {
      totalFiles: this.operations.size,
      totalOperations,
      operationsByType
    };
  }

  /**
   * Detect if we're in a loop (same operations repeating)
   */
  detectLoop(windowSize: number = 5): {
    isLoop: boolean;
    repeatedOperations?: OperationRecord[];
    suggestion?: string;
  } {
    // Get all recent operations across all files
    const allOperations: OperationRecord[] = [];
    for (const ops of this.operations.values()) {
      allOperations.push(...ops.slice(-windowSize));
    }

    // Sort by timestamp
    allOperations.sort((a, b) => a.timestamp - b.timestamp);

    if (allOperations.length < windowSize * 2) {
      return { isLoop: false };
    }

    // Check if recent operations match earlier operations
    const recent = allOperations.slice(-windowSize);
    const earlier = allOperations.slice(-windowSize * 2, -windowSize);

    // Compare operation signatures
    const recentSignature = recent.map(op => `${op.type}:${op.filePath}:${op.contentHash}`).join('|');
    const earlierSignature = earlier.map(op => `${op.type}:${op.filePath}:${op.contentHash}`).join('|');

    if (recentSignature === earlierSignature) {
      return {
        isLoop: true,
        repeatedOperations: recent,
        suggestion: 'Detected repeated operations. The same edits are being applied multiple times. Consider checking task completion criteria.'
      };
    }

    return { isLoop: false };
  }
}

