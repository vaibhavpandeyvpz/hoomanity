import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import { theme } from "./theme.js";
import type { McpApprovalChoice } from "../../store/allowance.js";

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

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderStyle="round"
      borderColor={theme.warning}
      paddingX={1}
    >
      <Text bold color={theme.warning}>
        MCP tool approval
      </Text>
      <Text>
        Tool <Text color={theme.accentPrimary}>{toolName}</Text>
      </Text>
      {inputPreview ? (
        <Text color={theme.dim}>
          {inputPreview.length > 400
            ? `${inputPreview.slice(0, 397)}…`
            : inputPreview}
        </Text>
      ) : null}
      <Box marginY={1}>
        <SelectInput
          items={[
            { label: "Allow once", value: "allow" as const },
            {
              label: "Always allow for this agent",
              value: "allow_always" as const,
            },
            { label: "Deny", value: "deny" as const },
          ]}
          onSelect={(item) => {
            onChoice(item.value);
          }}
        />
      </Box>
      <Text color={theme.dim}>↑↓ · enter — choose · esc — deny</Text>
    </Box>
  );
}
