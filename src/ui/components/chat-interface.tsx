import React, { useState, useEffect, useRef, useCallback } from "react";

import { Box, Text, DOMElement } from "ink";
import { GrokAgent, ChatEntry } from "../../agent/grok-agent.js";
import { useInputHandler } from "../../hooks/use-input-handler.js";
import { LoadingSpinner } from "./loading-spinner.js";
import { CommandSuggestions } from "./command-suggestions.js";
import { ModelSelection } from "./model-selection.js";
import { ChatHistory } from "./chat-history.js";
import { ChatInput } from "./chat-input.js";
import { MCPStatus } from "./mcp-status.js";
import ConfirmationDialog from "./confirmation-dialog.js";
import {
  ConfirmationService,
  ConfirmationOptions,
} from "../../utils/confirmation-service.js";
import ApiKeyInput from "./api-key-input.js";

interface ChatInterfaceProps {
  agent?: GrokAgent;
  initialMessage?: string;
}

// Logo component to display ASCII art and welcome text
const Logo = React.memo(function Logo() {
  return (
    <Box flexDirection="column" marginBottom={2}>
      <Text color="cyan" bold>
        {`    dBBBBb dBBBBBb    dBBBBP  dBP dBP          dBBBP  dBP    dBP
               dBP   dB'.BP  dBP.d8P
  dBBBB    dBBBBK'  dB'.BP  dBBBBP'          dBP    dBP    dBP
 dB' BB   dBP  BB  dB'.BP  dBP BB  dBBBBBP  dBP    dBP    dBP
dBBBBBB  dBP  dB' dBBBBP  dBP dB'          dBBBBP dBBBBP dBP    `}
      </Text>
      <Text color="cyan" bold>
        Tips for getting started:
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color="gray">
          1. Ask questions, edit files, or run commands.
        </Text>
        <Text color="gray">2. Be specific for the best results.</Text>
        <Text color="gray">
          3. Create GROK.md files to customize your interactions with Grok.
        </Text>
        <Text color="gray">
          4. Press Shift+Tab to toggle auto-edit mode.
        </Text>
        <Text color="gray">
          5. Run "/init-agent" to set up an .agent docs system for this project.
        </Text>
        <Text color="gray">
          6. Run "/heal" after errors to capture a fix and add a guardrail.
        </Text>
        <Text color="gray">7. /help for more information.</Text>
      </Box>
    </Box>
  );
});

