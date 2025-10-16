# Smart extract_function Demo

This document demonstrates the enhanced `extract_function` operation with intelligent parameter and return type detection.

---

## Overview

The `extract_function` refactoring now automatically:
- **Detects parameters** by analyzing variable usage
- **Infers parameter types** from usage patterns
- **Infers return types** from return statements
- **Calculates confidence** in the analysis
- **Detects external references** that may cause issues

---

## Example 1: Simple Array Processing

### Original Code
```typescript
// File: src/utils/data-processor.ts
function processData(items: Item[]) {
  // Lines 10-12: Extract this
  const result = items.map(item => item.value);
  const total = result.reduce((sum, val) => sum + val, 0);
  return total;
}
```

### Refactoring Request
```json
{
  "operation": "extract_function",
  "filePath": "src/utils/data-processor.ts",
  "startLine": 10,
  "endLine": 12,
  "functionName": "calculateTotal"
}
```

### Auto-Detected Analysis
```
Confidence: 90%
Auto-detected parameters: items: any[]
Inferred return type: number
External references: none
```

### Result
```typescript
function calculateTotal(items: any[]): number {
  const result = items.map(item => item.value);
  const total = result.reduce((sum, val) => sum + val, 0);
  return total;
}

function processData(items: Item[]) {
  const total = calculateTotal(items);
}
```

---

## Example 2: String Manipulation

### Original Code
```typescript
function formatUserData(user: User) {
  // Lines 5-7: Extract this
  const fullName = user.firstName + ' ' + user.lastName;
  const displayName = fullName.toUpperCase();
  return displayName;
}
```

### Refactoring Request
```json
{
  "operation": "extract_function",
  "filePath": "src/utils/user-formatter.ts",
  "startLine": 5,
  "endLine": 7,
  "functionName": "formatFullName"
}
```

### Auto-Detected Analysis
```
Confidence: 85%
Auto-detected parameters: user: any
Inferred return type: string
External references: none
```

### Result
```typescript
function formatFullName(user: any): string {
  const fullName = user.firstName + ' ' + user.lastName;
  const displayName = fullName.toUpperCase();
  return displayName;
}

function formatUserData(user: User) {
  return formatFullName(user);
}
```

---

## Example 3: External References Warning

### Original Code
```typescript
const STATUS_ACTIVE = 'active';
const logger = new Logger();

function filterItems(data: Item[]) {
  // Lines 10-12: Extract this
  const filtered = data.filter(item => item.status === STATUS_ACTIVE);
  logger.info(`Filtered ${filtered.length} items`);
  return filtered;
}
```

### Refactoring Request
```json
{
  "operation": "extract_function",
  "filePath": "src/utils/filter.ts",
  "startLine": 10,
  "endLine": 12,
  "functionName": "filterActiveItems"
}
```

### Auto-Detected Analysis
```
Confidence: 70%
Auto-detected parameters: data: any[]
Inferred return type: any[]
External references: STATUS_ACTIVE, logger
⚠️  Warning: Function references external symbols that may need to be passed as parameters
```

### Result
```typescript
function filterActiveItems(data: any[]): any[] {
  const filtered = data.filter(item => item.status === STATUS_ACTIVE);
  logger.info(`Filtered ${filtered.length} items`);
  return filtered;
}

function filterItems(data: Item[]) {
  const filtered = filterActiveItems(data);
}
```

**Note**: The extracted function still references `STATUS_ACTIVE` and `logger`. You may want to pass these as parameters.

---

## Example 4: Numeric Calculations

### Original Code
```typescript
function calculatePrice(basePrice: number, quantity: number) {
  // Lines 5-8: Extract this
  const subtotal = basePrice * quantity;
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return total;
}
```

### Refactoring Request
```json
{
  "operation": "extract_function",
  "filePath": "src/utils/pricing.ts",
  "startLine": 5,
  "endLine": 8,
  "functionName": "calculateTotalWithTax"
}
```

### Auto-Detected Analysis
```
Confidence: 95%
Auto-detected parameters: basePrice: number, quantity: number
Inferred return type: number
External references: none
```

### Result
```typescript
function calculateTotalWithTax(basePrice: number, quantity: number): number {
  const subtotal = basePrice * quantity;
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  return total;
}

function calculatePrice(basePrice: number, quantity: number) {
  return calculateTotalWithTax(basePrice, quantity);
}
```

