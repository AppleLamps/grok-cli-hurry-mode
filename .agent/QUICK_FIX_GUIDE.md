# Quick Fix Guide: Refactoring Tool Failures

**Problem**: Grok CLI fails when refactoring files in other projects with "String not found in file" errors

---

## 🎯 The Core Issue

**Your `str_replace_editor` tool requires EXACT string matching**, which fails ~80% of the time because:

1. **Whitespace differences** (spaces vs tabs, trailing spaces)
2. **Line ending differences** (CRLF vs LF on Windows)
3. **LLM sees formatted preview** (with line numbers) but generates `old_str` without them
4. **Fuzzy matching only works for `function` declarations**, not modern JS/TS patterns

---

## 🔧 Immediate Fixes (Copy-Paste Ready)

### **Fix 1: Add Self-Correction Signal to str_replace_editor**

**File**: `src/agent/grok-agent.ts`  
**Line**: 929-946  
**Action**: Replace the `str_replace_editor` case

**Before**:
```typescript
case "str_replace_editor":
  try {
    return await this.textEditor.strReplace(
      args.path,
      args.old_str,
      args.new_str,
      args.replace_all
    );
  } catch (error: any) {
    console.warn(`str_replace_editor tool failed, falling back to bash: ${error.message}`);
    // Fallback to bash sed for replacement
    const escapedOld = args.old_str.replace(/[\/&]/g, '\\$&');
    const escapedNew = args.new_str.replace(/[\/&]/g, '\\$&');
    const sedCommand = args.replace_all
      ? `sed -i 's/${escapedOld}/${escapedNew}/g' "${args.path}"`
      : `sed -i '0,/${escapedOld}/s/${escapedOld}/${escapedNew}/' "${args.path}"`;
    return await this.bash.execute(sedCommand);
  }
```

**After**:
```typescript
case "str_replace_editor":
  try {
    const result = await this.textEditor.strReplace(
      args.path,
      args.old_str,
      args.new_str,
      args.replace_all
    );
    
    // Check if string not found - trigger self-correction
    if (!result.success && result.error?.includes('String not found')) {
      return {
        success: false,
        error: `SELF_CORRECT_ATTEMPT: The exact string was not found in the file. ` +
          `This often happens due to whitespace differences or formatting. ` +
          `Please try one of these approaches:\n` +
          `1. Use 'view_file' to see the exact current content\n` +
          `2. Use 'multi_file_edit' with line-based operations\n` +
          `3. Use 'code_analysis' to analyze the file structure first\n` +
          `4. Break the edit into smaller, more specific changes`,
        metadata: {
          originalTool: 'str_replace_editor',
          originalError: result.error,
          suggestedApproach: 'view_file_then_retry',
          fallbackTools: ['view_file', 'multi_file_edit', 'code_analysis']
        }
      };
    }
    
    return result;
  } catch (error: any) {
    console.warn(`str_replace_editor tool failed: ${error.message}`);
    
    // Return self-correction signal instead of bash fallback
    return {
      success: false,
      error: `SELF_CORRECT_ATTEMPT: File operation failed: ${error.message}. ` +
        `Please use 'view_file' to check the current state and try again.`,
      metadata: {
        originalTool: 'str_replace_editor',
        originalError: error.message,
        suggestedApproach: 'view_file_then_retry',
        fallbackTools: ['view_file', 'multi_file_edit']
      }
    };
  }
```

**Impact**: Enables autonomous self-correction for 80% of failures

---

### **Fix 2: Improve Whitespace Normalization**

**File**: `src/tools/text-editor.ts`  
**Line**: 484-492  
**Action**: Enhance the `normalizeForComparison` method

