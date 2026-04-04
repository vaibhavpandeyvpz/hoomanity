import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { theme } from "./theme.js";
import type { McpApprovalChoice } from "../../store/allowance.js";

function ChoiceItem({
  label,
  value,
  isSelected,
}: {
  label: string;
  value: string;
  isSelected?: boolean;
}) {
  if (value === "deny") {
    return (
      <Text color={isSelected ? theme.error : theme.dim} bold={isSelected}>
        {label}
      </Text>
    );
  }
  return (
    <Text
      color={isSelected ? theme.accentPrimary : undefined}
      bold={isSelected}
    >
      {label}
    </Text>
  );
}

/** Compact, inline-looking tool approval prompt. */
export function McpApprovalBlock({
  toolName,
  inputPreview,
  onChoice,
}: {
  readonly toolName: string;
  readonly inputPreview: string;
  readonly onChoice: (choice: McpApprovalChoice) => void;
}) {
  useInput(
    (_input, key) => {
      if (key.escape) {
        onChoice("deny");
      }
    },
    { isActive: true },
  );

  // Truncate args to keep it tight
  const short =
    inputPreview.length > 120 ? `${inputPreview.slice(0, 117)}…` : inputPreview;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={theme.warning}
        paddingX={1}
        flexDirection="column"
      >
        <Box flexDirection="row">
          <Text color={theme.dim} bold>
            Tool{" "}
          </Text>
          <Text color={theme.accentSecondary}>{toolName}</Text>
          <Text color={theme.dim}> — approve?</Text>
        </Box>
        {short ? <Text color={theme.dim}>{short}</Text> : null}
        <Box marginTop={1} marginBottom={1}>
          <SelectInput
            items={[
              { label: "Allow", value: "allow" as const },
              { label: "Always", value: "allow_always" as const },
              { label: "Deny", value: "deny" as const },
            ]}
            itemComponent={
              ChoiceItem as React.FC<{
                isSelected?: boolean;
                label: string;
              }>
            }
            onSelect={(item) => {
              onChoice(item.value);
            }}
          />
        </Box>
        <Text color={theme.dim}>↑↓ · enter — choose · esc — deny</Text>
      </Box>
    </Box>
  );
}
