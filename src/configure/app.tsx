import { Box, Text, useApp, useInput } from "ink";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { AppConfig } from "../config";
import { validateConfig, writeEditableConfig } from "../config";
import {
  startWhatsAppAuth,
  type WhatsAppAuthHandle,
  type WhatsAppAuthState,
} from "./whatsapp-auth";
import { clearWhatsAppSessionData } from "./whatsapp-session";
import { buildTabFields } from "./components/buildTabFields";
import { EditorPrompt } from "./components/EditorPrompt";
import { FieldList } from "./components/FieldList";
import { Footer } from "./components/Footer";
import { QrPanel } from "./components/QrPanel";
import { TabBar } from "./components/TabBar";
import {
  TAB_ORDER,
  type ConfigureTab,
  type FieldItem,
} from "./components/types";

export function ConfigureApp(props: {
  initialConfig: AppConfig;
  configPath: string;
}): ReactElement {
  const [tab, setTab] = useState<ConfigureTab>("ACP");
  const [draft, setDraft] = useState<AppConfig>(props.initialConfig);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingFieldId, setEditingFieldId] = useState<string | undefined>();
  const [editValue, setEditValue] = useState("");
  const [savedBaseline, setSavedBaseline] = useState<AppConfig>(() =>
    cloneConfig(props.initialConfig),
  );
  const [postSaveAck, setPostSaveAck] = useState<{
    path: string;
    hadValidationWarning: boolean;
  } | null>(null);
  const [saveFailure, setSaveFailure] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [authState, setAuthState] = useState<WhatsAppAuthState>({
    status: "idle",
    qrUpdates: 0,
  });
  const authHandleRef = useRef<WhatsAppAuthHandle | null>(null);
  const prevTabRef = useRef<ConfigureTab>(tab);
  const { exit } = useApp();

  const stopAuth = useCallback(async () => {
    if (!authHandleRef.current) return;
    await authHandleRef.current.stop();
    authHandleRef.current = null;
  }, []);

  const startAuth = useCallback(async () => {
    if (authHandleRef.current) {
      await authHandleRef.current.stop();
      authHandleRef.current = null;
    }
    authHandleRef.current = await startWhatsAppAuth(
      draft.whatsapp,
      setAuthState,
    );
  }, [draft.whatsapp]);

  const logout = useCallback(async () => {
    await stopAuth();
    await clearWhatsAppSessionData(draft.whatsapp);
    setAuthState({ status: "idle", qrUpdates: 0 });
  }, [draft.whatsapp, stopAuth]);

  const validationMessage = useMemo(() => {
    try {
      validateConfig(draft, props.configPath);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }, [draft, props.configPath]);

  const hasUnsavedChanges = useMemo(
    () => configFingerprint(draft) !== configFingerprint(savedBaseline),
    [draft, savedBaseline],
  );

  useEffect(() => {
    if (hasUnsavedChanges) {
      setPostSaveAck(null);
    }
  }, [hasUnsavedChanges]);

  const saveStatusLine = useMemo(() => {
    if (saveFailure) {
      return `Unsaved changes | Save failed: ${saveFailure}`;
    }
    if (postSaveAck && !hasUnsavedChanges) {
      return postSaveAck.hadValidationWarning
        ? `No unsaved changes | Saved to ${postSaveAck.path}. (Runtime warnings remain)`
        : `No unsaved changes | Saved to ${postSaveAck.path}.`;
    }
    return `${
      hasUnsavedChanges ? "Unsaved changes" : "No unsaved changes"
    } | Please press S to save your changes.`;
  }, [saveFailure, postSaveAck, hasUnsavedChanges]);

  const persistDraft = useCallback(async () => {
    setIsSaving(true);
    setSaveFailure(null);
    try {
      await writeEditableConfig(draft);
      setSavedBaseline(cloneConfig(draft));
      setPostSaveAck({
        path: props.configPath,
        hadValidationWarning: validationMessage != null,
      });
    } catch (error) {
      setSaveFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }, [draft, props.configPath, validationMessage]);

  const fields = useMemo(
    () =>
      buildTabFields({
        tab,
        draft,
        setDraft,
        authState,
        startAuth,
        stopAuth,
        logout,
      }),
    [tab, draft, authState, startAuth, stopAuth, logout],
  );

  const qrReplacesFieldList = useMemo(
    () =>
      tab === "WhatsApp" &&
      authState.status === "qr_ready" &&
      Boolean(authState.qrAscii),
    [tab, authState.status, authState.qrAscii],
  );

  useEffect(() => {
    const prevTab = prevTabRef.current;
    prevTabRef.current = tab;

    if (prevTab !== tab) {
      setSelectedIndex(firstNavigableIndex(fields));
      setEditingFieldId(undefined);
      return;
    }

    setSelectedIndex((current) => clampNavigableIndex(fields, current));
  }, [tab, fields]);

  useEffect(() => {
    return () => {
      void authHandleRef.current?.stop();
      authHandleRef.current = null;
    };
  }, []);

  useInput((input, key) => {
    if (editingFieldId) {
      if (key.escape) {
        setEditingFieldId(undefined);
      }
      return;
    }

    if (qrReplacesFieldList) {
      if (input === "d" || input === "D") {
        void stopAuth();
        return;
      }
      if (key.upArrow || key.downArrow || key.return || input === " ") {
        return;
      }
    }

    if (key.leftArrow || (key.tab && key.shift)) {
      setTab(
        (current) =>
          TAB_ORDER[
            (TAB_ORDER.indexOf(current) - 1 + TAB_ORDER.length) %
              TAB_ORDER.length
          ]!,
      );
      return;
    }
    if (key.rightArrow || key.tab) {
      setTab(
        (current) =>
          TAB_ORDER[(TAB_ORDER.indexOf(current) + 1) % TAB_ORDER.length]!,
      );
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((current) => prevNavigableIndex(fields, current));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((current) => nextNavigableIndex(fields, current));
      return;
    }
    if (input === "q" || (key.ctrl && input === "c")) {
      void exitApp(exit, authHandleRef.current);
      return;
    }
    if (input === "s") {
      void persistDraft();
      return;
    }

    if (key.return) {
      const current = fields[selectedIndex];
      if (!current) {
        return;
      }
      if (current.kind === "boolean" && current.toggle) {
        current.toggle();
        return;
      }
      if (current.kind === "action" && current.activate) {
        void current.activate();
        return;
      }
      if (
        (current.kind === "text" ||
          current.kind === "secret" ||
          current.kind === "number" ||
          current.kind === "allowlist") &&
        current.commit
      ) {
        setEditingFieldId(current.id);
        setEditValue(String(current.value ?? ""));
      }
    }
    if (input === " " && fields[selectedIndex]?.kind === "boolean") {
      fields[selectedIndex]?.toggle?.();
    }
  });

  const editingField = editingFieldId
    ? fields.find((field) => field.id === editingFieldId)
    : undefined;

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Hoomanity</Text>
      <TabBar activeTab={tab} />
      {qrReplacesFieldList ? (
        <QrPanel tab={tab} authState={authState} />
      ) : (
        <FieldList fields={fields} selectedIndex={selectedIndex} />
      )}
      <EditorPrompt
        field={editingField}
        value={editValue}
        onChange={setEditValue}
        onSubmit={(value) => {
          editingField?.commit?.(value);
          setEditingFieldId(undefined);
        }}
      />
      <Footer
        isSaving={isSaving}
        saveStatus={saveStatusLine}
        validationMessage={validationMessage}
      />
    </Box>
  );
}

