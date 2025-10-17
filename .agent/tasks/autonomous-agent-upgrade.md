# Autonomous Agent Upgrade: Task Planning Framework & Self-Correcting Execution

## Overview

Upgrading grok-cli from a tool-using assistant to a true autonomous agent with:
1. **Enhanced Task Planning Framework** - Intelligent multi-step task decomposition using CodeIntelligenceEngine
2. **Self-Correcting Execution Loop** - Graceful handling of tool failures with alternative strategies

## Part 1: Enhanced Task Planning Framework

### Objectives
- Leverage CodeIntelligenceEngine for context-aware planning
- Generate concrete, verifiable steps from high-level user goals
- Use symbol search and dependency analysis to inform planning
- Create executable plans with proper tool calls and arguments

### Implementation Strategy

#### 1.1 Enhance TaskPlanner.createPlan()
**File**: `src/planning/task-planner.ts`

**Changes**:
- Integrate CodeIntelligenceEngine for codebase analysis
- Use symbol_search to find relevant files (routes, controllers, services)
- Query dependency graph to understand relationships
- Generate detailed tool calls with specific file paths and operations

**Example Flow for "Add a new /users/:id endpoint"**:
1. Use symbol_search to find route files
2. Use symbol_search to find controller files
3. Use symbol_search to find service files
4. Analyze dependencies between these files
5. Generate steps:
   - Edit route file to add endpoint
   - Create/edit controller function
   - Create/edit service method
   - Update imports
   - Validate changes

#### 1.2 Integrate with GrokAgent
**File**: `src/agent/grok-agent.ts`

**Changes**:
- Add `planBeforeExecution` flag to enable automatic planning
- Modify `processUserMessage` to detect complex tasks
- Call TaskPlanner before tool execution for complex requests
- Present plan to user via confirmation_tool
- Execute plan steps sequentially if approved

### Key Features
- **Context-Aware Planning**: Uses actual codebase structure
- **Intelligent File Discovery**: Finds relevant files automatically
- **Dependency-Aware**: Understands relationships between files
- **Concrete Tool Calls**: Generates specific, executable operations

## Part 2: Self-Correcting Execution Loop

### Objectives
- Handle tool failures gracefully
- Attempt recovery using alternative strategies
- Provide fallback mechanisms for high-level tools
- Learn from failures to improve future executions

### Implementation Strategy

#### 2.1 Wrap executeTool with Error Handling
**File**: `src/agent/grok-agent.ts`

**Changes**:
- Wrap switch statement in try-catch
- Implement fallback logic for failed tools
- Track failure patterns
- Attempt alternative approaches

#### 2.2 Fallback Strategies

**High-Level Tool Failures**:
- `refactoring_assistant` → `multi_file_edit` + `code_analysis`
- `code_analysis` → `str_replace_editor` + manual analysis
- `multi_file_edit` → individual `str_replace_editor` calls
- `advanced_search` → `search` + `bash` grep

**Example Fallback Logic**:
```typescript
if (toolCall.function.name === 'refactoring_assistant') {
  // Generate fallback plan using multi_file_edit
  const fallbackSteps = await this.generateFallbackPlan(
    'refactoring_assistant',
    args,
    error
  );
  return await this.executeFallbackPlan(fallbackSteps);
}
```

#### 2.3 Retry Mechanism
- Track retry count per tool call
- Implement exponential backoff
- Maximum 3 retries per operation
- Different strategy each retry

### Key Features
- **Graceful Degradation**: Falls back to simpler tools
- **Automatic Recovery**: Attempts alternative approaches
- **Error Context**: Preserves error information for learning
- **User Transparency**: Reports fallback attempts

## Implementation Tasks

### Phase 1: Enhanced Task Planning (Priority 1)
- [x] Analyze current TaskPlanner implementation
- [ ] Integrate CodeIntelligenceEngine into TaskPlanner
- [ ] Implement symbol-based file discovery
- [ ] Enhance generateSteps() with concrete tool calls
- [ ] Add endpoint creation example
- [ ] Test with real-world scenarios

