# Example Scenarios - Autonomous Agent in Action

---

## Scenario 1: Automatic Plan Generation (Happy Path)

### User Input
```
"Refactor the authentication module to use dependency injection. 
It currently spans auth.ts, middleware.ts, and services/auth-service.ts"
```

### Agent Behavior

**Step 1: Plan Detection**
```
✓ Keyword "refactor" detected (+2)
✓ Multiple files mentioned (3) (+2)
✓ Architecture pattern "dependency injection" (+1)
→ Complexity Score: 5 ≥ 3 → PLAN TRIGGERED
```

**Step 2: Plan Generation**
```
📋 Analyzing request...
   - Found 3 affected files
   - Detected 8 dependencies
   - Risk level: MEDIUM
   - Estimated duration: 25 seconds
```

**Step 3: User Confirmation**
```
📋 Task Plan Generated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Intent: Refactor authentication module to use dependency injection
Risk Level: MEDIUM | Estimated Duration: 25s | Files Affected: 3

Steps:
  1. [ANALYZE] Analyze current architecture (2s)
  2. [REFACTOR] Create DI container (5s)
  3. [REFACTOR] Update auth.ts (8s)
  4. [REFACTOR] Update middleware.ts (5s)
  5. [VALIDATE] Validate changes (5s)

Approve? (y/n): y
```

**Step 4: Plan Execution**
```
🚀 Executing plan...
  ✓ Step 1: Analyzed architecture
  ✓ Step 2: Created DI container
  ✓ Step 3: Updated auth.ts
  ✓ Step 4: Updated middleware.ts
  ✓ Step 5: Validated changes

✅ Plan completed successfully in 24 seconds!
```

---

## Scenario 2: Self-Correction on Failure

### User Input
```
"Extract the payment processing logic from checkout.ts into a separate module"
```

### Agent Behavior

**Step 1: Plan Generated & Approved**
```
Plan created with 4 steps using refactoring_assistant tool
User approves
```

**Step 2: Execution Starts**
```
🚀 Executing plan...
  ✓ Step 1: Analyzed payment logic
  ✓ Step 2: Identified extraction points
  ✗ Step 3: Extract function failed
    Error: "Cannot determine function boundaries in complex nested structure"
```

**Step 3: Self-Correction Triggered**
```
🔄 Self-correction attempt 1/3
   Strategy: decompose_and_retry
   Falling back to multi_file_edit tool...

   New approach:
   - Use multi_file_edit for more direct manipulation
   - Create new payment-processor.ts
   - Move code with explicit line ranges
   - Update imports manually
```

**Step 4: Retry with Fallback**
```
  ✓ Step 3 (retry): Created payment-processor.ts
  ✓ Step 3 (retry): Moved payment logic
  ✓ Step 4: Updated imports
  ✓ Step 5: Validated changes

✅ Plan completed successfully after 1 self-correction!
```

---

## Scenario 3: User Rejects Plan

### User Input
```
"Refactor the authentication module to use dependency injection"
```

### Agent Behavior

**Step 1: Plan Generated**
```
📋 Task Plan Generated
...
Approve? (y/n): n
```

**Step 2: Fallback to Standard Loop**
```
Plan rejected. Proceeding with standard agent loop...

🤖 I can help you refactor the authentication module. Let me start by 
analyzing the current structure...

[Standard agent loop continues with LLM-guided approach]
```

---

## Scenario 4: Max Correction Attempts Exceeded

### User Input
```
"Refactor the entire codebase to use TypeScript strict mode"
```

### Agent Behavior

**Step 1: Plan Execution Starts**
```
🚀 Executing plan...
  ✓ Step 1: Analyzed codebase
  ✗ Step 2: Refactoring failed
```

**Step 2-4: Self-Correction Attempts**
```
🔄 Self-correction attempt 1/3 - Failed
🔄 Self-correction attempt 2/3 - Failed
🔄 Self-correction attempt 3/3 - Failed
```

