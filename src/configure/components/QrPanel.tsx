import { Box, Text } from "ink";
import type { ReactElement } from "react";
import type { ConfigureTab } from "./types";
import type { WhatsAppAuthState } from "../whatsapp-auth";

export function QrPanel(props: {
  tab: ConfigureTab;
  authState: WhatsAppAuthState;
}): ReactElement | null {
  if (
    props.tab !== "WhatsApp" ||
    props.authState.status !== "qr_ready" ||
    !props.authState.qrAscii
  ) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>
        Scan below QR from WhatsApp (or WhatsApp Business) on your phone
      </Text>
      <Text>{props.authState.qrAscii}</Text>
      <Text dimColor>D disconnect · ←/→ tabs · S save · Q quit</Text>
    </Box>
  );
}