// Main chat component that handles input when agent is available
function ChatInterfaceWithAgent({
  agent,
  initialMessage,
}: {
  agent: GrokAgent;
  initialMessage?: string;
}) {
  const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTime, setProcessingTime] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [confirmationOptions, setConfirmationOptions] =
    useState<ConfirmationOptions | null>(null);
  const scrollRef = useRef<DOMElement | null>(null);
  const processingStartTime = useRef<number>(0);

  const confirmationService = ConfirmationService.getInstance();

  const {
    input,
    cursorPosition,
    showCommandSuggestions,
    selectedCommandIndex,
    showModelSelection,
    selectedModelIndex,
    commandSuggestions,
    availableModels,
    autoEditEnabled,
  } = useInputHandler({
    agent,
    chatHistory,
    setChatHistory,
    setIsProcessing,
    setIsStreaming,
    setTokenCount,
    setProcessingTime,
    processingStartTime,
    isProcessing,
    isStreaming,
    isConfirmationActive: !!confirmationOptions,
  });

  // Initialize chat history on mount
  useEffect(() => {
    setChatHistory([]);
  }, []);

  // Process initial message if provided (streaming for faster feedback)
  useEffect(() => {
    if (initialMessage && agent) {
      const userEntry: ChatEntry = {
        type: "user",
        content: initialMessage,
        timestamp: new Date(),
      };
      setChatHistory([userEntry]);

      const processInitialMessage = async () => {
        setIsProcessing(true);
        setIsStreaming(true);

        try {
          for await (const chunk of agent.processUserMessageStream(initialMessage)) {
            setChatHistory((prev) => {
              const lastEntry = prev[prev.length - 1];

              switch (chunk.type) {
                case "content":
                  if (chunk.content) {
                    // If last entry is streaming, append content
                    if (lastEntry?.isStreaming) {
                      return prev.map((entry, idx) =>
                        idx === prev.length - 1
                          ? { ...entry, content: entry.content + chunk.content }
                          : entry
                      );
                    } else {
                      // Create new streaming entry
                      return [
                        ...prev,
                        {
                          type: "assistant",
                          content: chunk.content,
                          timestamp: new Date(),
                          isStreaming: true,
                        },
                      ];
                    }
                  }
                  break;

                case "token_count":
                  if (chunk.tokenCount !== undefined) {
                    setTokenCount(chunk.tokenCount);
                  }
                  break;

                case "tool_calls":
                  if (chunk.toolCalls) {
                    // Finalize streaming entry and add tool calls
                    const updatedPrev = prev.map((entry) =>
                      entry.isStreaming
                        ? { ...entry, isStreaming: false, toolCalls: chunk.toolCalls }
                        : entry
                    );

                    // Add individual tool call entries
                    const toolCallEntries = chunk.toolCalls.map((toolCall) => ({
                      type: "tool_call" as const,
                      content: "Executing...",
                      timestamp: new Date(),
                      toolCall: toolCall,
                    }));

                    return [...updatedPrev, ...toolCallEntries];
                  }
                  break;

                case "tool_result":
                  if (chunk.toolCall && chunk.toolResult) {
                    // Update matching tool_call entry with result
                    return prev.map((entry) => {
                      if (entry.type === "tool_call" && entry.toolCall?.id === chunk.toolCall.id) {
                        return {
                          ...entry,
                          type: "tool_result",
                          content: chunk.toolResult.success
                            ? chunk.toolResult.output || "Success"
                            : chunk.toolResult.error || "Error occurred",
                          toolResult: chunk.toolResult,
                        };
                      }
                      return entry;
                    });
                  }
                  break;

                case "done":
                  // Finalize any streaming entries
                  return prev.map((entry) =>
                    entry.isStreaming ? { ...entry, isStreaming: false } : entry
                  );
              }

              return prev;
            });
          }

          // Final cleanup
          setChatHistory((prev) =>
            prev.map((entry) =>
              entry.isStreaming ? { ...entry, isStreaming: false } : entry
            )
          );
          setIsStreaming(false);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorEntry: ChatEntry = {
            type: "assistant",
            content: `Error: ${errorMessage}`,
            timestamp: new Date(),
          };
          setChatHistory((prev) => [...prev, errorEntry]);
          setIsStreaming(false);
        }

        setIsProcessing(false);
        processingStartTime.current = 0;
      };

      processInitialMessage();
    }
  }, [initialMessage, agent]);

  useEffect(() => {
    const handleConfirmationRequest = (options: ConfirmationOptions) => {
      setConfirmationOptions(options);
    };

    confirmationService.on("confirmation-requested", handleConfirmationRequest);

    return () => {
      confirmationService.off(
        "confirmation-requested",
        handleConfirmationRequest
      );
    };
  }, [confirmationService]);

  useEffect(() => {
    if (!isProcessing && !isStreaming) {
      setProcessingTime(0);
      return;
    }

    if (processingStartTime.current === 0) {
      processingStartTime.current = Date.now();
    }

    const interval = setInterval(() => {
      setProcessingTime(
        Math.floor((Date.now() - processingStartTime.current) / 1000)
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [isProcessing, isStreaming]);

  const handleConfirmation = useCallback((dontAskAgain?: boolean) => {
    confirmationService.confirmOperation(true, dontAskAgain);
    setConfirmationOptions(null);
  }, [confirmationService]);

  const handleRejection = useCallback((feedback?: string) => {
    confirmationService.rejectOperation(feedback);
    setConfirmationOptions(null);

    // Reset processing states when operation is cancelled
    setIsProcessing(false);
    setIsStreaming(false);
    setTokenCount(0);
    setProcessingTime(0);
    processingStartTime.current = 0;
  }, [confirmationService]);

  return (
    <Box flexDirection="column" paddingX={2}>
      {/* Show logo and tips only when no chat history and no confirmation dialog */}
      {chatHistory.length === 0 && !confirmationOptions && <Logo />}

      <Box flexDirection="column" marginBottom={1}>
        <Text color="gray">
          Type your request in natural language. Ctrl+C to clear, 'exit' to
          quit.
        </Text>
      </Box>

      <Box flexDirection="column" ref={scrollRef}>
        <ChatHistory
          entries={chatHistory}
          isConfirmationActive={!!confirmationOptions}
        />
      </Box>

      {/* Show confirmation dialog if one is pending */}
      {confirmationOptions && (
        <ConfirmationDialog
          operation={confirmationOptions.operation}
          filename={confirmationOptions.filename}
          showVSCodeOpen={confirmationOptions.showVSCodeOpen}
          content={confirmationOptions.content}
          onConfirm={handleConfirmation}
          onReject={handleRejection}
        />
      )}

      {!confirmationOptions && (
        <>
          <LoadingSpinner
            isActive={isProcessing || isStreaming}
            processingTime={processingTime}
            tokenCount={tokenCount}
          />

          <ChatInput
            input={input}
            cursorPosition={cursorPosition}
            isProcessing={isProcessing}
            isStreaming={isStreaming}
          />

          <Box flexDirection="row" marginTop={1}>
            <Box marginRight={2}>
              <Text color="cyan">
                {autoEditEnabled ? "▶" : "⏸"} auto-edit:{" "}
                {autoEditEnabled ? "on" : "off"}
              </Text>
              <Text color="gray" dimColor>
                {" "}
                (shift + tab)
              </Text>
            </Box>
            <Box marginRight={2}>
              <Text color="yellow">≋ {agent.getCurrentModel()}</Text>
            </Box>
            <MCPStatus />
          </Box>

          <CommandSuggestions
            suggestions={commandSuggestions}
            input={input}
            selectedIndex={selectedCommandIndex}
            isVisible={showCommandSuggestions}
          />

          <ModelSelection
            models={availableModels}
            selectedIndex={selectedModelIndex}
            isVisible={showModelSelection}
            currentModel={agent.getCurrentModel()}
          />
        </>
      )}
    </Box>
  );
}

// Main component that handles API key input or chat interface
export default function ChatInterface({
  agent,
  initialMessage,
}: ChatInterfaceProps) {
  const [currentAgent, setCurrentAgent] = useState<GrokAgent | null>(
    agent || null
  );

  const handleApiKeySet = (newAgent: GrokAgent) => {
    setCurrentAgent(newAgent);
  };

  if (!currentAgent) {
    return <ApiKeyInput onApiKeySet={handleApiKeySet} />;
  }

  return (
    <ChatInterfaceWithAgent
      agent={currentAgent}
      initialMessage={initialMessage}
    />
  );
}
