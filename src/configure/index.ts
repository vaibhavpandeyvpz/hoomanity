import { render } from "ink";
import { createElement } from "react";
import { ConfigureApp } from "./app";
import { loadEditableConfig } from "../config";

export async function runConfigureUi(): Promise<void> {
  const { config, configPath } = loadEditableConfig();
  const app = render(
    createElement(ConfigureApp, { initialConfig: config, configPath }),
  );
  await app.waitUntilExit();
}
