# Code Locations Reference

Quick reference for where to make changes in the codebase.

---

## File: src/agent/grok-agent.ts

### Class Properties (Add around line 99)
```
Location: After line 99 (after maxRetries)
Add:
  private correctionAttempts: Map<string, Array<{...}>> = new Map();
  private planExecutionInProgress: boolean = false;
```

### Constructor (Modify around line 101-155)
```
Location: Already has taskOrchestrator initialization (line 137-145)
Status: ✅ Already done
```

### New Methods (Add after line 1240)
```
Locations to add:
1. shouldCreatePlan() - after line 1240
2. generateAndConfirmPlan() - after shouldCreatePlan
3. executePlanSteps() - after generateAndConfirmPlan
4. handleSelfCorrectAttempt() - after executePlanSteps
5. hashRequest() - after handleSelfCorrectAttempt
```

### processUserMessageStream Method (Modify around line 517-780)
```
Location 1: After line 530 (after messages.push)
Add: Plan detection logic
  const shouldPlan = this.shouldCreatePlan(message);
  if (shouldPlan) { ... }

Location 2: Around line 650-700 (in tool result handling)
Add: Self-correction detection
  if (toolResult.error?.includes('SELF_CORRECT_ATTEMPT')) { ... }
```

### executeTool Method (Modify around line 782-1035)
```
Location: Around line 971-978 (refactoring_assistant case)
Current: Has try-catch with attemptFallback
Modify: Return SELF_CORRECT_ATTEMPT signal instead of attemptFallback
```

---

## File: src/planning/task-orchestrator.ts

### formatPlanPreview Method (Check around line 200-250)
```
Status: ✅ Already exists
Usage: Called in generateAndConfirmPlan()
```

### getConfig Method (Check around line 250-276)
```
Status: ✅ Already exists
Usage: Called in TaskPlannerTool
```

---

## File: src/tools/task-planner-tool.ts

### No changes needed
```
Status: ✅ Already complete
This tool is already properly integrated
```

---

## File: src/planning/types.ts

### No changes needed
```
Status: ✅ Already complete
All required types are defined
```

---

## Integration Checklist

### Phase 1: Plan Detection
- [ ] Add `shouldCreatePlan()` method to GrokAgent
- [ ] Add plan detection logic to `processUserMessageStream` (after line 530)
- [ ] Test with sample complex requests

### Phase 2: Confirmation & Execution
- [ ] Add `generateAndConfirmPlan()` method
- [ ] Add `executePlanSteps()` method
- [ ] Add plan execution logic to `processUserMessageStream` (after plan detection)
- [ ] Test plan generation and execution

### Phase 3: LLM Re-engagement
- [ ] Modify `refactoring_assistant` case in `executeTool` (line 971-978)
- [ ] Add `handleSelfCorrectAttempt()` method
- [ ] Add self-correction detection in `processUserMessageStream` (around line 650-700)
- [ ] Test self-correction flow

### Phase 4: Correction Tracking
- [ ] Add `correctionAttempts` map to class properties
- [ ] Add `hashRequest()` method
- [ ] Update `handleSelfCorrectAttempt()` to track attempts
- [ ] Test max attempts limit

---

## Key Methods Already Implemented

These methods exist and should be used:

1. **TaskOrchestrator.createPlan()** (line 142-150)
   - Returns: { plan, validation, analysis }
   - Usage: In generateAndConfirmPlan()

2. **TaskOrchestrator.formatPlanPreview()** (line ~200)
   - Returns: Formatted string for display
   - Usage: In confirmation dialog

3. **ConfirmationTool.requestConfirmation()** (existing)
   - Returns: { success: boolean }
   - Usage: In generateAndConfirmPlan()

4. **executeTool()** (line 782-1035)
   - Already handles tool execution
   - Modify for SELF_CORRECT_ATTEMPT signal

5. **attemptFallback()** (line 1258-1318)
   - Already implements retry logic
   - Keep as-is for backward compatibility

---

## Event Emissions to Add

In `processUserMessageStream`, emit these events:

```typescript
// Plan detection
yield { type: 'plan_generated', plan };

// Plan confirmation
yield { type: 'plan_confirmed' };

// Plan execution
yield { type: 'plan_step_started', step };
yield { type: 'plan_step_completed', step };
yield { type: 'plan_step_failed', step };

// Self-correction
yield { type: 'correction_attempt', attempt };
yield { type: 'correction_success' };
yield { type: 'correction_failed' };
```

---

## Testing Locations

### Unit Tests
- Location: `src/agent/__tests__/grok-agent.test.ts`
- Add tests for: shouldCreatePlan, generateAndConfirmPlan, executePlanSteps

### Integration Tests
- Location: `src/planning/__tests__/integration.test.ts`
- Add tests for: Full plan flow, self-correction, correction limits

### E2E Tests
- Location: `src/__tests__/e2e/`
- Add tests for: Real tool execution, error scenarios

---

## Dependencies Already Available

✅ All required dependencies are already imported:
- TaskOrchestrator
- TaskPlannerTool
- ConfirmationTool
- CodeIntelligenceEngine
- EventEmitter

No new npm packages needed!

---

## Performance Considerations

1. **Plan Detection**: O(n) string matching - negligible
2. **Plan Generation**: Async, doesn't block UI
3. **Plan Execution**: Sequential, no parallelization needed
4. **Correction Tracking**: Map lookup O(1)
5. **Memory**: Correction attempts map cleared after request

---

## Backward Compatibility

✅ All changes are additive:
- Existing agent loop unchanged if planning not triggered
- Existing fallback strategies still work
- Existing tool execution unchanged
- No breaking changes to public APIs


