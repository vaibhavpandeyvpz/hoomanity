import { Box, Text } from "ink";
import cliSpinners from "cli-spinners";
import { useEffect, useState, type ReactElement } from "react";
import { formatFieldValue } from "./format";
import type { FieldItem } from "./types";

export function FieldList(props: {
  fields: FieldItem[];
  selectedIndex: number;
}): ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      {props.fields.map((field, index) => {
        const selected = index === props.selectedIndex;
        const displayValue = formatFieldValue(field);
        const dimReadonlyEmpty =
          field.kind === "readonly" && String(displayValue).trim() === "";
        const statusValue =
          field.kind === "readonly" &&
          field.id === "whatsapp.status" &&
          displayValue === "connecting" ? (
            <ConnectingSpinner />
          ) : (
            displayValue
          );
        return (
          <Box key={field.id} flexDirection="column">
            <Text
              color={selected && !dimReadonlyEmpty ? "cyan" : undefined}
              dimColor={dimReadonlyEmpty}
            >
              {selected ? "•" : " "} <Text bold>{field.label}</Text>
              {": "}
              {statusValue}
            </Text>
            {field.helper ? <Text dimColor>{field.helper}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}

function ConnectingSpinner(): ReactElement {
  const { frames, interval } = cliSpinners.star;
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, interval);
    return () => {
      clearInterval(timer);
    };
  }, [frames.length, interval]);
  return <Text color="yellow">{frames[frameIndex] ?? ""} connecting</Text>;
}