**Step 5: Give Up & Report**
```
❌ Self-correction attempts exhausted.

The refactoring operation encountered persistent issues:
- Attempt 1: refactoring_assistant failed
- Attempt 2: multi_file_edit failed
- Attempt 3: code_analysis failed

Recommendation: Try a more targeted approach, such as:
1. Refactor one module at a time
2. Use manual edits for complex cases
3. Run tests after each change

Would you like to try a different approach?
```

---

## Scenario 5: Simple Request (No Planning)

### User Input
```
"What's the purpose of the UserService class?"
```

### Agent Behavior

**Step 1: Plan Detection**
```
✗ No complexity keywords
✗ No multiple files mentioned
✗ No architecture patterns
→ Complexity Score: 0 < 3 → NO PLAN NEEDED
```

**Step 2: Standard Agent Loop**
```
🤖 Let me analyze the UserService class for you...

[Uses code_context tool to find and analyze UserService]

The UserService class is responsible for:
- User authentication and authorization
- Profile management
- Session handling
...
```

---

## Scenario 6: Plan with Dependencies

### User Input
```
"Move the database connection logic from main.ts to a new db-config.ts file, 
then update all imports across the codebase"
```

### Agent Behavior

**Step 1: Plan Generated**
```
Plan with 5 steps:
  1. [ANALYZE] Find all database-related code
  2. [CREATE] Create db-config.ts
  3. [MOVE] Move connection logic (depends on step 2)
  4. [REFACTOR] Update imports (depends on step 3)
  5. [VALIDATE] Validate changes (depends on step 4)
```

**Step 2: Execution with Dependency Handling**
```
🚀 Executing plan...
  ✓ Step 1: Found 12 database references
  ✓ Step 2: Created db-config.ts
  ✓ Step 3: Moved connection logic (depends on step 2 ✓)
  ✓ Step 4: Updated imports (depends on step 3 ✓)
  ✓ Step 5: Validated changes (depends on step 4 ✓)

✅ All dependencies satisfied. Plan completed successfully!
```

---

## Scenario 7: Partial Failure with Rollback

### User Input
```
"Refactor the payment module and add new features"
```

### Agent Behavior

**Step 1: Plan Execution**
```
🚀 Executing plan...
  ✓ Step 1: Analyzed payment module
  ✓ Step 2: Refactored payment processor
  ✗ Step 3: Add new feature failed
    Error: "Conflicting with existing code"
```

**Step 2: Auto-Rollback Triggered**
```
⚠️  Auto-rollback enabled. Rolling back changes...
  ↩️  Reverted Step 2: Refactored payment processor
  ↩️  Reverted Step 1: Analyzed payment module

❌ Plan rolled back due to failure in Step 3.

Recommendation: Fix the conflict and try again.
```

---

## Scenario 8: Complex Multi-File Refactoring

### User Input
```
"Extract common validation logic from auth.ts, user.ts, and admin.ts 
into a shared validators.ts module"
```

### Agent Behavior

**Step 1: Plan Generated**
```
Plan with 6 steps:
  1. [ANALYZE] Identify common validation patterns
  2. [CREATE] Create validators.ts
  3. [EXTRACT] Extract from auth.ts
  4. [EXTRACT] Extract from user.ts
  5. [EXTRACT] Extract from admin.ts
  6. [VALIDATE] Run tests
```

**Step 2: Execution**
```
🚀 Executing plan...
  ✓ Step 1: Found 8 common patterns
  ✓ Step 2: Created validators.ts
  ✓ Step 3: Extracted from auth.ts
  ✓ Step 4: Extracted from user.ts
  ✓ Step 5: Extracted from admin.ts
  ✓ Step 6: Tests passed

✅ Refactoring completed! Reduced code duplication by 45%.
```

---

## Key Observations

1. **Automatic Detection**: Complex requests trigger planning automatically
2. **User Control**: Users can approve, reject, or modify plans
3. **Graceful Degradation**: Failures trigger self-correction, not crashes
4. **Transparency**: All steps are visible and trackable
5. **Safety**: Rollback prevents partial failures
6. **Learning**: Each correction improves future attempts


