import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ToolResult } from '../types/index.js';
import { ConfirmationService } from '../utils/confirmation-service.js';
import { SelfCorrectError } from '../types/errors.js';

const execAsync = promisify(exec);

export class BashTool {
  private currentDirectory: string = process.cwd();
  private confirmationService = ConfirmationService.getInstance();
  private readonly isWindows: boolean = os.platform() === 'win32';
  private readonly shell: string = this.isWindows ? 'powershell.exe' : '/bin/bash';

  /**
   * Translate common Unix commands to Windows equivalents
   */
  private translateCommand(command: string): string {
    if (!this.isWindows) {
      return command; // No translation needed on Unix
    }

    // Common Unix -> Windows command translations
    const translations: Record<string, (cmd: string) => string> = {
      'ls': (cmd) => {
        // ls -> dir or Get-ChildItem
        if (cmd === 'ls' || cmd === 'ls -la' || cmd === 'ls -l') {
          return 'Get-ChildItem | Format-Table -AutoSize';
        }
        // ls <path> -> Get-ChildItem <path>
        const match = cmd.match(/^ls\s+(.+)$/);
        if (match) {
          return `Get-ChildItem ${match[1]} | Format-Table -AutoSize`;
        }
        return cmd;
      },
      'grep': (cmd) => {
        // grep -> Select-String
        const match = cmd.match(/grep\s+(?:-r\s+)?["']?([^"'\s]+)["']?\s+(.+)/);
        if (match) {
          const pattern = match[1];
          const path = match[2];
          return `Get-ChildItem -Path ${path} -Recurse -File | Select-String -Pattern "${pattern}"`;
        }
        return cmd;
      },
      'find': (cmd) => {
        // find -> Get-ChildItem
        const match = cmd.match(/find\s+(.+?)\s+-name\s+["']?([^"'\s]+)["']?/);
        if (match) {
          const searchPath = match[1];
          const pattern = match[2];
          return `Get-ChildItem -Path ${searchPath} -Filter "${pattern}" -Recurse`;
        }
        return cmd;
      },
      'cat': (cmd) => {
        // cat -> Get-Content
        const match = cmd.match(/cat\s+(.+)/);
        if (match) {
          return `Get-Content ${match[1]}`;
        }
        return cmd;
      },
      'pwd': () => 'Get-Location',
      'which': (cmd) => {
        const match = cmd.match(/which\s+(.+)/);
        if (match) {
          return `Get-Command ${match[1]} -ErrorAction SilentlyContinue`;
        }
        return cmd;
      }
    };

    // Check if command starts with any known Unix command
    for (const [unixCmd, translator] of Object.entries(translations)) {
      if (command.startsWith(unixCmd)) {
        const translated = translator(command);
        if (translated !== command) {
          console.log(`🔄 Translated command: "${command}" -> "${translated}"`);
        }
        return translated;
      }
    }

    return command;
  }

  async execute(command: string, timeout: number = 60000): Promise<ToolResult> {
    try {
      // Translate Unix commands to Windows equivalents if needed
      const translatedCommand = this.translateCommand(command);

      // Check if user has already accepted bash commands for this session
      const sessionFlags = this.confirmationService.getSessionFlags();
      if (!sessionFlags.bashCommands && !sessionFlags.allOperations) {
        // Request confirmation showing the command
        const confirmationResult = await this.confirmationService.requestConfirmation({
          operation: 'Run bash command',
          filename: translatedCommand,
          showVSCodeOpen: false,
          content: `Command: ${translatedCommand}\nWorking directory: ${this.currentDirectory}\nPlatform: ${this.isWindows ? 'Windows' : 'Unix'}`
        }, 'bash');

        if (!confirmationResult.confirmed) {
          return {
            success: false,
            error: confirmationResult.feedback || 'Command execution cancelled by user'
          };
        }
      }

      if (command.startsWith('cd ')) {
        const newDir = command.substring(3).trim();
        try {
          process.chdir(newDir);
          this.currentDirectory = process.cwd();
          return {
            success: true,
            output: `Changed directory to: ${this.currentDirectory}`
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Cannot change directory: ${error.message}`
          };
        }
      }

      const { stdout, stderr } = await execAsync(translatedCommand, {
        cwd: this.currentDirectory,
        timeout,
        maxBuffer: 1024 * 1024 * 10,
        shell: this.shell
      });

      const output = stdout + (stderr ? `\nSTDERR: ${stderr}` : '');

      return {
        success: true,
        output: output.trim() || 'Command executed successfully (no output)'
      };
    } catch (error: any) {
      // If command failed and we're on Windows, suggest using Node.js helpers
      if (this.isWindows && error.message.includes('is not recognized')) {
        const originalCmd = command.split(' ')[0];
        throw new SelfCorrectError({
          message: `Command '${originalCmd}' not recognized on Windows`,
          originalTool: 'bash',
          suggestedFallbacks: [
            `Use BashTool.listFiles() instead of 'ls'`,
            `Use BashTool.findFiles() instead of 'find'`,
            `Use BashTool.grep() instead of 'grep'`,
            `Use PowerShell commands (Get-ChildItem, Select-String, etc.)`
          ],
          hint: `The command '${command}' is a Unix command. On Windows, use the built-in Node.js helpers or PowerShell equivalents.`,
          metadata: { originalCommand: command, platform: 'win32' }
        });
      }

      return {
        success: false,
        error: `Command failed: ${error.message}`
      };
    }
  }

  getCurrentDirectory(): string {
    return this.currentDirectory;
  }

  /**
   * List files in a directory (Windows-compatible using Node APIs)
   */
  async listFiles(directory: string = '.'): Promise<ToolResult> {
    try {
      const targetDir = path.resolve(this.currentDirectory, directory);

      if (!fs.existsSync(targetDir)) {
        return {
          success: false,
          error: `Directory not found: ${directory}`
        };
      }

      const stats = await fs.promises.stat(targetDir);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Not a directory: ${directory}`
        };
      }

      const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });

      let output = `Directory: ${targetDir}\n\n`;
      output += `${'Type'.padEnd(10)} ${'Size'.padEnd(12)} ${'Name'}\n`;
      output += `${'-'.repeat(10)} ${'-'.repeat(12)} ${'-'.repeat(40)}\n`;

      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry.name);
        let size = '';
        let type = '';

