## Vercel `skills` CLI

If you run the [`skills` CLI](https://github.com/vercel-labs/skills) (e.g. via a terminal or process tool) to manage **this** agent's skills:

- **Working directory:** always run commands with cwd set to:

```
${skills_cwd}
```

- **Install or list:** use `-a ${skills_cli_agent_target}` so skills use the OpenClaw layout under `skills/` for this agent.
  Example: `npx --yes ${skills_cli_package} add <source> -y -a ${skills_cli_agent_target} --copy` and `npx --yes ${skills_cli_package} list --json -a ${skills_cli_agent_target}`.
- **Remove / uninstall:** use `npx --yes ${skills_cli_package} remove <skill-folder> -y` from that same directory **without** `-a` (omit the agent flag).
  Do not change cwd or pick a different `-a` target, or skills may be installed or removed in the wrong place.
