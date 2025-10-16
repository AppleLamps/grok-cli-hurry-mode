# Code Navigation Features Demo

This document demonstrates the new navigation features added to the CodeContextTool.

## Features

### 1. Go to Definition
Jump to where a symbol is defined in the codebase.

**Usage:**
```typescript
{
  operation: "go_to_definition",
  symbolName: "CodeIntelligenceEngine",
  rootPath: "/path/to/project"
}
```

**Response:**
```json
{
  "filePath": "src/tools/intelligence/engine.ts",
  "absolutePath": "/path/to/project/src/tools/intelligence/engine.ts",
  "lineNumber": 80,
  "columnNumber": 14,
  "symbolType": "class",
  "symbolName": "CodeIntelligenceEngine",
  "preview": "export class CodeIntelligenceEngine {"
}
```

### 2. Find Usages
Find all places where a symbol is used in the codebase.

**Usage:**
```typescript
{
  operation: "find_usages",
  symbolName: "goToDefinition",
  rootPath: "/path/to/project",
  includeDefinition: true
}
```

**Response:**
```json
{
  "symbolName": "goToDefinition",
  "totalUsages": 5,
  "definition": {
    "filePath": "src/tools/intelligence/code-context.ts",
    "absolutePath": "/path/to/project/src/tools/intelligence/code-context.ts",
    "lineNumber": 832,
    "columnNumber": 9,
    "symbolType": "function",
    "symbolName": "goToDefinition",
    "preview": "async goToDefinition(symbolName: string, rootPath: string = process.cwd()): Promise<DefinitionLocation | null> {"
  },
  "usages": [
    {
      "filePath": "src/tools/intelligence/code-context.ts",
      "absolutePath": "/path/to/project/src/tools/intelligence/code-context.ts",
      "lineNumber": 832,
      "columnNumber": 9,
      "usageType": "definition",
      "context": "async goToDefinition(symbolName: string, rootPath: string = process.cwd()): Promise<DefinitionLocation | null> {"
    },
    {
      "filePath": "src/tools/intelligence/code-context.ts",
      "absolutePath": "/path/to/project/src/tools/intelligence/code-context.ts",
      "lineNumber": 197,
      "columnNumber": 28,
      "usageType": "call",
      "context": "const result = await this.goToDefinition(symbolName, rootPath);"
    }
  ]
}
```

### 3. Analyze Context (Original Feature)
Build comprehensive code context for a file.

**Usage:**
```typescript
{
  operation: "analyze_context", // or omit operation field
  filePath: "src/tools/intelligence/engine.ts",
  rootPath: "/path/to/project",
  includeRelationships: true,
  includeMetrics: true,
  includeSemantics: true
}
```

## Use Cases

### IDE-like Navigation
- **Ctrl+Click** equivalent: Use `go_to_definition` to jump to symbol definitions
- **Find All References**: Use `find_usages` to see where a symbol is used
- **Code Exploration**: Navigate through unfamiliar codebases efficiently

### Refactoring Safety
- Before renaming a symbol, use `find_usages` to see all affected locations
- Verify impact of changes before making them
- Ensure no usages are missed

### Code Review
- Quickly understand how a function is used across the codebase
- Identify potential issues with symbol usage
- Review all call sites of a function

### Documentation
- Generate usage examples from real code
- Find all implementations of an interface
- Document API usage patterns

## Example Workflow

### 1. Find a Symbol Definition
```bash
# User asks: "Where is CodeIntelligenceEngine defined?"
{
  "operation": "go_to_definition",
  "symbolName": "CodeIntelligenceEngine"
}

# Response shows: src/tools/intelligence/engine.ts:80
```

### 2. Find All Usages
```bash
# User asks: "Show me everywhere CodeIntelligenceEngine is used"
{
  "operation": "find_usages",
  "symbolName": "CodeIntelligenceEngine"
}

# Response shows all imports, instantiations, and references
```

### 3. Analyze Impact
```bash
# User asks: "If I change this function, what will be affected?"
{
  "operation": "find_usages",
  "symbolName": "indexFile",
  "includeDefinition": false
}

# Response shows all call sites
```

## Integration with Other Tools

### With RefactoringAssistantTool
```typescript
// 1. Find all usages before renaming
const usages = await codeContext.findUsages("oldName");

// 2. Perform rename with confidence
await refactoringAssistant.execute({
  operation: "rename",
  symbolName: "oldName",
  newName: "newName"
});
```

### With SymbolSearchTool
```typescript
// 1. Search for symbols
const searchResults = await symbolSearch.execute({
  query: "parse"
});

// 2. Go to definition of interesting result
const definition = await codeContext.goToDefinition("parseFile");
```

## Performance Notes

- **Indexing**: First call may be slower as the engine indexes files
- **Caching**: Subsequent calls are fast due to in-memory index
- **Large Codebases**: Performance scales well with codebase size
- **Incremental Updates**: Only changed files are re-indexed

## Limitations

- Requires files to be indexed by CodeIntelligenceEngine
- Cross-file references work best with TypeScript/JavaScript
- Dynamic symbol resolution may not be captured
- Requires relative imports for dependency tracking

## Future Enhancements

- [ ] Type hierarchy navigation (find implementations)
- [ ] Call hierarchy (caller/callee chains)
- [ ] Symbol rename preview
- [ ] Cross-language support improvements
- [ ] Workspace-wide symbol search

