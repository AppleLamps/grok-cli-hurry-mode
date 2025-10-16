# Current vs. Proposed State

## CodeContextTool

### Current Capabilities
```typescript
// What it does now:
- Analyzes code context for a single file
- Provides semantic understanding
- Identifies code relationships
- Calculates code metrics
- Detects design patterns

// Methods available:
execute(args: {
  filePath: string,
  rootPath?: string,
  includeRelationships?: boolean,
  includeMetrics?: boolean,
  includeSemantics?: boolean
}): Promise<CodeContext>
```

### Proposed Additions
```typescript
// New methods to add:

// 1. Go to Definition
async goToDefinition(symbolName: string): Promise<{
  filePath: string,
  lineNumber: number,
  columnNumber: number,
  symbolType: 'function' | 'class' | 'variable' | ...
}>

// 2. Find Usages
async findUsages(symbolName: string): Promise<Array<{
  filePath: string,
  lineNumber: number,
  columnNumber: number,
  usageType: 'definition' | 'call' | 'reference' | 'import' | 'export',
  context: string
}>>
```

### Use Cases
- **IDE Feature Parity**: "Go to Definition" (Ctrl+Click in VS Code)
- **Code Navigation**: Jump to symbol definitions
- **Impact Analysis**: See all places a symbol is used
- **Refactoring Safety**: Verify all usages before changes

---

## RefactoringAssistantTool

### Current Capabilities
```typescript
// Implemented operations:
✅ rename - Rename symbols across codebase
✅ extract_function - Extract code into new function
✅ extract_variable - Extract expression into variable
✅ inline_function - Inline function calls
❌ inline_variable - Not implemented
❌ move_function - Not implemented
❌ move_class - Not implemented

// extract_function current signature:
{
  filePath: string,
  startLine: number,
  endLine: number,
  functionName: string,
  parameters?: Array<{name: string, type?: string}>,  // MANUAL
  returnType?: string  // MANUAL
}
```

### Proposed Improvements

#### 1. Smarter extract_function
```typescript
// BEFORE: Manual parameter specification required
{
  filePath: string,
  startLine: number,
  endLine: number,
  functionName: string,
  parameters: [{name: 'x', type: 'number'}, ...],  // ❌ User must specify
  returnType: 'string'  // ❌ User must specify
}

// AFTER: Auto-detection with optional override
{
  filePath: string,
  startLine: number,
  endLine: number,
  functionName: string,
  parameters?: [{name: 'x', type: 'number'}, ...],  // ✅ Optional, auto-detected
  returnType?: 'string',  // ✅ Optional, auto-detected
  autoDetect?: boolean  // ✅ New option
}

// Result includes confidence scores:
{
  type: 'extract_function',
  parameters: [{
    name: 'x',
    type: 'number',
    confidence: 0.95  // ✅ New
  }],
  returnType: {
    type: 'string',
    confidence: 0.87  // ✅ New
  }
}
```

#### 2. move_function Implementation
```typescript
// NEW operation
{
  operation: 'move_function',
  symbolName: 'calculateTotal',
  sourceFile: 'src/utils/math.ts',
  destinationFile: 'src/services/calculator.ts',
  updateImports: true  // ✅ Auto-update all imports
}

// Result:
{
  type: 'move_function',
  description: 'Move calculateTotal from math.ts to calculator.ts',
  files: [
    {
      filePath: 'src/utils/math.ts',
      changes: [{type: 'delete', ...}]
    },
    {
      filePath: 'src/services/calculator.ts',
      changes: [{type: 'insert', ...}]
    },
    {
      filePath: 'src/components/Report.ts',
      changes: [{type: 'replace', oldText: 'import {...} from utils/math', newText: 'import {...} from services/calculator'}]
    }
  ],
  safety: {
    riskLevel: 'low',
    warnings: []
  }
}
```

#### 3. move_class Implementation
```typescript
// NEW operation
{
  operation: 'move_class',
  symbolName: 'UserService',
  sourceFile: 'src/services/user.ts',
  destinationFile: 'src/domain/services/user.ts',
  updateImports: true
}

// Handles:
// ✅ Class definition
// ✅ Static methods
// ✅ Class properties
// ✅ Inheritance relationships
// ✅ All import statements
// ✅ Circular dependencies
```

---

## Feature Comparison Table

| Feature | Current | Proposed | Impact |
|---------|---------|----------|--------|
| Go to Definition | ❌ | ✅ | IDE parity |
| Find Usages | ❌ | ✅ | Code navigation |
| Auto-detect Parameters | ❌ | ✅ | Better UX |
| Auto-detect Return Type | ❌ | ✅ | Better UX |
| Move Function | ❌ | ✅ | Major feature |
| Move Class | ❌ | ✅ | Major feature |
| Auto-update Imports | ❌ | ✅ | Safety |
| Circular Dep Detection | ❌ | ✅ | Safety |

---

## Engine Support Status

### Already Available in CodeIntelligenceEngine

```typescript
// Symbol Navigation
findSymbol(symbolName: string): SymbolReference[]
findReferences(symbolName: string): CrossReference | undefined

// Dependency Tracking
getDependencies(filePath: string): Set<string>
getDependents(filePath: string): Set<string>

// Symbol Analysis
getFileSymbols(filePath: string): SymbolInfo[]
getFileMetadata(filePath: string): FileMetadata | undefined

// Scope Analysis
// (Already used in extract_function analysis)
```

### No New Engine Features Needed ✅

All proposed features can be implemented using existing engine capabilities!

---

## Summary

| Aspect | Status |
|--------|--------|
| Feasibility | ✅ Highly Feasible |
| Engine Support | ✅ Complete |
| Architecture Fit | ✅ Perfect |
| User Value | ✅ High |
| Implementation Risk | ✅ Low |
| Effort Required | ⚠️ 14-20 hours |
| Timeline | ⚠️ 2-3 weeks |

**Recommendation**: ✅ **IMPLEMENT ALL SUGGESTIONS**

