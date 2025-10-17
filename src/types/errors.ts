/**
 * Typed error for self-correction and fallback strategies
 */
export class SelfCorrectError extends Error {
  public readonly originalTool: string;
  public readonly suggestedFallbacks: string[];
  public readonly hint: string;
  public readonly metadata: Record<string, any>;

  constructor(options: {
    message: string;
    originalTool: string;
    suggestedFallbacks: string[];
    hint: string;
    metadata?: Record<string, any>;
  }) {
    super(options.message);
    this.name = 'SelfCorrectError';
    this.originalTool = options.originalTool;
    this.suggestedFallbacks = options.suggestedFallbacks;
    this.hint = options.hint;
    this.metadata = options.metadata || {};

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SelfCorrectError);
    }
  }

  /**
   * Format error for display to LLM
   */
  toDisplayString(): string {
    let output = `${this.message}\n\n`;
    output += `Suggested approaches:\n`;
    this.suggestedFallbacks.forEach((fallback, idx) => {
      output += `${idx + 1}. ${fallback}\n`;
    });
    if (this.hint) {
      output += `\nHint: ${this.hint}`;
    }
    return output;
  }

  /**
   * Convert to ToolResult error format
   */
  toToolResult() {
    return {
      success: false as const,
      error: this.toDisplayString(),
      metadata: {
        ...this.metadata,
        originalTool: this.originalTool,
        suggestedFallbacks: this.suggestedFallbacks,
        isSelfCorrectError: true
      }
    };
  }
}

/**
 * Helper to check if an error is a SelfCorrectError
 */
export function isSelfCorrectError(error: any): error is SelfCorrectError {
  return error instanceof SelfCorrectError || error?.metadata?.isSelfCorrectError === true;
}

/**
 * Helper to extract SelfCorrectError from ToolResult
 */
export function extractSelfCorrectError(result: { success: boolean; error?: string; metadata?: any }): SelfCorrectError | null {
  if (result.success) return null;

  // Check if metadata indicates this is a self-correct error
  if (result.metadata?.isSelfCorrectError) {
    return new SelfCorrectError({
      message: result.error || 'Unknown error',
      originalTool: result.metadata.originalTool || 'unknown',
      suggestedFallbacks: result.metadata.suggestedFallbacks || [],
      hint: result.metadata.hint || '',
      metadata: result.metadata
    });
  }

  // Legacy: check for SELF_CORRECT_ATTEMPT string marker
  if (result.error?.includes('SELF_CORRECT_ATTEMPT:')) {
    // Extract message up to first newline or end of string
    const errorLines = result.error.split('\n');
    const firstLine = errorLines[0] || result.error;
    const match = firstLine.match(/SELF_CORRECT_ATTEMPT: (.+)/);
    const message = match ? match[1] : result.error;

    return new SelfCorrectError({
      message,
      originalTool: result.metadata?.originalTool || 'unknown',
      suggestedFallbacks: result.metadata?.fallbackTools || [],
      hint: '',
      metadata: result.metadata || {}
    });
  }

  return null;
}

