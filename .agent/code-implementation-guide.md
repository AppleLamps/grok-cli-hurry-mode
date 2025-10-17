# Code Implementation Guide

---

## Phase 1: Plan Detection (Task 1.1)

### Add to GrokAgent class:

```typescript
/**
 * Determine if a user request warrants automatic task planning
 */
private shouldCreatePlan(message: string): boolean {
  const lowerMsg = message.toLowerCase();
  
  // Complexity keywords
  const complexKeywords = [
    'refactor', 'move', 'extract', 'implement', 'restructure',
    'redesign', 'reorganize', 'migrate', 'convert', 'transform'
  ];
  
  // Check for keywords
  let complexityScore = 0;
  if (complexKeywords.some(kw => lowerMsg.includes(kw))) {
    complexityScore += 2;
  }
  
  // Check for multiple file mentions
  const fileMatches = message.match(/\b[\w\-./]+\.(ts|tsx|js|jsx|py|java|go)\b/g);
  if (fileMatches && fileMatches.length > 1) {
    complexityScore += 2;
  }
  
  // Check for architecture/design patterns
  const architectureKeywords = ['architecture', 'design', 'pattern', 'dependency', 'module'];
  if (architectureKeywords.some(kw => lowerMsg.includes(kw))) {
    complexityScore += 1;
  }
  
  // Check for scope indicators
  if (lowerMsg.includes('across') || lowerMsg.includes('throughout')) {
    complexityScore += 1;
  }
  
  return complexityScore >= 3;
}
```

### Integration in processUserMessageStream:

```typescript
// After: this.chatHistory.push(userEntry);
// Add:

const shouldPlan = this.shouldCreatePlan(message);
if (shouldPlan) {
  try {
    const planResult = await this.generateAndConfirmPlan(message);
    if (planResult.approved) {
      // Execute plan and return
      const executionResult = await this.executePlanSteps(planResult.plan);
      // Yield results to UI
      yield { type: 'plan_results', results: executionResult };
      yield { type: 'done' };
      return;
    }
    // If rejected, continue with standard agent loop
  } catch (error) {
    console.warn('Plan generation failed, continuing with standard loop:', error);
  }
}
```

---

## Phase 2: Confirmation & Execution (Tasks 1.2 & 1.3)

### Add methods to GrokAgent:

```typescript
/**
 * Generate plan and request user confirmation
 */
private async generateAndConfirmPlan(
  userRequest: string
): Promise<{ approved: boolean; plan?: TaskPlan }> {
  try {
    const { plan, validation } = await this.taskOrchestrator.createPlan(
      userRequest,
      { currentDirectory: this.getCurrentDirectory() }
    );
    
    const preview = this.taskOrchestrator.formatPlanPreview(plan, validation);
    
    const confirmResult = await this.confirmationTool.requestConfirmation({
      operation: 'Execute Task Plan',
      filename: `${plan.steps.length} steps affecting ${plan.metadata.filesAffected.length} files`,
      description: `${plan.description}\n\n${preview}`,
      showVSCodeOpen: false,
      autoAccept: false
    });
    
    return {
      approved: confirmResult.success,
      plan: confirmResult.success ? plan : undefined
    };
  } catch (error: any) {
    console.error('Plan generation error:', error);
    return { approved: false };
  }
}

/**
 * Execute plan steps sequentially
 */
private async executePlanSteps(plan: TaskPlan): Promise<any[]> {
  const results: any[] = [];
  
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    
    // Check dependencies
    if (step.dependencies.length > 0) {
      const depsCompleted = step.dependencies.every(depId =>
        plan.steps.find(s => s.id === depId)?.status === 'completed'
      );
      if (!depsCompleted) {
        step.status = 'skipped';
        continue;
      }
    }
    
    step.status = 'running';
    step.startTime = Date.now();
    
    try {
      // Create tool call from step
      const toolCall: GrokToolCall = {
        id: step.id,
        type: 'function',
        function: {
          name: step.tool,
          arguments: JSON.stringify(step.args)
        }
      };
      
      const result = await this.executeTool(toolCall);
      step.status = 'completed';
      step.result = result;
      results.push({ stepId: step.id, success: true, result });
    } catch (error: any) {
      step.status = 'failed';
      step.error = error.message;
      results.push({ stepId: step.id, success: false, error: error.message });
      
      if (this.taskOrchestrator['config'].autoRollbackOnFailure) {
        console.warn('Auto-rollback triggered');
        break;
      }
    }
    
    step.endTime = Date.now();
  }
  
  return results;
}
```

---

## Phase 3: LLM Re-engagement (Tasks 2.1 & 2.2)

### Modify executeTool for refactoring_assistant:

```typescript
case "refactoring_assistant":
  try {
    return await this.refactoringAssistant.execute(args);
  } catch (error: any) {
    console.warn(`refactoring_assistant failed: ${error.message}`);
    
    // Return SELF_CORRECT_ATTEMPT signal
    return {
      success: false,
      error: `SELF_CORRECT_ATTEMPT: The refactoring operation failed with: "${error.message}". 
              Please generate a new plan using the 'multi_file_edit' tool for more direct 
              text manipulation across multiple files.`,
      metadata: {
        originalTool: 'refactoring_assistant',
        originalError: error.message,
        suggestedApproach: 'multi_file_edit',
        fallbackTools: ['multi_file_edit', 'code_analysis', 'str_replace_editor']
      }
    };
  }
```

### Add to processUserMessageStream (in tool result handling):

```typescript
// After tool execution, check for self-correction signal
if (toolResult.error?.includes('SELF_CORRECT_ATTEMPT')) {
  const correctionKey = this.hashRequest(message);
  const attempts = this.correctionAttempts.get(correctionKey) || [];
  
  if (attempts.length < 3) {
    console.log(`🔄 Self-correction attempt ${attempts.length + 1}/3`);
    
    // Extract fallback request
    const fallbackMatch = toolResult.error.match(/SELF_CORRECT_ATTEMPT: (.+?)(?:\n|$)/s);
    const fallbackRequest = fallbackMatch ? fallbackMatch[1] : toolResult.error;
    
    // Add correction message to conversation
    this.messages.push({
      role: 'user',
      content: fallbackRequest
    });
    
    // Track attempt
    attempts.push({
      tool: toolCall.function.name,
      error: toolResult.error,
      timestamp: Date.now(),
      fallbackStrategy: 'decompose_and_retry'
    });
    this.correctionAttempts.set(correctionKey, attempts);
    
    // Continue loop for LLM re-engagement
    continue;
  } else {
    // Max attempts reached
    yield {
      type: 'content',
      content: '\n\n❌ Self-correction attempts exhausted. Please try a different approach.'
    };
  }
}
```

---

## Phase 4: Correction Tracking (Task 2.3)

### Add to GrokAgent class:

```typescript
private correctionAttempts: Map<string, Array<{
  tool: string;
  error: string;
  timestamp: number;
  fallbackStrategy: string;
}>> = new Map();

private hashRequest(request: string): string {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(request).digest('hex');
}
```

---

## Testing Strategy

1. **Unit Tests**: Test each method independently
2. **Integration Tests**: Test full flow with mock tools
3. **E2E Tests**: Test with real tools on sample projects
4. **Edge Cases**: Test max retries, circular dependencies, etc.


