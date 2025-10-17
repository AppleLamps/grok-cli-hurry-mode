# Technical Specification: Autonomous Agent Implementation

---

## Architecture Overview

```
User Request
    ↓
[Plan Detection] → Complex? → [Task Planner] → [Confirmation] → [Plan Executor]
    ↓                                                                    ↓
   No                                                            [Sequential Steps]
    ↓                                                                    ↓
[Standard Agent Loop]                                          [Tool Execution]
    ↓                                                                    ↓
[LLM Call] → [Tool Calls] → [Tool Execution]                  [Failure?] → [Fallback]
    ↓                                                                    ↓
[SELF_CORRECT_ATTEMPT?] → [LLM Re-engagement] → [New Tool Calls]    [Success]
    ↓
[Final Response]
```

---

## Component Specifications

### 1. Plan Detection Module

**Method**: `shouldCreatePlan(message: string): boolean`

**Logic**:
```typescript
- Check for complexity keywords (refactor, move, extract, implement, restructure)
- Count file mentions (>1 = complex)
- Detect architecture/design patterns
- Check for dependency-related queries
- Return true if complexity score > threshold (3+)
```

**Integration Point**: Start of `processUserMessageStream`, before first LLM call

---

### 2. Plan Confirmation Flow

**Method**: `presentPlanForApproval(plan: TaskPlan): Promise<boolean>`

**Steps**:
1. Format plan with: steps, files affected, risk level, duration
2. Call `confirmationTool.requestConfirmation()`
3. Return user's decision
4. If rejected, proceed with standard agent loop

**UI Output**:
```
📋 Task Plan Generated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Intent: Refactor authentication module
Risk Level: MEDIUM | Estimated Duration: 15s | Files Affected: 5

Steps:
  1. [ANALYZE] Analyze current architecture (2s)
  2. [REFACTOR] Execute refactoring operations (5s)
  3. [VALIDATE] Validate changes (3s)
  4. [TEST] Run tests (5s)

Approve? (y/n)
```

---

### 3. Sequential Plan Execution

**Method**: `executePlanSteps(plan: TaskPlan): Promise<StepExecutionResult[]>`

**Algorithm**:
```
for each step in plan.steps:
  if step.dependencies not completed:
    skip step
  
  emit progress event
  
  try:
    result = executeTool(step.tool, step.args)
    step.status = 'completed'
    step.result = result
  catch error:
    step.status = 'failed'
    step.error = error
    
    if config.autoRollbackOnFailure:
      rollback to last checkpoint
      return failure
    else:
      continue to next step

return results
```

---

### 4. SELF_CORRECT_ATTEMPT Signal

**Format**:
```typescript
{
  success: false,
  error: "SELF_CORRECT_ATTEMPT: <fallback_request>",
  metadata: {
    originalTool: string,
    originalError: string,
    suggestedApproach: string,
    fallbackTools: string[]
  }
}
```

**Example**:
```
SELF_CORRECT_ATTEMPT: The refactoring operation 'extract_function' failed 
with error: 'Cannot find function boundaries'. Please generate a new plan 
to accomplish the same goal using the 'multi_file_edit' tool, which is more 
robust for direct text manipulation across multiple files.
```

---

### 5. LLM Re-engagement Logic

**Method**: `handleSelfCorrectAttempt(toolResult: ToolResult): Promise<void>`

**Steps**:
1. Extract fallback request from error message
2. Check correction attempt count for this request
3. If < max (3), create new LLM prompt:
   ```
   The previous approach failed. Here's a more direct strategy:
   [fallback_request]
   
   Please generate new tool calls using the suggested approach.
   ```
4. Feed back to LLM in agent loop
5. Continue normal tool execution flow

---

### 6. Correction Attempt Tracking

**Data Structure**:
```typescript
private correctionAttempts: Map<string, {
  originalRequest: string,
  attempts: Array<{
    tool: string,
    error: string,
    timestamp: number,
    fallbackStrategy: string
  }>,
  maxAttempts: number
}>
```

**Tracking Logic**:
- Key: hash of original user request
- Track each correction attempt with tool, error, strategy
- Prevent infinite loops by limiting to 3 attempts
- Log correction chain for debugging

---

## Integration Points

### In `processUserMessageStream`:

```typescript
// After user message added to history
const shouldPlan = this.shouldCreatePlan(message);

if (shouldPlan) {
  const plan = await this.generateAndConfirmPlan(message);
  if (plan) {
    yield { type: 'plan', plan };
    const results = await this.executePlanSteps(plan);
    yield { type: 'plan_results', results };
    return; // Skip standard agent loop
  }
}

// Standard agent loop continues...
while (toolRounds < maxToolRounds) {
  // ... existing code ...
  
  // After tool execution
  if (toolResult.error?.includes('SELF_CORRECT_ATTEMPT')) {
    await this.handleSelfCorrectAttempt(toolResult);
    // Continue loop for LLM re-engagement
  }
}
```

---

## Event Emissions

New events for UI feedback:
- `plan_generated`: Plan created
- `plan_confirmed`: User approved plan
- `plan_rejected`: User rejected plan
- `plan_step_started`: Step execution started
- `plan_step_completed`: Step completed
- `plan_step_failed`: Step failed
- `correction_attempt`: Self-correction triggered
- `correction_success`: Correction succeeded
- `correction_failed`: All corrections exhausted


