# Implementation Plan: Tool Enhancements

**Status**: Ready for Implementation  
**Priority**: High  
**Estimated Duration**: 2-3 weeks  
**Complexity**: Medium

---

## Overview

Enhance three existing tools to leverage the CodeIntelligenceEngine's capabilities:
1. CodeContextTool: Add navigation features
2. RefactoringAssistantTool: Improve extract_function
3. RefactoringAssistantTool: Implement move operations

---

## Phase 1: CodeContextTool Navigation (2-3 days)

### Task 1.1: Add goToDefinition() Method
**File**: `src/tools/intelligence/code-context.ts`

**What to do**:
- Add public method `goToDefinition(symbolName: string)`
- Use `engine.findSymbol()` to locate symbol
- Return: `{ filePath, lineNumber, columnNumber, symbolType }`
- Handle not-found cases gracefully

**Code Pattern**:
```typescript
async goToDefinition(symbolName: string): Promise<DefinitionLocation | null> {
  const refs = this.intelligenceEngine.findSymbol(symbolName);
  if (refs.length === 0) return null;
  
  const ref = refs[0]; // First definition
  return {
    filePath: ref.filePath,
    lineNumber: ref.symbol.startPosition.row,
    columnNumber: ref.symbol.startPosition.column,
    symbolType: ref.symbol.type
  };
}
```

### Task 1.2: Add findUsages() Method
**File**: `src/tools/intelligence/code-context.ts`

**What to do**:
- Add public method `findUsages(symbolName: string)`
- Use `engine.findReferences()` to get all usages
- Return array of usage locations with context
- Include usage type (call, reference, import, export)

**Code Pattern**:
```typescript
async findUsages(symbolName: string): Promise<UsageLocation[]> {
  const crossRef = this.intelligenceEngine.findReferences(symbolName);
  if (!crossRef) return [];
  
  return crossRef.references.map(ref => ({
    filePath: ref.file,
    lineNumber: ref.line,
    columnNumber: ref.column,
    usageType: ref.type
  }));
}
```

### Task 1.3: Update Tool Schema
**File**: `src/grok/tools.ts`

**What to do**:
- Add `goToDefinition` operation to code_context schema
- Add `findUsages` operation to code_context schema
- Update execute() method to route to new methods

---

## Phase 2: Smarter extract_function (3-4 days)

### Task 2.1: Enhance analyzeExtractedCode()
**File**: `src/tools/intelligence/refactoring-assistant.ts`

**What to do**:
- Improve variable scope detection
- Use engine's symbol index to identify:
  - Variables defined before extraction
  - Variables used after extraction
  - External dependencies
- Return accurate parameter list and return type

**Key Improvements**:
- Analyze variable lifetimes
- Detect closure variables
- Identify return values
- Handle destructuring patterns

### Task 2.2: Add Parameter Auto-Detection
**File**: `src/tools/intelligence/refactoring-assistant.ts`

**What to do**:
- Make `parameters` optional in ExtractFunctionRequest
- Auto-generate if not provided
- Validate against manual parameters if provided
- Add confidence score

### Task 2.3: Add Tests
**File**: `src/tools/intelligence/__tests__/refactoring-extract.test.ts`

**What to do**:
- Test parameter detection accuracy
- Test return type inference
- Test edge cases (closures, destructuring)

---

## Phase 3: Move Operations (5-7 days)

### Task 3.1: Implement move_function
**File**: `src/tools/intelligence/refactoring-assistant.ts`

**What to do**:
- Implement `performMove()` method for functions
- Extract function from source file
- Add to destination file
- Update all import statements in dependent files
- Handle circular dependencies

**Steps**:
1. Find function definition using engine
2. Extract function code
3. Identify all files that import this function
4. Update imports in those files
5. Remove function from source file
6. Add function to destination file

### Task 3.2: Implement move_class
**File**: `src/tools/intelligence/refactoring-assistant.ts`

**What to do**:
- Similar to move_function but for classes
- Handle class inheritance
- Update all import statements
- Handle static methods and properties

### Task 3.3: Add Safety Analysis
**File**: `src/tools/intelligence/refactoring-assistant.ts`

**What to do**:
- Detect circular dependencies
- Warn about breaking changes
- Validate destination file compatibility
- Check for naming conflicts

### Task 3.4: Add Integration Tests
**File**: `src/tools/intelligence/__tests__/refactoring-move.test.ts`

**What to do**:
- Test move_function with various scenarios
- Test move_class with inheritance
- Test import updates
- Test circular dependency detection

---

## Implementation Checklist

### Phase 1
- [ ] Add goToDefinition() method
- [ ] Add findUsages() method
- [ ] Update tool schema
- [ ] Add unit tests
- [ ] Update documentation

### Phase 2
- [ ] Enhance analyzeExtractedCode()
- [ ] Add parameter auto-detection
- [ ] Add tests
- [ ] Update documentation

### Phase 3
- [ ] Implement move_function
- [ ] Implement move_class
- [ ] Add safety analysis
- [ ] Add integration tests
- [ ] Update documentation

---

## Success Criteria

✅ All methods implemented and tested  
✅ No breaking changes to existing APIs  
✅ 100% test coverage for new code  
✅ Documentation updated  
✅ Performance acceptable (< 1s for typical operations)  

---

## Dependencies

- CodeIntelligenceEngine (already available)
- MultiFileEditorTool (already available)
- OperationHistoryTool (already available)

---

## Notes

- Use existing engine methods to avoid duplication
- Leverage MultiFileEditorTool for atomic operations
- Add comprehensive error handling
- Consider performance with large codebases

