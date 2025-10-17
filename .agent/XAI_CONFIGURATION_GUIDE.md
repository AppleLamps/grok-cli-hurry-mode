# xAI Configuration Quick Reference

## 🎯 Quick Start

The Grok CLI now supports advanced xAI API configuration for optimal performance and control.

---

## 📝 Configuration Options

### User-Level Settings (`~/.grok/user-settings.json`)

Global settings that apply to all projects:

```json
{
  "apiKey": "your_xai_api_key",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-code-fast-1",
  "models": [
    "grok-code-fast-1",
    "grok-4-latest",
    "grok-3-latest",
    "grok-3-fast",
    "grok-3-mini-fast"
  ],
  "timeout": 360000,
  "streamTimeout": 3600000,
  "temperature": 0.7,
  "maxTokens": 1536,
  "parallelToolCalls": true,
  "maxConcurrentTools": 3
}
```

### Project-Level Settings (`.grok/settings.json`)

Project-specific overrides:

```json
{
  "model": "grok-4-latest",
  "streamTimeout": 7200000,
  "temperature": 0.5,
  "maxTokens": 2048,
  "parallelToolCalls": true,
  "maxConcurrentTools": 5
}
```

---

## ⚙️ Setting Descriptions

### `timeout` (milliseconds)
- **Default**: 360000 (6 minutes)
- **Purpose**: Timeout for standard API requests
- **Recommended**: 360000 for most use cases

### `streamTimeout` (milliseconds)
- **Default**: 3600000 (1 hour)
- **Purpose**: Timeout for streaming requests (reasoning models)
- **Recommended**: 3600000 for complex tasks, 7200000 for very complex

### `temperature` (0.0 - 2.0)
- **Default**: 0.7
- **Purpose**: Controls randomness/creativity
- **Recommended**:
  - `0.2-0.3` for code generation (deterministic)
  - `0.7` for general use (balanced)
  - `1.0-1.5` for creative tasks

### `maxTokens` (integer)
- **Default**: 1536
- **Purpose**: Maximum tokens per response
- **Recommended**:
  - `1536` for quick responses
  - `2048-4096` for detailed explanations
  - `8192+` for comprehensive analysis

### `parallelToolCalls` (boolean)
- **Default**: true
- **Purpose**: Enable parallel tool execution
- **Recommended**:
  - `true` for production (faster)
  - `false` for debugging (sequential)

### `maxConcurrentTools` (integer)
- **Default**: 3
- **Purpose**: Number of tools to execute simultaneously
- **Recommended**:
  - `3` for balanced performance
  - `5-10` for high-performance systems
  - `1` for debugging or low-resource systems

---

## 🌍 Environment Variables

Override any setting with environment variables:

```bash
# API Configuration
export GROK_API_KEY="your_api_key"
export GROK_BASE_URL="https://api.x.ai/v1"

# Timeout Configuration
export GROK_TIMEOUT=360000
export GROK_STREAM_TIMEOUT=3600000

# Model Parameters
export GROK_TEMPERATURE=0.7
export GROK_MAX_TOKENS=2048
```

---

## 📊 Priority Order

Settings are applied in this order (highest to lowest):

1. **Environment Variables** ← Highest priority
2. **Project Settings** (`.grok/settings.json`)
3. **User Settings** (`~/.grok/user-settings.json`)
4. **Default Values** ← Lowest priority

---

## 🎨 Use Case Examples

### Example 1: Code Generation Project

**Goal**: Deterministic, high-quality code generation

```json
// .grok/settings.json
{
  "model": "grok-code-fast-1",
  "temperature": 0.2,
  "maxTokens": 4096,
  "parallelToolCalls": true,
  "maxConcurrentTools": 5
}
```

### Example 2: Complex Refactoring

**Goal**: Handle large-scale refactoring without timeouts

```json
// .grok/settings.json
{
  "model": "grok-4-latest",
  "streamTimeout": 7200000,
  "temperature": 0.3,
  "maxTokens": 8192,
  "parallelToolCalls": true,
  "maxConcurrentTools": 10
}
```

### Example 3: Creative Writing

**Goal**: More creative, varied responses

```json
// .grok/settings.json
{
  "model": "grok-3-latest",
  "temperature": 1.2,
  "maxTokens": 2048,
  "parallelToolCalls": false
}
```

### Example 4: Debugging Mode

**Goal**: Sequential execution for easier debugging

```json
// .grok/settings.json
{
  "parallelToolCalls": false,
  "maxConcurrentTools": 1,
  "temperature": 0.5
}
```

### Example 5: CI/CD Pipeline

**Goal**: Fast, deterministic, with environment overrides

```bash
# .github/workflows/grok-review.yml
env:
  GROK_API_KEY: ${{ secrets.GROK_API_KEY }}
  GROK_TEMPERATURE: 0.1
  GROK_MAX_TOKENS: 2048
  GROK_TIMEOUT: 600000
```

---

## 🚀 Performance Tuning

### For Speed:
```json
{
  "model": "grok-code-fast-1",
  "parallelToolCalls": true,
  "maxConcurrentTools": 10,
  "maxTokens": 1536
}
```

### For Quality:
```json
{
  "model": "grok-4-latest",
  "temperature": 0.3,
  "maxTokens": 4096,
  "streamTimeout": 7200000
}
```

### For Cost Efficiency:
```json
{
  "model": "grok-3-mini-fast",
  "maxTokens": 1024,
  "parallelToolCalls": true,
  "maxConcurrentTools": 3
}
```

---

## 🔧 Troubleshooting

### Issue: Timeout Errors on Complex Tasks

**Solution**: Increase `streamTimeout`
```json
{
  "streamTimeout": 7200000  // 2 hours
}
```

### Issue: Inconsistent Code Generation

**Solution**: Lower `temperature`
```json
{
  "temperature": 0.2
}
```

### Issue: Responses Too Short

**Solution**: Increase `maxTokens`
```json
{
  "maxTokens": 4096
}
```

### Issue: Slow Multi-Tool Operations

**Solution**: Increase `maxConcurrentTools`
```json
{
  "parallelToolCalls": true,
  "maxConcurrentTools": 10
}
```

### Issue: Tools Failing in Parallel

**Solution**: Disable parallel execution for debugging
```json
{
  "parallelToolCalls": false
}
```

---

## 📖 Additional Resources

- **xAI API Documentation**: https://docs.x.ai/docs/guides
- **Grok CLI Documentation**: See `README.md`
- **Implementation Details**: See `.agent/XAI_API_IMPROVEMENTS.md`

---

## ✅ Quick Checklist

Before starting a new project:

- [ ] Set appropriate `model` for your use case
- [ ] Configure `temperature` (0.2 for code, 0.7 for general)
- [ ] Set `maxTokens` based on expected response length
- [ ] Enable `parallelToolCalls` for performance
- [ ] Adjust `maxConcurrentTools` based on system resources
- [ ] Set `streamTimeout` for complex reasoning tasks

---

*Last Updated: 2025-10-17*

