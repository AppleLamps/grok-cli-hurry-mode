## 1.0.50 – Autonomous Agent Upgrade

This release transforms Grok CLI from a tool-using assistant into a true autonomous agent.
- **🧠 Enhanced Task Planning**: Context-aware planning using CodeIntelligenceEngine with symbol search
- **🔄 Self-Correcting Execution**: Automatic fallback strategies with exponential backoff retry (max 3 attempts)
- **🎯 Intelligent File Discovery**: Finds relevant files using symbol search and pattern matching
- **⚡ Concrete Tool Calls**: Generates specific, executable operations with actual file paths
- **🛡️ Graceful Degradation**: 6 fallback strategies across 4 strategy types for resilient execution
- **📊 Endpoint-Specific Planning**: Special logic for API endpoint creation tasks
- **✅ All Tests Passing**: 19 integration tests ensuring reliability


# Grok CLI

[![NPM Version](https://img.shields.io/npm/v/grok-cli-hurry-mode?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/grok-cli-hurry-mode)
[![GitHub Release](https://img.shields.io/github/v/release/hinetapora/grok-cli-hurry-mode?style=for-the-badge&logo=github&color=181717)](https://github.com/hinetapora/grok-cli-hurry-mode/releases)
[![Downloads](https://img.shields.io/npm/dm/grok-cli-hurry-mode?style=for-the-badge&logo=npm&color=CB3837)](https://www.npmjs.com/package/grok-cli-hurry-mode)
[![License](https://img.shields.io/github/license/hinetapora/grok-cli-hurry-mode?style=for-the-badge&color=green)](https://github.com/hinetapora/grok-cli-hurry-mode/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-xAI_Community-5865F2?style=for-the-badge&logo=discord)](https://discord.com/channels/1315720379607679066/1315822328139223064)

A conversational AI CLI tool powered by Grok with **Claude Code-level intelligence** and advanced tool capabilities.

```
                     @@@@@#                          %@@@@@
                     @@@@@#                          %@@@@@
                     @@@@@#                          %@@@@@
                           @@@@@                @@@@@
                           @@@@@                @@@@@
                           @@@@@                @@@@@
                     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
                     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
                     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
                     @@@@@@     @@@@@@@@@@@@@@@@     @@@@@@
               @@@@@@@@@@@#      @@@@@@@@@@@@@@      #@@@@@@@@@@@
               @@@@@@@@@@@#      @@@@@@@@@@@@@@      #@@@@@@@@@@@
               @@@@@@@@@@@@      @@@@@@@@@@@@@@      @@@@@@@@@@@@
          @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
          @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
          @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
          @@@@@      @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@      @@@@@
          @@@@@      @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@      @@@@@
          @@@@@      @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@      @@@@@
          @@@@@      @@@@@@                          @@@@@@      @@@@@+
          @@@@@      @@@@@@                          @@@@@@      @@@@@+
          @@@@@      @@@@@@                          @@@@@@      @@@@@+
          @@@@@      @@@@@#                          #@@@@@      @@@@@+

                           @@@@@@@@@        @@@@@@@@@
                           @@@@@@@@@        @@@@@@@@@
                           @@@@@@@@          @@@@@@@@
                     @@@@@#                          #@@@@@
                     @@@@@#                          %@@@@@
                     @@@@@#                          %@@@@@
```

## 🔗 Quick Links

- **📦 [NPM Package](https://www.npmjs.com/package/grok-cli-hurry-mode)** - Install globally with `npm install -g grok-cli-hurry-mode`
- **🐙 [GitHub Repository](https://github.com/hinetapora/grok-cli-hurry-mode)** - Source code, issues, and contributions
- **💬 [xAI Community Discord](https://discord.com/channels/1315720379607679066/1315822328139223064)** - Official xAI API community support
- **📚 [Releases](https://github.com/hinetapora/grok-cli-hurry-mode/releases)** - Version history and changelogs

## 🆕 What's New in v1.0+

### 🤖 **Autonomous Agent Upgrade** (Latest - v1.0.50+)

Grok CLI is now a **true autonomous agent** with context-aware planning and self-correcting execution!

#### **Part 1: Enhanced Task Planning Framework**
- **🧠 Context-Aware Planning**: Integrates CodeIntelligenceEngine to analyze your actual codebase structure
- **🔍 Intelligent File Discovery**: Uses symbol search to automatically find relevant routes, controllers, services
- **🎯 Endpoint-Specific Logic**: Special handling for API endpoint creation (e.g., "Add /users/:id endpoint")
- **⚡ Concrete Tool Calls**: Generates specific operations with actual file paths, not generic placeholders
- **📊 Dependency Analysis**: Automatically detects and includes dependent files in plans
- **🔎 Keyword Extraction**: Parses user requests to find relevant symbols and files

#### **Part 2: Self-Correcting Execution Loop**
- **🔄 Automatic Fallback**: 6 fallback strategies for graceful degradation when tools fail
- **⏱️ Exponential Backoff**: Retry failed operations with 1s, 2s, 4s delays (max 3 attempts)
- **🛡️ 4 Strategy Types**:
  - `decompose_and_retry`: Break complex operations into smaller steps
  - `sequential_execution`: Execute batch operations one at a time
  - `simpler_tool`: Use lower-level alternative tools
  - `bash_fallback`: Fall back to shell commands
- **📈 Retry Tracking**: Intelligent tracking prevents infinite retry loops
- **🔍 Comprehensive Logging**: Full transparency into self-correction attempts

#### **Fallback Strategy Examples**
```
refactoring_assistant fails
  ↓ Fallback to multi_file_edit
    ↓ Fallback to sequential str_replace_editor calls
      ↓ Success! ✅

symbol_search fails
  ↓ Fallback to text search
    ↓ Fallback to bash grep
      ↓ Success! ✅
```

#### **Real-World Example**
```bash
# User: "Add a new GET /users/:id endpoint"

# 🧠 Agent analyzes codebase with CodeIntelligenceEngine
# 🔍 Finds: routes/users.ts, controllers/userController.ts, services/userService.ts
# 📝 Generates concrete plan:
#   Step 1: Edit routes/users.ts - Add router.get('/users/:id', userController.getUserById)
#   Step 2: Edit controllers/userController.ts - Add getUserById function
#   Step 3: Edit services/userService.ts - Add findUserById method
#   Step 4: Update imports in all files
# ⚡ Executes plan with automatic rollback on failure
# ✅ Complete! All files updated successfully
```

**Result**: Grok CLI now handles complex, multi-step tasks with the intelligence and resilience of a senior developer!

### 🧠 **P2: Code Intelligence Tools**
- **🔍 AST Parser**: Language-specific syntax tree analysis for TypeScript, JavaScript, Python
- **🔎 Symbol Search**: Fuzzy search across codebases with cross-references and usage analysis
- **📊 Dependency Analyzer**: Circular dependency detection and dependency graph generation
- **🎯 Code Context**: Semantic analysis with quality metrics and design pattern detection
- **🔧 Refactoring Assistant**: Safe rename, extract, inline operations with preview and rollback

### 🚀 **P1: Enhanced File Operations**
- **⚡ Multi-File Editor**: Atomic operations with transaction support and rollback
- **🔍 Advanced Search Tool**: Regex patterns with bulk replace and context-aware results
- **🌳 File Tree Operations**: Visual trees, bulk operations, and intelligent file organization
- **🧠 Code-Aware Editor**: Syntax-aware editing with smart refactoring capabilities
- **📚 Operation History**: Comprehensive undo/redo system with persistent history

**🎯 Result**: **Claude Code-level capabilities** in your terminal!

### 🛠️ **P3: Reliability & Workflow Enhancements**
- **🤖 .agent System**: AI-powered task management and documentation system for efficient workflows
- **🔧 Healer Script**: Automated issue detection and resolution for tool reliability
- **⚡ FsPort Abstraction**: Improved file system operations with Node built-ins externalization
- **📦 Automated Installer**: Enhanced installation UX with one-click setup options
- **🛡️ Tool Reliability Fixes**: Standardized imports, syntax error resolution, and fallback mechanisms

## ✨ Features

### 🤖 **Autonomous Agent Capabilities**
- **🧠 Context-Aware Planning**: Uses CodeIntelligenceEngine to analyze codebase and generate concrete plans
- **🔄 Self-Correcting Execution**: Automatic fallback strategies with retry mechanism for resilient operation
- **🎯 Multi-Step Task Planning**: Automatically decomposes complex tasks into executable steps with dependency ordering
- **⚡ Automatic Execution**: Create, validate, and execute plans with a single command
- **🛡️ Risk Assessment**: Evaluates operation risks (low/medium/high/critical) before execution
- **✅ User Confirmation**: Prompts for approval on high-risk operations with detailed plan previews
- **🔄 Safe Rollback**: Automatic rollback on failure with file snapshots and state restoration
- **📊 Real-Time Progress**: Live progress tracking with step completion, time estimates, and phase updates
- **🧪 Comprehensive Testing**: 19 integration tests covering planning, validation, execution, and rollback

**Example Use Cases**:
- "Refactor authentication module to use dependency injection"
- "Move all utility functions to a shared folder"
- "Extract common validation logic into a separate function"
- "Reorganize project structure following best practices"

### 🧠 **Claude Code-Level Intelligence**
- **🔍 AST Code Analysis**: Parse TypeScript, JavaScript, Python files to extract symbols, imports, and structure
- **🔎 Symbol Search**: Fuzzy search for functions, classes, variables across entire codebases
- **📊 Dependency Analysis**: Detect circular dependencies and generate dependency graphs
- **🎯 Code Context**: Intelligent relationship mapping with semantic analysis and quality metrics
- **🔧 Safe Refactoring**: Rename, extract, inline operations with preview and rollback support

### 🚀 **Advanced File Operations**
- **⚡ Multi-File Editing**: Atomic operations across multiple files with transaction support
- **🔍 Advanced Search**: Regex patterns with bulk replace and context-aware results
- **🌳 File Tree Operations**: Visual directory trees, bulk operations, and file organization
- **📚 Operation History**: Comprehensive undo/redo with persistent history and snapshots
- **🚀 Morph Fast Apply**: Optional high-speed code editing at 4,500+ tokens/sec with 98% accuracy

### 🤖 **Core AI Capabilities**
- **💬 Conversational Interface**: Natural language powered by Grok models
- **🔧 Intelligent Tool Selection**: AI automatically chooses the right tools for your requests
- **⚡ Bash Integration**: Execute shell commands through natural conversation
- **🔌 MCP Extension**: Extend capabilities with Model Context Protocol servers (Linear, GitHub, etc.)
- **💻 Beautiful Terminal UI**: Interactive interface built with Ink and Claude Code-style animations

### 📚 **Documentation System**
- **🏗️ Agent Documentation**: Complete `.agent/` system for AI context optimization
- **📖 Interactive Commands**: `/docs` menu, `/readme` generation, `/api-docs`, `/changelog`
- **🔄 Smart Updates**: `/update-agent-docs` with configurable auto-triggers
- **🤖 Subagent Framework**: Token-optimized processing with specialized agents
- **🛡️ Self-Healing**: `/heal` command captures incidents and generates guardrails
- **📝 Code Comments**: `/comments` command for automatic code documentation

### 🌍 **Installation & Setup**
- **📦 Global Installation**: Install anywhere with `npm install -g grok-cli-hurry-mode`
- **⚙️ Flexible Configuration**: Environment variables, user settings, or project-specific configs
- **🔄 CI/CD Ready**: Headless mode perfect for automation and scripting

## Installation

### Prerequisites
- Node.js 18+ (Node.js 20+ recommended)

### 🚀 Quick Install

**Recommended: Automated installer (handles all edge cases)**
```bash
curl -fsSL https://raw.githubusercontent.com/hinetapora/grok-cli-hurry-mode/main/install.sh | bash
```

**Alternative: Standard npm install**
```bash
npm install -g grok-cli-hurry-mode
```

**Alternative: Package managers**
```bash
# Using Yarn
yarn global add grok-cli-hurry-mode

# Using pnpm  
pnpm add -g grok-cli-hurry-mode

# Using Homebrew (coming soon)
brew install grok-cli-hurry-mode
```

### ⚡ One-liner with API key setup
```bash
curl -fsSL https://raw.githubusercontent.com/hinetapora/grok-cli-hurry-mode/main/install.sh | bash && \
echo 'export GROK_API_KEY=your_api_key_here' >> ~/.bashrc && \
source ~/.bashrc
```
- Grok API key from X.AI
- (Optional, Recommended) Morph API key for Fast Apply editing

### Global Installation (Recommended)
```bash
bun add -g grok-cli-hurry-mode
```

Or with npm (fallback):
```bash
npm install -g grok-cli-hurry-mode
```

### Local Development
```bash
git clone <repository>
cd grok-cli
npm install
npm run build
npm link
```

## Setup

1. Get your Grok API key from [X.AI](https://x.ai)

2. Set up your API key (choose one method):

**Method 1: Environment Variable**
```bash
export GROK_API_KEY=your_api_key_here
```

**Method 2: .env File**
```bash
cp .env.example .env
# Edit .env and add your API key
```

**Method 3: Command Line Flag**
```bash
grok --api-key your_api_key_here
```

**Method 4: User Settings File**
Create `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here"
}
```

3. (Optional, Recommended) Get your Morph API key from [Morph Dashboard](https://morphllm.com/dashboard/api-keys)

4. Set up your Morph API key for Fast Apply editing (choose one method):

**Method 1: Environment Variable**
```bash
export MORPH_API_KEY=your_morph_api_key_here
```

**Method 2: .env File**
```bash
# Add to your .env file
MORPH_API_KEY=your_morph_api_key_here
```

### Custom Base URL (Optional)

By default, the CLI uses `https://api.x.ai/v1` as the Grok API endpoint. You can configure a custom endpoint if needed (choose one method):

**Method 1: Environment Variable**
```bash
export GROK_BASE_URL=https://your-custom-endpoint.com/v1
```

**Method 2: Command Line Flag**
```bash
grok --api-key your_api_key_here --base-url https://your-custom-endpoint.com/v1
```

**Method 3: User Settings File**
Add to `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://your-custom-endpoint.com/v1"
}
```

## Configuration Files

Grok CLI uses two types of configuration files to manage settings:

### User-Level Settings (`~/.grok/user-settings.json`)

This file stores **global settings** that apply across all projects. These settings rarely change and include:

- **API Key**: Your Grok API key
- **Base URL**: Custom API endpoint (if needed)
- **Default Model**: Your preferred model (e.g., `grok-code-fast-1`)
- **Available Models**: List of models you can use

**Example:**
```json
{
  "apiKey": "your_api_key_here",
  "baseURL": "https://api.x.ai/v1",
  "defaultModel": "grok-code-fast-1",
  "models": [
    "grok-code-fast-1",
    "grok-4-latest",
    "grok-3-latest",
    "grok-3-fast",
    "grok-3-mini-fast"
  ]
}
```

### Project-Level Settings (`.grok/settings.json`)

This file stores **project-specific settings** in your current working directory. It includes:

- **Current Model**: The model currently in use for this project
- **MCP Servers**: Model Context Protocol server configurations

**Example:**
```json
{
  "model": "grok-3-fast",
  "mcpServers": {
    "linear": {
      "name": "linear",
      "transport": "stdio",
      "command": "npx",
      "args": ["@linear/mcp-server"]
    }
  }
}
```

### How It Works

1. **Global Defaults**: User-level settings provide your default preferences
2. **Project Override**: Project-level settings override defaults for specific projects
3. **Directory-Specific**: When you change directories, project settings are loaded automatically
4. **Fallback Logic**: Project model → User default model → System default (`grok-code-fast-1`)

This means you can have different models for different projects while maintaining consistent global settings like your API key.

### Using Other API Providers

**Important**: Grok CLI uses **OpenAI-compatible APIs**. You can use any provider that implements the OpenAI chat completions standard.

**Popular Providers**:
- **X.AI (Grok)**: `https://api.x.ai/v1` (default)
- **OpenAI**: `https://api.openai.com/v1`
- **OpenRouter**: `https://openrouter.ai/api/v1`
- **Groq**: `https://api.groq.com/openai/v1`

**Example with OpenRouter**:
```json
{
  "apiKey": "your_openrouter_key",
  "baseURL": "https://openrouter.ai/api/v1",
  "defaultModel": "anthropic/claude-3.5-sonnet",
  "models": [
    "anthropic/claude-3.5-sonnet",
    "openai/gpt-4o",
    "meta-llama/llama-3.1-70b-instruct"
  ]
}
```

## Usage

### Interactive Mode

Start the conversational AI assistant:
```bash
grok
```

Or specify a working directory:
```bash
grok -d /path/to/project
```

### Headless Mode

Process a single prompt and exit (useful for scripting and automation):
```bash
grok --prompt "show me the package.json file"
grok -p "create a new file called example.js with a hello world function"
grok --prompt "run bun test and show me the results" --directory /path/to/project
grok --prompt "complex task" --max-tool-rounds 50  # Limit tool usage for faster execution
```

This mode is particularly useful for:
- **CI/CD pipelines**: Automate code analysis and file operations
- **Scripting**: Integrate AI assistance into shell scripts
- **Terminal benchmarks**: Perfect for tools like Terminal Bench that need non-interactive execution
- **Batch processing**: Process multiple prompts programmatically

### Tool Execution Control

By default, Grok CLI allows up to 400 tool execution rounds to handle complex multi-step tasks. You can control this behavior:

```bash
# Limit tool rounds for faster execution on simple tasks
grok --max-tool-rounds 10 --prompt "show me the current directory"

# Increase limit for very complex tasks (use with caution)
grok --max-tool-rounds 1000 --prompt "comprehensive code refactoring"

# Works with all modes
grok --max-tool-rounds 20  # Interactive mode
grok git commit-and-push --max-tool-rounds 30  # Git commands
```

**Use Cases**:
- **Fast responses**: Lower limits (10-50) for simple queries
- **Complex automation**: Higher limits (500+) for comprehensive tasks
- **Resource control**: Prevent runaway executions in automated environments

### Model Selection

You can specify which AI model to use with the `--model` parameter or `GROK_MODEL` environment variable:

**Method 1: Command Line Flag**
```bash
# Use Grok models
grok --model grok-code-fast-1
grok --model grok-4-latest
grok --model grok-3-latest
grok --model grok-3-fast

# Use other models (with appropriate API endpoint)
grok --model gemini-2.5-pro --base-url https://api-endpoint.com/v1
grok --model claude-sonnet-4-20250514 --base-url https://api-endpoint.com/v1
```

**Method 2: Environment Variable**
```bash
export GROK_MODEL=grok-code-fast-1
grok
```

**Method 3: User Settings File**
Add to `~/.grok/user-settings.json`:
```json
{
  "apiKey": "your_api_key_here",
  "defaultModel": "grok-code-fast-1"
}
```

**Model Priority**: `--model` flag > `GROK_MODEL` environment variable > user default model > system default (grok-code-fast-1)

### Command Line Options

```bash
grok [options]

Options:
  -V, --version          output the version number
  -d, --directory <dir>  set working directory
  -k, --api-key <key>    Grok API key (or set GROK_API_KEY env var)
  -u, --base-url <url>   Grok API base URL (or set GROK_BASE_URL env var)
  -m, --model <model>    AI model to use (e.g., grok-code-fast-1, grok-4-latest) (or set GROK_MODEL env var)
  -p, --prompt <prompt>  process a single prompt and exit (headless mode)
  --max-tool-rounds <rounds>  maximum number of tool execution rounds (default: 400)
  -h, --help             display help for command
```

### Custom Instructions

You can provide custom instructions to tailor Grok's behavior to your project by creating a `.grok/GROK.md` file in your project directory:

```bash
mkdir .grok
```

Create `.grok/GROK.md` with your custom instructions:
```markdown
# Custom Instructions for Grok CLI

Always use TypeScript for any new code files.
When creating React components, use functional components with hooks.
Prefer const assertions and explicit typing over inference where it improves clarity.
Always add JSDoc comments for public functions and interfaces.
Follow the existing code style and patterns in this project.
```

Grok will automatically load and follow these instructions when working in your project directory. The custom instructions are added to Grok's system prompt and take priority over default behavior.

## Task Planning Framework

Grok CLI includes an intelligent task planning system that can automatically break down complex tasks into executable steps, assess risks, and execute them safely with automatic rollback on failure.

### How It Works

1. **Task Analysis**: Analyzes your request to understand intent (refactor, move, extract, etc.), scope, and complexity
2. **Plan Generation**: Creates a detailed execution plan with steps, dependencies, and risk assessment
3. **Validation**: Validates the plan for circular dependencies, invalid tools, and potential issues
4. **Risk Assessment**: Evaluates each step and overall plan risk (low/medium/high/critical)
5. **User Confirmation**: For high-risk operations, displays a detailed plan preview and requests approval
6. **Safe Execution**: Executes steps in dependency order with automatic rollback on failure
7. **Progress Tracking**: Provides real-time updates on execution progress

### Usage Examples

**Simple refactoring:**
```bash
grok --prompt "Refactor the authentication module to use dependency injection"
```

**Moving files:**
```bash
grok --prompt "Move all utility functions to a shared/utils folder"
```

**Extracting code:**
```bash
grok --prompt "Extract common validation logic into a separate validateUser function"
```

**Complex reorganization:**
```bash
grok --prompt "Reorganize the project structure to follow feature-based architecture"
```

### What Happens Behind the Scenes

When you request a complex task, Grok will:

1. **Analyze** the request and determine the best approach
2. **Create a plan** with specific steps like:
   - Analyze code structure and dependencies
   - Identify files to modify
   - Create backup points
   - Execute refactoring operations
   - Validate changes
3. **Show you the plan** if it's high-risk, including:
   - Total steps and estimated duration
   - Files that will be affected
   - Risk level and warnings
   - Suggested mitigations
4. **Ask for confirmation** before proceeding
5. **Execute the plan** with real-time progress updates
6. **Rollback automatically** if any step fails

### Plan Preview Example

```
═══════════════════════════════════════════════════════════
                      TASK PLAN PREVIEW
═══════════════════════════════════════════════════════════

Task: Refactor authentication module to use dependency injection

Total Steps: 8
Estimated Duration: 45 seconds
Risk Level: HIGH ⚠️

Steps:
  1. [ANALYSIS] Analyze authentication module structure
  2. [ANALYSIS] Identify dependencies and injection points
  3. [EDIT] Create dependency injection container
  4. [EDIT] Refactor AuthService to accept dependencies
  5. [EDIT] Update authentication middleware
  6. [EDIT] Modify service instantiation
  7. [TEST] Validate refactored code
  8. [ANALYSIS] Verify no circular dependencies

Files Affected: 12 files
Tools Used: code_context, dependency_analyzer, refactoring_assistant, multi_file_editor

Validation: ✅ VALID
Warnings:
  - High-risk operation affecting core authentication
  - Recommend creating backup before proceeding
  - Test coverage should be verified after changes

Suggestions:
  - Run tests after refactoring
  - Review dependency injection patterns
  - Consider gradual migration approach

═══════════════════════════════════════════════════════════
Proceed with execution? (y/n)
```

### Advanced Features

- **Automatic Rollback**: If any step fails, all changes are automatically reverted
- **Progress Events**: Real-time updates on current step, completion percentage, and time remaining
- **Dependency Ordering**: Steps execute in the correct order based on dependencies
- **Risk Mitigation**: Suggestions for reducing risk and improving success rate
- **Transaction Support**: Multi-file operations are atomic - all succeed or all rollback

### Testing

The Task Planning Framework includes comprehensive integration tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

All 19 integration tests cover:
- End-to-end plan creation and execution
- Plan validation and circular dependency detection
- Rollback on failure scenarios
- Risk assessment accuracy
- Progress event emission
- Error handling

## Morph Fast Apply (Optional)

Grok CLI supports Morph's Fast Apply model for high-speed code editing at **4,500+ tokens/sec with 98% accuracy**. This is an optional feature that provides lightning-fast file editing capabilities.

**Setup**: Configure your Morph API key following the [setup instructions](#setup) above.

### How It Works

When `MORPH_API_KEY` is configured:
- **`edit_file` tool becomes available** alongside the standard `str_replace_editor`
- **Optimized for complex edits**: Use for multi-line changes, refactoring, and large modifications
- **Intelligent editing**: Uses abbreviated edit format with `// ... existing code ...` comments
- **Fallback support**: Standard tools remain available if Morph is unavailable

**When to use each tool:**
- **`edit_file`** (Morph): Complex edits, refactoring, multi-line changes
- **`str_replace_editor`**: Simple text replacements, single-line edits

### Example Usage

With Morph Fast Apply configured, you can request complex code changes:

```bash
grok --prompt "refactor this function to use async/await and add error handling"
grok -p "convert this class to TypeScript and add proper type annotations"
```

The AI will automatically choose between `edit_file` (Morph) for complex changes or `str_replace_editor` for simple replacements.

## MCP Tools

Grok CLI supports MCP (Model Context Protocol) servers, allowing you to extend the AI assistant with additional tools and capabilities.

### Adding MCP Tools

#### Add a custom MCP server:
```bash
# Add an stdio-based MCP server
grok mcp add my-server --transport stdio --command "bun" --args server.js

# Add an HTTP-based MCP server
grok mcp add my-server --transport http --url "http://localhost:3000"

# Add with environment variables
grok mcp add my-server --transport stdio --command "python" --args "-m" "my_mcp_server" --env "API_KEY=your_key"
```

#### Add from JSON configuration:
```bash
grok mcp add-json my-server '{"command": "bun", "args": ["server.js"], "env": {"API_KEY": "your_key"}}'
```

### Linear Integration Example

To add Linear MCP tools for project management:

```bash
# Add Linear MCP server
grok mcp add linear --transport sse --url "https://mcp.linear.app/sse"
```

This enables Linear tools like:
- Create and manage Linear issues
- Search and filter issues
- Update issue status and assignees
- Access team and project information

### Managing MCP Servers

```bash
# List all configured servers
grok mcp list

# Test server connection
grok mcp test server-name

# Remove a server
grok mcp remove server-name
```

### Available Transport Types

- **stdio**: Run MCP server as a subprocess (most common)
- **http**: Connect to HTTP-based MCP server
- **sse**: Connect via Server-Sent Events

## Development

```bash
# Install dependencies
npm install

# Development mode
bun run dev

# Build project
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run linter
bun run lint

# Type check
bun run typecheck
```

### Pre-commit Hooks

This project uses [Husky](https://typicode.github.com/husky/) and [lint-staged](https://github.com/okonet/lint-staged) to run automated checks before commits:

- **ESLint**: Automatically fixes linting issues and checks for errors
- **TypeScript**: Runs type checking to prevent compilation errors
- **Staged files only**: Only checks files that are staged for commit

The pre-commit hook runs `npx lint-staged`, which processes `*.{ts,tsx}` files with:
1. `eslint --fix` - Auto-fix linting issues where possible
2. `tsc --noEmit` - Type check without emitting files

If checks fail, the commit is blocked until issues are resolved.

## Architecture

- **Agent**: Core command processing and execution logic
- **Tools**: Text editor and bash tool implementations
- **UI**: Ink-based terminal interface components
- **Types**: TypeScript definitions for the entire system

## License

MIT

## Credits

This project is based on [grok-cli](https://github.com/superagent-ai/grok-cli) by [@pelaseyed](https://x.com/pelaseyed).

## Troubleshooting

### Tool Execution Errors

If you encounter errors like `fs.readFile is not a function` or `fs.stat is not a function` when using file operations:

1. **This is a known issue** with the tool infrastructure
2. **Automatic fallback**: The CLI will automatically fall back to bash commands for file operations
3. **Warning messages**: You may see console warnings like "str_replace_editor tool failed, falling back to bash"
4. **Functionality**: Despite the warnings, operations should still work via bash fallbacks

This issue is being tracked and the fallbacks ensure the CLI remains functional.

### Common Issues

- **File operations fail**: Check that the file path exists and is accessible
- **Bash commands fail**: Ensure you have the necessary permissions
- **Tool timeouts**: Complex operations may take time; the spinner indicates progress

