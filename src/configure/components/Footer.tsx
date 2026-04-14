import { Box, Text } from "ink";
import type { ReactElement } from "react";

export function Footer(props: {
  isSaving: boolean;
  saveStatus: string;
  validationMessage: string | undefined;
}): ReactElement {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>
        Keys: ←/→ switch tab, ↑/↓ select, Enter edit/toggle/action, S save, Q
        quit
      </Text>
      <Text>
        {props.isSaving ? (
          "Saving..."
        ) : (
          <SaveStatusLine text={props.saveStatus} />
        )}
      </Text>
      {props.validationMessage ? (
        <Text color="yellow">
          Runtime validation warning: {props.validationMessage}
        </Text>
      ) : (
        <Text color="green">Runtime validation OK.</Text>
      )}
    </Box>
  );
}

function SaveStatusLine(props: { text: string }): ReactElement {
  const sep = " | ";
  const i = props.text.indexOf(sep);
  if (i === -1) {
    return <>{props.text}</>;
  }
  const left = props.text.slice(0, i);
  const right = props.text.slice(i + sep.length);
  return (
    <>
      <Text bold>{left}</Text>
      {sep}
      {right}
    </>
  );
}
