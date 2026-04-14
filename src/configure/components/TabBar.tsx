import { Box, Text } from "ink";
import type { ReactElement } from "react";
import { TAB_ORDER, type ConfigureTab } from "./types";

export function TabBar(props: { activeTab: ConfigureTab }): ReactElement {
  return (
    <Box marginTop={1}>
      {TAB_ORDER.map((entry) => (
        <Box key={entry} marginRight={2}>
          {entry === props.activeTab ? (
            <Box backgroundColor="black" paddingX={1}>
              <Text color="white" bold>
                {entry}
              </Text>
            </Box>
          ) : (
            <Box paddingX={1}>
              <Text dimColor bold>
                {entry}
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