---

## Example 5: Boolean Logic

### Original Code
```typescript
function validateUser(user: User) {
  // Lines 5-7: Extract this
  const hasEmail = user.email && user.email.length > 0;
  const hasName = user.name && user.name.length > 0;
  return hasEmail && hasName;
}
```

### Refactoring Request
```json
{
  "operation": "extract_function",
  "filePath": "src/utils/validation.ts",
  "startLine": 5,
  "endLine": 7,
  "functionName": "isUserValid"
}
```

### Auto-Detected Analysis
```
Confidence: 85%
Auto-detected parameters: user: any
Inferred return type: boolean
External references: none
```

### Result
```typescript
function isUserValid(user: any): boolean {
  const hasEmail = user.email && user.email.length > 0;
  const hasName = user.name && user.name.length > 0;
  return hasEmail && hasName;
}

function validateUser(user: User) {
  return isUserValid(user);
}
```

---

## Example 6: Complex Object Manipulation

### Original Code
```typescript
function transformData(items: Item[]) {
  // Lines 5-10: Extract this
  const mapped = items.map(item => ({
    id: item.id,
    name: item.name,
    value: item.value * 2
  }));
  return mapped;
}
```

### Refactoring Request
```json
{
  "operation": "extract_function",
  "filePath": "src/utils/transform.ts",
  "startLine": 5,
  "endLine": 10,
  "functionName": "doubleItemValues"
}
```

### Auto-Detected Analysis
```
Confidence: 80%
Auto-detected parameters: items: any[]
Inferred return type: object
External references: none
```

### Result
```typescript
function doubleItemValues(items: any[]): object {
  const mapped = items.map(item => ({
    id: item.id,
    name: item.name,
    value: item.value * 2
  }));
  return mapped;
}

function transformData(items: Item[]) {
  return doubleItemValues(items);
}
```

---

## Confidence Levels Explained

| Confidence | Meaning | Typical Scenario |
|------------|---------|------------------|
| **90-100%** | Very High | Simple, well-defined code with clear types |
| **75-89%** | High | Code with some type inference, few external refs |
| **60-74%** | Medium | Code with external references or complex logic |
| **40-59%** | Low | Complex code with many unknowns |
| **0-39%** | Very Low | Fallback analysis, manual review recommended |

---

## Type Inference Patterns

### Arrays
```typescript
items.map(...)      → any[]
items.filter(...)   → any[]
items.forEach(...)  → any[]
```

### Strings
```typescript
name.toUpperCase()  → string
name.toLowerCase()  → string
name + " suffix"    → string
```

### Numbers
```typescript
value * 2           → number
value + 10          → number
value.toFixed(2)    → number
```

### Booleans
```typescript
flag && condition   → boolean
!value              → boolean
value || false      → boolean
```

---

## Best Practices

### 1. Review Auto-Detected Parameters
Always review the auto-detected parameters, especially for complex code.

### 2. Check External References
If the tool warns about external references, consider:
- Passing them as parameters
- Moving them into the extracted function
- Keeping the extraction as-is if they're truly global

### 3. Verify Type Inference
The tool does its best, but manual type refinement may be needed for:
- Complex object types
- Generic types
- Union types

### 4. Use Confidence as a Guide
- **High confidence (>80%)**: Likely safe to use as-is
- **Medium confidence (60-80%)**: Review carefully
- **Low confidence (<60%)**: Manual review required

---

## Limitations

1. **Type Inference Accuracy**: Limited to common patterns
2. **External References**: Detected but not automatically resolved
3. **Nested Functions**: May not handle closures perfectly
4. **Dynamic Code**: Runtime behavior not analyzed

---

## Future Enhancements

- [ ] More sophisticated type inference
- [ ] Automatic external reference resolution
- [ ] Support for generic types
- [ ] Better handling of closures
- [ ] Integration with TypeScript type checker

---

## See Also

- [Refactoring Assistant API](../docs/refactoring-api.md)
- [Code Intelligence Engine](../docs/intelligence-engine-api.md)
- [Phase 2 Implementation](../.agent/tasks/PHASE2_COMPLETE.md)

