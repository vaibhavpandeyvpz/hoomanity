import { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "./theme.js";

type SpinnerProps = {
  type?: "braille" | "dots" | "pulse" | "arc" | "bounce" | "aesthetic";
  color?: string;
  bold?: boolean;
};

export function Spinner({
  type = "braille",
  color = theme.accentPrimary,
  bold = true,
}: SpinnerProps) {
  const frames =
    type === "braille"
      ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
      : type === "dots"
        ? ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"]
        : type === "arc"
          ? ["◜", "◠", "◝", "◞", "◡", "◟"]
          : type === "bounce"
            ? ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"]
            : type === "aesthetic"
              ? ["▹▹▹", "▸▹▹", "▹▸▹", "▹▹▸"]
              : ["", "·", "··", "···"];

  const intervalMs = type === "pulse" ? 200 : 80;

  const [i, setI] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setI((x) => (x + 1) % frames.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [frames.length, intervalMs]);

  return (
    <Text color={color} bold={bold}>
      {frames[i]}
    </Text>
  );
}
