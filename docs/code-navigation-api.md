# Code Navigation API Reference

## Overview

The CodeContextTool now supports three operations:
1. **analyze_context** - Original comprehensive code analysis
2. **go_to_definition** - Jump to symbol definition (NEW)
3. **find_usages** - Find all symbol usages (NEW)

---

## API Reference

### Go to Definition

Jump to where a symbol is defined in the codebase.

**Request:**
```json
{
  "operation": "go_to_definition",
  "symbolName": "string (required)",
  "rootPath": "string (optional, defaults to cwd)"
}
```

**Response (Success):**
```json
{
  "success": true,
  "output": {
    "filePath": "relative/path/to/file.ts",
    "absolutePath": "/absolute/path/to/file.ts",
    "lineNumber": 80,
    "columnNumber": 14,
    "symbolType": "class|function|variable|interface|enum|type",
    "symbolName": "SymbolName",
    "preview": "export class SymbolName {"
  }
}
```

**Response (Not Found):**
```json
{
  "success": false,
  "error": "Symbol 'SymbolName' not found"
}
```

**Example:**
```typescript
// Find where CodeIntelligenceEngine is defined
const result = await codeContext.execute({
  operation: "go_to_definition",
  symbolName: "CodeIntelligenceEngine"
});
```

---

### Find Usages

Find all places where a symbol is used in the codebase.

**Request:**
```json
{
  "operation": "find_usages",
  "symbolName": "string (required)",
  "rootPath": "string (optional, defaults to cwd)",
  "includeDefinition": "boolean (optional, defaults to true)"
}
```

**Response:**
```json
{
  "success": true,
  "output": {
    "symbolName": "SymbolName",
    "totalUsages": 5,
    "definition": {
      "filePath": "relative/path/to/file.ts",
      "absolutePath": "/absolute/path/to/file.ts",
      "lineNumber": 80,
      "columnNumber": 14,
      "symbolType": "class",
      "symbolName": "SymbolName",
      "preview": "export class SymbolName {"
    },
    "usages": [
      {
        "filePath": "relative/path/to/file.ts",
        "absolutePath": "/absolute/path/to/file.ts",
        "lineNumber": 80,
        "columnNumber": 14,
        "usageType": "definition|call|reference|import|export",
        "context": "export class SymbolName {"
      }
    ]
  }
}
```

**Example:**
```typescript
// Find all usages of goToDefinition
const result = await codeContext.execute({
  operation: "find_usages",
  symbolName: "goToDefinition",
  includeDefinition: true
});
```

---

### Analyze Context (Original)

Build comprehensive code context for a file.

**Request:**
```json
{
  "operation": "analyze_context",  // optional, this is the default
  "filePath": "string (required)",
  "rootPath": "string (optional)",
  "includeRelationships": "boolean (optional, default: true)",
  "includeMetrics": "boolean (optional, default: true)",
  "includeSemantics": "boolean (optional, default: true)",
  "maxRelatedFiles": "number (optional, default: 10)",
  "contextDepth": "number (optional, default: 2)"
}
```

**Response:**
```json
{
  "success": true,
  "output": {
    "filePath": "relative/path/to/file.ts",
    "symbols": [...],
    "dependencies": [...],
    "relationships": [...],
    "semanticContext": {...},
    "codeMetrics": {...}
  }
}
```

---

## TypeScript Types

```typescript
interface DefinitionLocation {
  filePath: string;
  absolutePath: string;
  lineNumber: number;
  columnNumber: number;
  symbolType: string;
  symbolName: string;
  preview?: string;
}

interface UsageLocation {
  filePath: string;
  absolutePath: string;
  lineNumber: number;
  columnNumber: number;
  usageType: 'definition' | 'call' | 'reference' | 'import' | 'export';
  context: string;
}

interface FindUsagesResult {
  symbolName: string;
  totalUsages: number;
  definition?: DefinitionLocation;
  usages: UsageLocation[];
}
```

---

## Usage Patterns

### Pattern 1: Navigate to Definition
```typescript
// User: "Where is this function defined?"
const def = await codeContext.execute({
  operation: "go_to_definition",
  symbolName: "myFunction"
});

console.log(`Defined at ${def.filePath}:${def.lineNumber}`);
```

### Pattern 2: Find All References
```typescript
// User: "Show me everywhere this is used"
const usages = await codeContext.execute({
  operation: "find_usages",
  symbolName: "myFunction"
});

console.log(`Found ${usages.totalUsages} usages`);
usages.usages.forEach(usage => {
  console.log(`${usage.filePath}:${usage.lineNumber} - ${usage.usageType}`);
});
```

### Pattern 3: Pre-Refactoring Check
```typescript
// Before renaming, check impact
const usages = await codeContext.execute({
  operation: "find_usages",
  symbolName: "oldName"
});

if (usages.totalUsages > 10) {
  console.warn("This will affect many files!");
}

// Proceed with rename
await refactoringAssistant.execute({
  operation: "rename",
  symbolName: "oldName",
  newName: "newName"
});
```

### Pattern 4: Code Exploration
```typescript
// Explore a new codebase
const def = await codeContext.execute({
  operation: "go_to_definition",
  symbolName: "MainClass"
});

// Then find how it's used
const usages = await codeContext.execute({
  operation: "find_usages",
  symbolName: "MainClass"
});

// Analyze the main file
const context = await codeContext.execute({
  filePath: def.absolutePath
});
```

---

## Error Handling

```typescript
try {
  const result = await codeContext.execute({
    operation: "go_to_definition",
    symbolName: "NonExistentSymbol"
  });
  
  if (!result.success) {
    console.error(result.error); // "Symbol 'NonExistentSymbol' not found"
  }
} catch (error) {
  console.error("Unexpected error:", error);
}
```

---

## Performance Tips

1. **Index Once**: The engine indexes files on first access
2. **Reuse Results**: Cache results for frequently accessed symbols
3. **Batch Operations**: Group related queries together
4. **Limit Scope**: Use rootPath to limit search scope

---

## Limitations

- Requires files to be indexed by CodeIntelligenceEngine
- Best support for TypeScript/JavaScript files
- Static analysis only (no runtime symbol resolution)
- Relative imports work best for dependency tracking

---

## Integration Examples

### With Grok CLI
```bash
# In conversation with Grok
User: "Where is CodeIntelligenceEngine defined?"
Grok: *uses go_to_definition* "It's defined in src/tools/intelligence/engine.ts at line 80"

User: "Show me all usages of that class"
Grok: *uses find_usages* "Found 15 usages across 8 files..."
```

### Programmatic Usage
```typescript
import { CodeContextTool } from './tools/intelligence';
import { CodeIntelligenceEngine } from './tools/intelligence/engine';

const engine = new CodeIntelligenceEngine('/path/to/project');
await engine.indexDirectory('/path/to/project/src');

const codeContext = new CodeContextTool(engine);

// Navigate to definition
const def = await codeContext.goToDefinition('MyClass');

// Find usages
const usages = await codeContext.findUsages('MyClass');
```

---

## See Also

- [Code Navigation Demo](../examples/code-navigation-demo.md)
- [CodeIntelligenceEngine API](./intelligence-engine-api.md)
- [Refactoring Assistant API](./refactoring-api.md)

