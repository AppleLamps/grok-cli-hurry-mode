# Crypto Module Fix

## Issue
The CLI was failing to start with error:
```
Error: Dynamic require of "crypto" is not supported
```

## Root Cause
The `tsup` bundler was encountering dynamic `require('crypto')` calls which aren't supported in ESM builds. This happened in two places:

1. `src/agent/grok-agent.ts` - `hashRequest()` method used `const crypto = require('crypto')`
2. `src/utils/operation-tracker.ts` - Used `import * as crypto from 'crypto'`

## Solution

### 1. Fixed imports to use `node:` protocol
Changed all crypto imports to use the explicit `node:crypto` protocol:

**Before**:
```typescript
const crypto = require('crypto');
import * as crypto from 'crypto';
```

**After**:
```typescript
import { createHash } from 'node:crypto';
```

### 2. Updated tsup.config.ts
Added all Node.js built-in modules to the `external` array to prevent bundling:

```typescript
external: [
  'react',
  'ink',
  'tree-sitter',
  'tree-sitter-javascript',
  'tree-sitter-python',
  'tree-sitter-typescript',
  // Node.js built-in modules
  'node:*',
  'fs',
  'fs/promises',
  'path',
  'url',
  'crypto',
  'os',
  'child_process',
  'util',
  'stream',
  'events'
],
```

### 3. Updated all crypto usage
Replaced all `crypto.createHash()` calls with direct `createHash()` imports:

**src/agent/grok-agent.ts**:
```typescript
private hashRequest(request: string): string {
  return createHash('md5').update(request).digest('hex');
}
```

**src/utils/operation-tracker.ts**:
```typescript
private computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}
```

## Files Modified
1. `tsup.config.ts` - Added Node.js built-ins to external list
2. `src/agent/grok-agent.ts` - Fixed crypto import and usage
3. `src/utils/operation-tracker.ts` - Fixed crypto import and usage

## Result
✅ Build successful
✅ No dynamic require errors
✅ CLI starts correctly

## Build Output
```
ESM dist\index.js     662.85 KB
ESM ⚡️ Build success in 987ms
DTS ⚡️ Build success in 4169ms
```

## Best Practice
Always use `node:` protocol for Node.js built-in modules in ESM projects:
- ✅ `import { createHash } from 'node:crypto'`
- ❌ `const crypto = require('crypto')`
- ❌ `import * as crypto from 'crypto'`

This ensures proper tree-shaking and prevents bundling issues.

