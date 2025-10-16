# Move Operations Demo

This guide demonstrates how to use the `move_function` and `move_class` operations in the RefactoringAssistantTool.

---

## Overview

The move operations allow you to:
- **Move functions** from one file to another
- **Move classes** from one file to another
- **Automatically update** all import statements in dependent files
- **Detect risks** like circular dependencies
- **Preview impact** before applying changes

---

## move_function

### Basic Usage

Move a function from one file to another:

```json
{
  "tool": "refactoring_assistant",
  "operation": "move_function",
  "symbolName": "calculateTotal",
  "sourceFile": "src/utils/math.ts",
  "targetFile": "src/utils/calculations.ts"
}
```

### Example Scenario

**Before:**

`src/utils/math.ts`:
```typescript
/**
 * Calculate the total price including tax
 */
export function calculateTotal(price: number, taxRate: number): number {
  return price * (1 + taxRate);
}

export function add(a: number, b: number): number {
  return a + b;
}
```

`src/components/cart.ts`:
```typescript
import { calculateTotal } from '../utils/math';

const total = calculateTotal(100, 0.08);
```

**After move_function:**

`src/utils/math.ts`:
```typescript
export function add(a: number, b: number): number {
  return a + b;
}
```

`src/utils/calculations.ts`:
```typescript
/**
 * Calculate the total price including tax
 */
export function calculateTotal(price: number, taxRate: number): number {
  return price * (1 + taxRate);
}
```

`src/components/cart.ts`:
```typescript
import { calculateTotal } from '../utils/calculations';

const total = calculateTotal(100, 0.08);
```

### Result Preview

```
--- Move Function ---
Symbol: calculateTotal
From: math.ts
To: calculations.ts

--- Impact ---
Files affected: 3
Import updates: 1 files

⚠️  This operation will update import statements in 1 dependent files.
```

---

## move_class

### Basic Usage

Move a class from one file to another:

```json
{
  "tool": "refactoring_assistant",
  "operation": "move_class",
  "symbolName": "UserService",
  "sourceFile": "src/services/user.ts",
  "targetFile": "src/services/auth/user-service.ts"
}
```

### Example Scenario

**Before:**

`src/services/user.ts`:
```typescript
/**
 * Service for managing user operations
 */
export class UserService {
  constructor(private db: Database) {}

  async getUser(id: string): Promise<User> {
    return this.db.users.findById(id);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.db.users.update(id, data);
  }
}

export class AuthService {
  // ...
}
```

`src/controllers/user-controller.ts`:
```typescript
import { UserService } from '../services/user';

export class UserController {
  constructor(private userService: UserService) {}
  
  async handleGetUser(req: Request, res: Response) {
    const user = await this.userService.getUser(req.params.id);
    res.json(user);
  }
}
```

**After move_class:**

`src/services/user.ts`:
```typescript
export class AuthService {
  // ...
}
```

`src/services/auth/user-service.ts`:
```typescript
/**
 * Service for managing user operations
 */
export class UserService {
  constructor(private db: Database) {}

  async getUser(id: string): Promise<User> {
    return this.db.users.findById(id);
  }

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return this.db.users.update(id, data);
  }
}
```

`src/controllers/user-controller.ts`:
```typescript
import { UserService } from '../services/auth/user-service';

export class UserController {
  constructor(private userService: UserService) {}
  
  async handleGetUser(req: Request, res: Response) {
    const user = await this.userService.getUser(req.params.id);
    res.json(user);
  }
}
```

### Result Preview

```
--- Move Class ---
Symbol: UserService
From: user.ts
To: user-service.ts

--- Impact ---
Files affected: 8
Import updates: 6 files

⚠️  This operation will update import statements in 6 dependent files.
⚠️  Moving a class may affect inheritance hierarchies
```

---

## Advanced Features

### Create Target File

If the target file doesn't exist, you can create it automatically:

```json
{
  "tool": "refactoring_assistant",
  "operation": "move_function",
  "symbolName": "validateEmail",
  "sourceFile": "src/utils/validators.ts",
  "targetFile": "src/utils/email/validators.ts",
  "createTargetFile": true
}
```