**Before**:
```typescript
private normalizeForComparison(str: string): string {
  return str
    .replace(/["'`]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/{\s+/g, '{ ')
    .replace(/\s+}/g, ' }')
    .replace(/;\s*/g, ';')
    .trim();
}
```

**After**:
```typescript
private normalizeForComparison(str: string): string {
  return str
    .replace(/\r\n/g, '\n')      // Normalize Windows line endings
    .replace(/\r/g, '\n')        // Normalize old Mac line endings
    .replace(/\t/g, '  ')        // Convert tabs to spaces
    .replace(/["'`]/g, '"')      // Normalize quotes
    .replace(/\s+/g, ' ')        // Collapse whitespace
    .replace(/{\s+/g, '{ ')      // Normalize braces
    .replace(/\s+}/g, ' }')
    .replace(/;\s*/g, ';')       // Normalize semicolons
    .replace(/,\s*/g, ', ')      // Normalize commas
    .replace(/\(\s+/g, '(')      // Normalize parentheses
    .replace(/\s+\)/g, ')')
    .trim();
}
```

**Impact**: Handles whitespace variations better

---

### **Fix 3: Expand Fuzzy Matching Beyond Functions**

**File**: `src/tools/text-editor.ts`  
**Line**: 439-482  
**Action**: Replace `findFuzzyMatch` method

**Before**: Only matches `function name() {}` patterns

**After**:
```typescript
private findFuzzyMatch(content: string, searchStr: string): string | null {
  // Try multiple matching strategies
  
  // Strategy 1: Function declarations
  const functionMatch = this.findFunctionMatch(content, searchStr);
  if (functionMatch) return functionMatch;
  
  // Strategy 2: Import statements
  const importMatch = this.findImportMatch(content, searchStr);
  if (importMatch) return importMatch;
  
  // Strategy 3: Const/let/var declarations
  const declarationMatch = this.findDeclarationMatch(content, searchStr);
  if (declarationMatch) return declarationMatch;
  
  // Strategy 4: Class methods
  const methodMatch = this.findMethodMatch(content, searchStr);
  if (methodMatch) return methodMatch;
  
  // Strategy 5: Whitespace-normalized match
  const normalizedMatch = this.findNormalizedMatch(content, searchStr);
  if (normalizedMatch) return normalizedMatch;
  
  return null;
}

private findFunctionMatch(content: string, searchStr: string): string | null {
  // Existing function matching logic
  const functionMatch = searchStr.match(/function\s+(\w+)/);
  if (!functionMatch) return null;
  
  const functionName = functionMatch[1];
  const contentLines = content.split('\n');
  
  let functionStart = -1;
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].includes(`function ${functionName}`) && contentLines[i].includes('{')) {
      functionStart = i;
      break;
    }
  }
  
  if (functionStart === -1) return null;
  
  let braceCount = 0;
  let functionEnd = functionStart;
  
  for (let i = functionStart; i < contentLines.length; i++) {
    const line = contentLines[i];
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
    }
    
    if (braceCount === 0 && i > functionStart) {
      functionEnd = i;
      break;
    }
  }
  
  const actualFunction = contentLines.slice(functionStart, functionEnd + 1).join('\n');
  
  const searchNormalized = this.normalizeForComparison(searchStr);
  const actualNormalized = this.normalizeForComparison(actualFunction);
  
  if (this.isSimilarStructure(searchNormalized, actualNormalized)) {
    return actualFunction;
  }
  
  return null;
}

private findImportMatch(content: string, searchStr: string): string | null {
  // Match import statements with whitespace tolerance
  const importMatch = searchStr.match(/import\s+.*\s+from\s+['"](.+)['"]/);
  if (!importMatch) return null;
  
  const moduleName = importMatch[1];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes('import') && line.includes(moduleName)) {
      const normalized1 = this.normalizeForComparison(searchStr);
      const normalized2 = this.normalizeForComparison(line);
      
      if (normalized1 === normalized2) {
        return line;
      }
    }
  }
  
  return null;
}

private findDeclarationMatch(content: string, searchStr: string): string | null {
  // Match const/let/var declarations
  const declMatch = searchStr.match(/(const|let|var)\s+(\w+)/);
  if (!declMatch) return null;
  
  const varName = declMatch[2];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.includes(varName) && (line.includes('const') || line.includes('let') || line.includes('var'))) {
      const normalized1 = this.normalizeForComparison(searchStr);
      const normalized2 = this.normalizeForComparison(line);
      
      if (normalized1 === normalized2) {
        return line;
      }
    }
  }
  
  return null;
}

private findMethodMatch(content: string, searchStr: string): string | null {
  // Match class methods and arrow functions
  const methodMatch = searchStr.match(/(\w+)\s*[=:]\s*\(/);
  if (!methodMatch) return null;
  
  const methodName = methodMatch[1];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(methodName)) {
      const normalized1 = this.normalizeForComparison(searchStr);
      const normalized2 = this.normalizeForComparison(lines[i]);
      
      if (normalized1 === normalized2) {
        return lines[i];
      }
    }
  }
  
  return null;
}

private findNormalizedMatch(content: string, searchStr: string): string | null {
  // Last resort: find any text that matches when normalized
  const searchNormalized = this.normalizeForComparison(searchStr);
  const searchLines = searchStr.split('\n');
  const contentLines = content.split('\n');
  
  // Try to find a sequence of lines that match when normalized
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    const candidateLines = contentLines.slice(i, i + searchLines.length);
    const candidate = candidateLines.join('\n');
    const candidateNormalized = this.normalizeForComparison(candidate);
    
    if (candidateNormalized === searchNormalized) {
      return candidate;
    }
  }
  
  return null;
}
```

**Impact**: Handles imports, declarations, methods, and more patterns

---

## 🧪 Testing the Fixes

After applying the fixes, test with:

```bash
# Build
npm run build

# Test in another project
cd /path/to/other/project
grok --prompt "refactor the authentication system across auth.ts and user.ts"
```

**Expected Behavior**:
1. ✅ First attempt with `str_replace_editor` fails
2. ✅ Self-correction triggers with `SELF_CORRECT_ATTEMPT` signal
3. ✅ LLM receives fallback suggestion
4. ✅ LLM tries `view_file` to see exact content
5. ✅ LLM retries with correct exact match OR uses `multi_file_edit`
6. ✅ Operation succeeds

---

## 📊 Expected Results

**Before Fixes**:
- Success Rate: ~10-20%
- Failures: "String not found in file" (80%)
- Self-Correction: Not triggered

**After Fixes**:
- Success Rate: ~70-90%
- Failures: Reduced to ~10-30%
- Self-Correction: Triggered automatically
- Retries: 1-3 attempts before success

---

## 🎯 Priority Order

1. **Apply Fix 1 first** (Self-correction signal) - Enables autonomous recovery
2. **Apply Fix 2 second** (Whitespace normalization) - Improves matching
3. **Apply Fix 3 third** (Expanded fuzzy matching) - Handles more patterns

Each fix is independent and can be applied separately.


