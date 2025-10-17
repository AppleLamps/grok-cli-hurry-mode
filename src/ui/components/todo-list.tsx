import React from "react";
import { Box, Text } from "ink";

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

interface TodoListProps {
  todos: TodoItem[];
}

export const TodoList: React.FC<TodoListProps> = ({ todos }) => {
  if (!todos || todos.length === 0) {
    return <Text color="gray">No todos created yet</Text>;
  }

  const getCheckbox = (status: string): string => {
    switch (status) {
      case 'completed':
        return '●';
      case 'in_progress':
        return '◐';
      case 'pending':
        return '○';
      default:
        return '○';
    }
  };

  const getStatusColor = (status: string): 'green' | 'cyan' | 'white' => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'in_progress':
        return 'cyan';
      case 'pending':
        return 'white';
      default:
        return 'white';
    }
  };

  return (
    <Box flexDirection="column">
      {todos.map((todo, index) => {
        const checkbox = getCheckbox(todo.status);
        const statusColor = getStatusColor(todo.status);
        const isCompleted = todo.status === 'completed';

        return (
          <Box key={todo.id} marginLeft={index === 0 ? 0 : 2}>
            <Text color={statusColor} strikethrough={isCompleted}>
              {checkbox} {todo.content}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};

