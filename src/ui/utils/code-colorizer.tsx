import React from 'react';
import { Text, Box } from 'ink';
import { highlight } from 'cli-highlight';

export const colorizeCode = (
  content: string,
  language: string | null,
  _availableTerminalHeight?: number,
  _terminalWidth?: number
): React.ReactNode => {
  // Try to apply syntax highlighting
  let highlightedContent = content;

  if (language) {
    try {
      highlightedContent = highlight(content, {
        language: language,
        ignoreIllegals: true,
        theme: {
          keyword: '\x1b[35m',      // Magenta
          built_in: '\x1b[36m',     // Cyan
          type: '\x1b[36m',         // Cyan
          literal: '\x1b[33m',      // Yellow
          number: '\x1b[33m',       // Yellow
          string: '\x1b[32m',       // Green
          comment: '\x1b[90m',      // Gray
          meta: '\x1b[36m',         // Cyan
          'meta-string': '\x1b[32m', // Green
          section: '\x1b[33m',      // Yellow
          tag: '\x1b[35m',          // Magenta
          name: '\x1b[34m',         // Blue
          'builtin-name': '\x1b[36m', // Cyan
          attr: '\x1b[36m',         // Cyan
          attribute: '\x1b[36m',    // Cyan
          variable: '\x1b[37m',     // White
          bullet: '\x1b[33m',       // Yellow
          code: '\x1b[32m',         // Green
          emphasis: '\x1b[3m',      // Italic
          strong: '\x1b[1m',        // Bold
          formula: '\x1b[33m',      // Yellow
          link: '\x1b[34m',         // Blue
          quote: '\x1b[90m',        // Gray
          'selector-tag': '\x1b[35m', // Magenta
          'selector-id': '\x1b[33m',  // Yellow
          'selector-class': '\x1b[33m', // Yellow
          'selector-attr': '\x1b[36m',  // Cyan
          'selector-pseudo': '\x1b[36m', // Cyan
          'template-tag': '\x1b[35m',    // Magenta
          'template-variable': '\x1b[33m', // Yellow
          addition: '\x1b[32m',     // Green
          deletion: '\x1b[31m',     // Red
        }
      });
    } catch {
      // If highlighting fails, fall back to plain text
      highlightedContent = content;
    }
  }

  return (
    <Box flexDirection="column">
      {highlightedContent.split('\n').map((line, index) => (
        <Text key={index} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
};