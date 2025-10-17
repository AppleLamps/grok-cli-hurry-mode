import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

interface ProgressIndicatorProps {
  label: string;
  isActive: boolean;
  color?: string;
}

const progressFrames = ["▱▱▱▱▱", "▰▱▱▱▱", "▰▰▱▱▱", "▰▰▰▱▱", "▰▰▰▰▱", "▰▰▰▰▰"];

export function ProgressIndicator({
  label,
  isActive,
  color = "cyan",
}: ProgressIndicatorProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % progressFrames.length);
    }, 200); // 5 FPS for smooth progress animation

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  return (
    <Box>
      <Text color={color}>
        {progressFrames[frame]} {label}
      </Text>
    </Box>
  );
}