This will:
1. Create `src/utils/email/validators.ts` if it doesn't exist
2. Move the function to the new file
3. Update all imports

---

## Safety Analysis

### Risk Levels

The tool automatically assesses risk based on impact:

#### Low Risk
- 0 affected files
- Moving simple functions

```
Safety Analysis:
  Risk Level: low
  Affected Files: 2
  Breaking Changes: false
```

#### Medium Risk
- 1-10 affected files
- Moving classes

```
Safety Analysis:
  Risk Level: medium
  Affected Files: 5
  Breaking Changes: true
  Potential Issues:
    - Moving a class may affect inheritance hierarchies
```

#### High Risk
- More than 10 affected files
- Potential circular dependencies

```
Safety Analysis:
  Risk Level: high
  Affected Files: 15
  Breaking Changes: true
  Potential Issues:
    - Affects 15 files
    - ⚠️  Warning: May create circular dependency
```

---

## Common Use Cases

### 1. Reorganizing Code

Move related functions to a dedicated module:

```json
{
  "operation": "move_function",
  "symbolName": "formatCurrency",
  "sourceFile": "src/utils/helpers.ts",
  "targetFile": "src/utils/formatting/currency.ts",
  "createTargetFile": true
}
```

### 2. Splitting Large Files

Move classes to separate files for better organization:

```json
{
  "operation": "move_class",
  "symbolName": "EmailValidator",
  "sourceFile": "src/validators/index.ts",
  "targetFile": "src/validators/email-validator.ts",
  "createTargetFile": true
}
```

### 3. Creating Feature Modules

Move feature-specific code to dedicated directories:

```json
{
  "operation": "move_class",
  "symbolName": "PaymentService",
  "sourceFile": "src/services/index.ts",
  "targetFile": "src/features/payment/payment-service.ts",
  "createTargetFile": true
}
```

---

## Error Handling

### Symbol Not Found

```json
{
  "success": false,
  "error": "Symbol 'NonExistentFunction' not found in src/utils/math.ts"
}
```

### Source File Not Found

```json
{
  "success": false,
  "error": "Source file not found: src/utils/missing.ts"
}
```

### Target File Not Found (without createTargetFile)

```json
{
  "success": false,
  "error": "Target file not found: src/utils/new.ts. Set createTargetFile=true to create it."
}
```

---

## Best Practices

### 1. Preview Before Applying

Always review the preview to understand the impact:
- Check the number of affected files
- Review the risk level
- Look for circular dependency warnings

### 2. Move Related Code Together

When moving a function, consider moving related functions too:
- Helper functions used only by the moved function
- Type definitions specific to the function
- Constants used by the function

### 3. Update Tests

After moving code, update the corresponding tests:
- Update import paths in test files
- Move test files to match new structure
- Run tests to ensure nothing broke

### 4. Check for Circular Dependencies

If you see a circular dependency warning:
- Review the dependency graph
- Consider restructuring to avoid the cycle
- Move shared code to a common module

### 5. Commit Incrementally

For large moves affecting many files:
- Move one symbol at a time
- Commit after each successful move
- Run tests between moves

---

## Limitations

### Current Limitations

1. **Re-exports**: Not automatically updated
   ```typescript
   export { foo } from './bar'; // Not updated
   ```

2. **Dynamic Imports**: Not detected or updated
   ```typescript
   const module = await import('./utils/math');
   ```

3. **Type-only Imports**: May need manual adjustment
   ```typescript
   import type { User } from './types';
   ```

4. **Complex Import Patterns**: May not be detected
   ```typescript
   import * as utils from './utils';
   const result = utils.calculateTotal(100, 0.08);
   ```

### Workarounds

- Manually update re-exports after the move
- Search for dynamic imports and update them
- Review type imports and adjust if needed
- Use explicit named imports instead of namespace imports

---

## See Also

- [Code Navigation API](../docs/code-navigation-api.md) - goToDefinition, findUsages
- [Smart Extract Function Demo](./smart-extract-function-demo.md) - Auto-detect parameters
- [Phase 3 Complete](./.agent/tasks/PHASE3_COMPLETE.md) - Implementation details