### Phase 2: Self-Correcting Execution (Priority 1)
- [ ] Add error handling wrapper to executeTool
- [ ] Implement fallback strategy map
- [ ] Create generateFallbackPlan() method
- [ ] Add retry mechanism with backoff
- [ ] Track failure patterns
- [ ] Test recovery scenarios

### Phase 3: Integration & Testing (Priority 2)
- [ ] Integrate planning into processUserMessage
- [ ] Add user confirmation for generated plans
- [ ] Test end-to-end workflows
- [ ] Add comprehensive error scenarios
- [ ] Performance optimization
- [ ] Documentation updates

## Success Metrics

### Task Planning
- ✅ Plans generated for complex requests (e.g., "Add endpoint")
- ✅ Correct files identified via symbol search
- ✅ Dependencies properly analyzed
- ✅ Tool calls are executable and specific
- ✅ User confirmation works correctly

### Self-Correction
- ✅ Tool failures trigger fallback logic
- ✅ Alternative strategies succeed where original failed
- ✅ Retry mechanism prevents infinite loops
- ✅ Error context preserved and reported
- ✅ User informed of recovery attempts

## Example Scenarios

### Scenario 1: Add New Endpoint
**User Request**: "Add a new /users/:id endpoint"

**Expected Plan**:
1. Search for route files → finds `src/routes/userRoutes.ts`
2. Search for controller files → finds `src/controllers/userController.ts`
3. Search for service files → finds `src/services/userService.ts`
4. Generate steps:
   - Edit `userRoutes.ts` to add GET /users/:id route
   - Edit `userController.ts` to add getUserById function
   - Edit `userService.ts` to add findUserById method
   - Update imports in all files
   - Validate with dependency_analyzer

### Scenario 2: Refactoring with Fallback
**User Request**: "Refactor authentication module"

**Execution Flow**:
1. Try `refactoring_assistant` → FAILS (complex operation)
2. Fallback to `multi_file_edit`:
   - Analyze auth files with `code_context`
   - Generate specific edits for each file
   - Execute edits sequentially
   - Validate with `dependency_analyzer`
3. Success via fallback strategy

## Technical Details

### CodeIntelligenceEngine Integration
```typescript
// In TaskPlanner
private async findRelevantFiles(intent: string, keywords: string[]): Promise<string[]> {
  const engine = this.analyzer.getIntelligenceEngine();
  const results = await engine.searchSymbols(keywords, { fuzzy: true });
  return results.map(r => r.filePath);
}
```

### Fallback Strategy Map
```typescript
private fallbackStrategies: Map<string, FallbackStrategy> = new Map([
  ['refactoring_assistant', {
    fallbackTools: ['multi_file_edit', 'code_analysis'],
    strategy: 'decompose_and_retry'
  }],
  ['multi_file_edit', {
    fallbackTools: ['str_replace_editor'],
    strategy: 'sequential_execution'
  }]
]);
```

## Timeline

- **Phase 1**: 4-6 hours (Enhanced Task Planning)
- **Phase 2**: 3-4 hours (Self-Correcting Execution)
- **Phase 3**: 2-3 hours (Integration & Testing)
- **Total**: 9-13 hours

## Dependencies

- CodeIntelligenceEngine (existing)
- TaskOrchestrator (existing)
- All tool implementations (existing)
- Confirmation system (existing)

## Risks & Mitigations

**Risk**: Fallback strategies may not always succeed
**Mitigation**: Implement multiple fallback levels, final fallback to user guidance

**Risk**: Planning may be slow for large codebases
**Mitigation**: Cache symbol search results, implement timeout limits

**Risk**: Generated plans may be incorrect
**Mitigation**: Always require user confirmation, provide detailed previews

## Next Steps

1. Implement enhanced TaskPlanner with CodeIntelligenceEngine
2. Add self-correcting execution wrapper
3. Test with real-world scenarios
4. Iterate based on results
5. Document new capabilities in README

---

**Status**: Planning Complete - Ready for Implementation
**Priority**: P0 - Critical for autonomous agent capabilities
**Estimated Completion**: 2-3 days

