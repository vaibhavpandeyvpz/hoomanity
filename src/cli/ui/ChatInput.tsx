import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { theme } from "./theme.js";

type Props = {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (val: string) => void;
  placeholder?: string;
  isActive?: boolean;
};

export function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message…",
  isActive = true,
}: Props) {
  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={theme.accentPrimary}
      paddingX={1}
      marginTop={1}
    >
      <Text color={theme.accentPrimary} bold>
        ›{" "}
      </Text>
      <Box flexGrow={1}>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
          focus={isActive}
        />
      </Box>
    </Box>
  );
}
