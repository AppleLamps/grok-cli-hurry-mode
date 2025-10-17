# Autonomous Agent Implementation Plan - Tailored to Grok CLI

**Date**: 2025-10-17  
**Status**: Planning Phase  
**Scope**: Enhance grok-cli from reactive tool-user to proactive autonomous agent

---

## Executive Summary

The grok-cli codebase **already has 70% of the required infrastructure** in place:
- ✅ Task Planning Framework (TaskPlanner, TaskAnalyzer, TaskOrchestrator)
- ✅ Self-Correction System (FallbackStrategy, attemptFallback, retry logic)
- ✅ CodeIntelligenceEngine for context-aware planning

**Remaining work**: Integrate these components into the agent loop and enhance LLM re-engagement for self-correction.

---

## Part 1: Task Planning Framework Integration

### Current State
- `TaskOrchestrator` exists but is only called via `planAndExecute()` method
- `TaskPlannerTool` exists but not automatically triggered for complex requests
- Agent loop doesn't detect when planning is beneficial

### Implementation Tasks

#### Task 1.1: Add Plan Detection Logic to Agent Loop
**File**: `src/agent/grok-agent.ts` (processUserMessageStream method)

**Changes**:
1. Before first LLM call, analyze user message for complexity indicators
2. If complex (multi-file, refactoring, architecture changes), trigger task planner
3. Return plan to user for approval before proceeding

**Complexity Indicators**:
- Keywords: "refactor", "move", "extract", "implement", "restructure"
- Multiple file mentions
- Dependency-related queries
- Architecture/design questions

#### Task 1.2: Integrate Confirmation Flow
**File**: `src/agent/grok-agent.ts`

**Changes**:
1. After plan generation, use `confirmationTool` to present plan to user
2. Show: steps, affected files, risk level, estimated duration
3. Allow user to: approve, modify, or reject plan
4. If approved, execute plan steps sequentially

#### Task 1.3: Sequential Plan Execution
**File**: `src/agent/grok-agent.ts` (new method: `executePlanSteps`)

**Changes**:
1. Iterate through plan steps
2. For each step, call appropriate tool via `executeTool`
3. Track progress and emit events
4. Handle step failures with rollback if configured

---

## Part 2: Self-Correcting Execution Loop Enhancement

### Current State
- Fallback strategies exist for 6 tools
- `attemptFallback` method handles retries with exponential backoff
- No LLM re-engagement for strategy selection

### Implementation Tasks

#### Task 2.1: Implement SELF_CORRECT_ATTEMPT Signal
**File**: `src/agent/grok-agent.ts` (executeTool method)

**Changes**:
1. When high-level tool fails (refactoring_assistant, code_analysis), return special signal
2. Signal format: `{ success: false, error: "SELF_CORRECT_ATTEMPT: <fallback_request>" }`
3. Include context: original goal, failure reason, suggested approach

#### Task 2.2: LLM Re-engagement in Agent Loop
**File**: `src/agent/grok-agent.ts` (processUserMessageStream method)

**Changes**:
1. Detect `SELF_CORRECT_ATTEMPT` in tool results
2. Create new LLM prompt with fallback request
3. Feed back to LLM for new tool call generation
4. Track correction attempts to prevent infinite loops

#### Task 2.3: Correction Attempt Tracking
**File**: `src/agent/grok-agent.ts`

**Changes**:
1. Add `correctionAttempts` map: `Map<string, number>`
2. Limit corrections per original request (max 3)
3. Log correction chain for debugging
4. Emit events for UI feedback

---

## Implementation Order

### Phase 1: Plan Detection (2-3 hours)
1. Add `shouldCreatePlan()` heuristic method
2. Integrate into `processUserMessageStream` before first LLM call
3. Test with sample complex requests

### Phase 2: Confirmation & Execution (2-3 hours)
1. Implement `executePlanSteps()` method
2. Integrate confirmation flow
3. Add progress tracking and events

### Phase 3: LLM Re-engagement (2-3 hours)
1. Implement `SELF_CORRECT_ATTEMPT` signal
2. Add correction detection in agent loop
3. Implement correction attempt tracking

### Phase 4: Testing & Refinement (2-3 hours)
1. Write integration tests
2. Test edge cases and error scenarios
3. Performance optimization

---

## Key Files to Modify

| File | Changes | Lines |
|------|---------|-------|
| `src/agent/grok-agent.ts` | Plan detection, confirmation, LLM re-engagement | +150-200 |
| `src/planning/task-orchestrator.ts` | Minor: add event emissions | +10-20 |
| `src/tools/task-planner-tool.ts` | Minor: enhance result formatting | +20-30 |

---

## Success Criteria

1. ✅ Agent automatically detects complex requests
2. ✅ User can approve/reject generated plans
3. ✅ Plans execute sequentially with progress tracking
4. ✅ Failed tools trigger fallback strategies
5. ✅ LLM re-engages with fallback requests
6. ✅ Correction attempts are tracked and limited
7. ✅ All existing functionality remains intact

---

## Risk Mitigation

- **Infinite loops**: Limit correction attempts per request
- **Performance**: Cache plan analysis results
- **User experience**: Clear messaging about plan generation and corrections
- **Backward compatibility**: All changes are additive, no breaking changes


