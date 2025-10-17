import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { formatTokenCount } from "../../utils/token-counter.js";

interface LoadingSpinnerProps {
  isActive: boolean;
  processingTime: number;
  tokenCount: number;
}

const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const loadingTexts = [
  "Thinking...",
  "Processing...",
  "Analyzing...",
  "Working...",
  "Computing...",
  "Generating...",
  "Herding electrons...",
  "Combobulating...",
  "Discombobulating...",
  "Recombobulating...",
  "Calibrating flux capacitors...",
  "Reticulating splines...",
  "Adjusting bell curves...",
  "Optimizing bit patterns...",
  "Harmonizing frequencies...",
  "Synchronizing timelines...",
  "Defragmenting thoughts...",
  "Compiling wisdom...",
  "Bootstrapping reality...",
  "Untangling quantum states...",
  "Negotiating with servers...",
  "Convincing pixels to cooperate...",
  "Summoning digital spirits...",
  "Caffeinating algorithms...",
  "Debugging the universe...",
];

export function LoadingSpinner({
  isActive,
  processingTime,
  tokenCount,
}: LoadingSpinnerProps) {
  const [frame, setFrame] = useState(0);
  const [textIndex, setTextIndex] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    // Animate spinner at 12.5 FPS (80ms per frame)
    const spinnerInterval = setInterval(() => {
      setFrame((prev) => (prev + 1) % spinnerFrames.length);
    }, 80);

    // Change loading text every 3 seconds for variety
    const textInterval = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 3000);

    return () => {
      clearInterval(spinnerInterval);
      clearInterval(textInterval);
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <Box marginTop={1}>
      <Text color="blue">
        {spinnerFrames[frame]} {loadingTexts[textIndex]}
      </Text>
      <Text color="gray">
        {" "}({processingTime}s · ↑ {formatTokenCount(tokenCount)} tokens · esc to interrupt)
      </Text>
    </Box>
  );
}
