import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { ReactElement } from "react";
import type { FieldItem } from "./types";

export function EditorPrompt(props: {
  field: FieldItem | undefined;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}): ReactElement | null {
  if (!props.field) {
    return null;
  }
  return (
    <Box marginTop={1}>
      <Text bold>{props.field.label}: </Text>
      <TextInput
        value={props.value}
        onChange={props.onChange}
        onSubmit={props.onSubmit}
        mask={props.field.kind === "secret" ? "*" : undefined}
        placeholder={props.field.editorPlaceholder ?? ""}
      />
    </Box>
  );
}
