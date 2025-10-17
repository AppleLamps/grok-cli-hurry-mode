import React from 'react';
import { Text, Box } from 'ink';

/**
 * Simple markdown renderer that uses Ink components instead of ANSI codes
 * This prevents rendering corruption when ANSI codes interfere with Ink's rendering
 */
export function MarkdownRenderer({ content }: { content: string }) {
  try {
    const lines = content.split('\n');
    const renderedLines: React.ReactNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Heading detection (# ## ### etc.)
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2];
        renderedLines.push(
          <Text key={i} bold color={level <= 2 ? 'cyan' : 'white'}>
            {text}
          </Text>
        );
        continue;
      }

      // Bold text (**text** or __text__)
      if (line.includes('**') || line.includes('__')) {
        const parts = line.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
        renderedLines.push(
          <Box key={i} flexDirection="row">
            {parts.map((part, idx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <Text key={idx} bold>{part.slice(2, -2)}</Text>;
              } else if (part.startsWith('__') && part.endsWith('__')) {
                return <Text key={idx} bold>{part.slice(2, -2)}</Text>;
              }
              return <Text key={idx}>{part}</Text>;
            })}
          </Box>
        );
        continue;
      }

      // Code blocks (```language ... ```)
      if (line.startsWith('```')) {
        const codeLines: string[] = [];
        i++; // Skip the opening ```
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        renderedLines.push(
          <Box key={i} flexDirection="column" marginLeft={2}>
            {codeLines.map((codeLine, idx) => (
              <Text key={idx} color="gray">
                {codeLine}
              </Text>
            ))}
          </Box>
        );
        continue;
      }

      // Inline code (`code`)
      if (line.includes('`')) {
        const parts = line.split(/(`[^`]+`)/g);
        renderedLines.push(
          <Box key={i} flexDirection="row">
            {parts.map((part, idx) => {
              if (part.startsWith('`') && part.endsWith('`')) {
                return <Text key={idx} color="gray">{part.slice(1, -1)}</Text>;
              }
              return <Text key={idx}>{part}</Text>;
            })}
          </Box>
        );
        continue;
      }

      // List items (- or * or + or 1. 2. etc.)
      const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
      if (listMatch) {
        const indent = listMatch[1].length;
        const text = listMatch[3];
        renderedLines.push(
          <Box key={i} marginLeft={indent}>
            <Text color="cyan">• </Text>
            <Text>{text}</Text>
          </Box>
        );
        continue;
      }

      // Blockquote (> text)
      if (line.startsWith('>')) {
        renderedLines.push(
          <Box key={i} marginLeft={2}>
            <Text color="gray" dimColor>{line.substring(1).trim()}</Text>
          </Box>
        );
        continue;
      }

      // Horizontal rule (--- or ***)
      if (line.match(/^(-{3,}|\*{3,})$/)) {
        renderedLines.push(
          <Text key={i} color="gray">{'─'.repeat(40)}</Text>
        );
        continue;
      }

      // Regular paragraph
      if (line.trim()) {
        renderedLines.push(
          <Text key={i}>{line}</Text>
        );
      } else {
        // Empty line
        renderedLines.push(<Text key={i}> </Text>);
      }
    }

    return (
      <Box flexDirection="column">
        {renderedLines}
      </Box>
    );
  } catch (error) {
    // Fallback to plain text if markdown parsing fails
    if (process.env.DEBUG === '1') {
      console.error('Markdown rendering error:', error);
    }
    return <Text>{content}</Text>;
  }
}