async function exitApp(
  exit: () => void,
  handle: WhatsAppAuthHandle | null,
): Promise<void> {
  if (handle) {
    await handle.stop();
  }
  exit();
}

function cloneConfig(config: AppConfig): AppConfig {
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

function configFingerprint(config: AppConfig): string {
  return JSON.stringify(config);
}

function isFieldNavigable(field: FieldItem): boolean {
  return field.kind !== "readonly";
}

function firstNavigableIndex(fields: FieldItem[]): number {
  const idx = fields.findIndex(isFieldNavigable);
  return idx === -1 ? 0 : idx;
}

function clampNavigableIndex(fields: FieldItem[], index: number): number {
  if (fields.length === 0) {
    return 0;
  }
  if (isFieldNavigable(fields[index]!)) {
    return index;
  }
  return firstNavigableIndex(fields);
}

function prevNavigableIndex(fields: FieldItem[], index: number): number {
  for (let i = index - 1; i >= 0; i -= 1) {
    const field = fields[i];
    if (field && isFieldNavigable(field)) {
      return i;
    }
  }
  return index;
}

function nextNavigableIndex(fields: FieldItem[], index: number): number {
  for (let i = index + 1; i < fields.length; i += 1) {
    const field = fields[i];
    if (field && isFieldNavigable(field)) {
      return i;
    }
  }
  return index;
}
