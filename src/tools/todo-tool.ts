import { ToolResult } from '../types/index.js';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export class TodoTool {
  private todos: TodoItem[] = [];

  async createTodoList(todos: TodoItem[]): Promise<ToolResult> {
    try {
      // Validate todos
      for (const todo of todos) {
        if (!todo.id || !todo.content || !todo.status || !todo.priority) {
          return {
            success: false,
            error: 'Each todo must have id, content, status, and priority fields'
          };
        }

        if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
          return {
            success: false,
            error: `Invalid status: ${todo.status}. Must be pending, in_progress, or completed`
          };
        }

        if (!['high', 'medium', 'low'].includes(todo.priority)) {
          return {
            success: false,
            error: `Invalid priority: ${todo.priority}. Must be high, medium, or low`
          };
        }
      }

      this.todos = todos;

      return {
        success: true,
        output: `Created todo list with ${todos.length} item${todos.length === 1 ? '' : 's'}`,
        data: this.todos
      };
    } catch (error) {
      return {
        success: false,
        error: `Error creating todo list: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async updateTodoList(updates: { id: string; status?: string; content?: string; priority?: string }[]): Promise<ToolResult> {
    try {
      const updatedIds: string[] = [];

      for (const update of updates) {
        const todoIndex = this.todos.findIndex(t => t.id === update.id);

        if (todoIndex === -1) {
          return {
            success: false,
            error: `Todo with id ${update.id} not found`
          };
        }

        const todo = this.todos[todoIndex];

        if (update.status && !['pending', 'in_progress', 'completed'].includes(update.status)) {
          return {
            success: false,
            error: `Invalid status: ${update.status}. Must be pending, in_progress, or completed`
          };
        }

        if (update.priority && !['high', 'medium', 'low'].includes(update.priority)) {
          return {
            success: false,
            error: `Invalid priority: ${update.priority}. Must be high, medium, or low`
          };
        }

        if (update.status) todo.status = update.status as any;
        if (update.content) todo.content = update.content;
        if (update.priority) todo.priority = update.priority as any;

        updatedIds.push(update.id);
      }

      return {
        success: true,
        output: `Updated ${updatedIds.length} todo item${updatedIds.length === 1 ? '' : 's'}`,
        data: this.todos
      };
    } catch (error) {
      return {
        success: false,
        error: `Error updating todo list: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async viewTodoList(): Promise<ToolResult> {
    return {
      success: true,
      output: this.todos.length === 0
        ? 'No todos created yet'
        : `Viewing ${this.todos.length} todo item${this.todos.length === 1 ? '' : 's'}`,
      data: this.todos
    };
  }
}