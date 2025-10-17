import React from 'react';
import { Text, Box } from 'ink';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

// Configure marked to use the terminal renderer with optimized settings
marked.setOptions({
  renderer: new (TerminalRenderer as any)({
    // Optimize for terminal display
    code: (code: string) => code, // Simplified code rendering
    blockquote: (quote: string) => `  ${quote}`, // Simplified blockquote
    html: () => '', // Strip HTML
    heading: (text: string, level: number) => {
      // Simplified heading rendering
      const prefix = '#'.repeat(level);
      return `${prefix} ${text}\n`;
    },
    hr: () => '─'.repeat(40) + '\n', // Simplified horizontal rule
    list: (body: string) => body, // Simplified list
    listitem: (text: string) => `  • ${text}\n`, // Simplified list item
    paragraph: (text: string) => `${text}\n`, // Simplified paragraph
    table: (header: string, body: string) => `${header}${body}`, // Simplified table
    tablerow: (content: string) => `${content}\n`, // Simplified table row
    tablecell: (content: string) => `${content} `, // Simplified table cell
  })
});

export function MarkdownRenderer({ content }: { content: string }) {
  try {
    // Use marked.parse for synchronous parsing
    const result = marked.parse(content);
    // Handle both sync and async results
    const rendered = typeof result === 'string' ? result : content;

    // Split into lines for better rendering control
    const lines = rendered.split('\n');

    return (
      <Box flexDirection="column">
        {lines.map((line, index) => (
          <Text key={index}>{line}</Text>
        ))}
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