        if (entry.isDirectory()) {
          type = '<DIR>';
        } else if (entry.isFile()) {
          type = 'FILE';
          const fileStat = await fs.promises.stat(fullPath);
          size = this.formatFileSize(fileStat.size);
        } else if (entry.isSymbolicLink()) {
          type = '<LINK>';
        } else {
          type = 'OTHER';
        }

        output += `${type.padEnd(10)} ${size.padEnd(12)} ${entry.name}\n`;
      }

      output += `\nTotal: ${entries.length} items`;

      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list files: ${error.message}`
      };
    }
  }

  /**
   * Find files matching a pattern (Windows-compatible using Node APIs)
   */
  async findFiles(pattern: string, directory: string = '.'): Promise<ToolResult> {
    try {
      const targetDir = path.resolve(this.currentDirectory, directory);

      if (!fs.existsSync(targetDir)) {
        return {
          success: false,
          error: `Directory not found: ${directory}`
        };
      }

      const matches: string[] = [];
      const searchPattern = pattern.toLowerCase();

      const walkDir = async (dir: string, depth: number = 0): Promise<void> => {
        if (depth > 20) return; // Prevent infinite recursion

        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(targetDir, fullPath);

            // Skip common directories
            if (entry.isDirectory() && ['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
              continue;
            }

            if (entry.isFile()) {
              // Simple pattern matching (supports wildcards)
              const fileName = entry.name.toLowerCase();
              const patternRegex = new RegExp(
                '^' + searchPattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
              );

              if (patternRegex.test(fileName) || fileName.includes(searchPattern)) {
                matches.push(relativePath);
              }
            } else if (entry.isDirectory()) {
              await walkDir(fullPath, depth + 1);
            }
          }
        } catch {
          // Skip directories we can't read
        }
      };

      await walkDir(targetDir);

      if (matches.length === 0) {
        return {
          success: true,
          output: `No files found matching pattern: ${pattern}`
        };
      }

      return {
        success: true,
        output: `Found ${matches.length} files:\n${matches.join('\n')}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to find files: ${error.message}`
      };
    }
  }

  /**
   * Search for text in files (Windows-compatible using Node APIs)
   */
  async grep(pattern: string, files: string = '.'): Promise<ToolResult> {
    try {
      const targetPath = path.resolve(this.currentDirectory, files);

      if (!fs.existsSync(targetPath)) {
        return {
          success: false,
          error: `Path not found: ${files}`
        };
      }

      const matches: Array<{ file: string; line: number; text: string }> = [];
      const searchPattern = new RegExp(pattern, 'i');

      const searchInFile = async (filePath: string): Promise<void> => {
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const lines = content.split('\n');

          lines.forEach((line, index) => {
            if (searchPattern.test(line)) {
              matches.push({
                file: path.relative(targetPath, filePath),
                line: index + 1,
                text: line.trim()
              });
            }
          });
        } catch {
          // Skip files we can't read (binary, permissions, etc.)
        }
      };

      const walkDir = async (dir: string, depth: number = 0): Promise<void> => {
        if (depth > 20) return;

        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Skip common directories
            if (entry.isDirectory() && ['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
              continue;
            }

            if (entry.isFile()) {
              // Skip binary files
              const ext = path.extname(entry.name).toLowerCase();
              const textExtensions = ['.ts', '.js', '.json', '.md', '.txt', '.yml', '.yaml', '.xml', '.html', '.css', '.tsx', '.jsx'];

              if (textExtensions.includes(ext) || ext === '') {
                await searchInFile(fullPath);
              }
            } else if (entry.isDirectory()) {
              await walkDir(fullPath, depth + 1);
            }
          }
        } catch {
          // Skip directories we can't read
        }
      };

      const stats = await fs.promises.stat(targetPath);
      if (stats.isFile()) {
        await searchInFile(targetPath);
      } else if (stats.isDirectory()) {
        await walkDir(targetPath);
      }

      if (matches.length === 0) {
        return {
          success: true,
          output: `No matches found for pattern: ${pattern}`
        };
      }

      let output = `Found ${matches.length} matches:\n\n`;
      matches.slice(0, 50).forEach(match => {
        output += `${match.file}:${match.line}: ${match.text}\n`;
      });

      if (matches.length > 50) {
        output += `\n... and ${matches.length - 50} more matches`;
      }

      return {
        success: true,
        output
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to search: ${error.message}`
      };
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}