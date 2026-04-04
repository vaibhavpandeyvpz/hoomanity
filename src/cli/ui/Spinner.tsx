import { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "./theme.js";
import cliSpinners, { type SpinnerName } from "cli-spinners";

type SpinnerProps = {
  type?: SpinnerName;
  color?: string;
  bold?: boolean;
};

export function Spinner({
  type = "dots",
  color = theme.accentPrimary,
  bold = true,
}: SpinnerProps) {
  const spinner = cliSpinners[type] || cliSpinners.dots;
  const { frames, interval } = spinner;

  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setI((x) => (x + 1) % frames.length);
    }, interval);
    return () => clearInterval(id);
  }, [frames.length, interval]);

  return (
    <Text color={color} bold={bold}>
      {frames[i]}
    </Text>
  );
}
