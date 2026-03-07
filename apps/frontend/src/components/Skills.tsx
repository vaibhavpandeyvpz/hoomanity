import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Loader2, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDialog } from "./Dialog";
import { Button } from "./Button";
import { Input } from "./Input";
import { Modal } from "./Modal";
import {
  getSkillsList,
  getSkillContent,
  addSkillsPackage,
  removeSkillsPackage,
  updateSkillEnabled,
  uploadSkill,
} from "../api";
import type { SkillEntry } from "../api";
import { Switch } from "./Switch";

export interface SkillsHandle {
  startAdd: () => void;
}

export const Skills = forwardRef<SkillsHandle>(function Skills(_props, ref) {
  const dialog = useDialog();
  const [skillsList, setSkillsList] = useState<SkillEntry[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsAddOpen, setSkillsAddOpen] = useState(false);
  const [skillsAddSubmitting, setSkillsAddSubmitting] = useState(false);
  const [skillView, setSkillView] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [skillViewLoading, setSkillViewLoading] = useState(false);
  const [addPackage, setAddPackage] = useState("");
  const [addSkillsRaw, setAddSkillsRaw] = useState("");
  const [addTab, setAddTab] = useState<"install" | "upload">("install");
  const [addUploadFile, setAddUploadFile] = useState<File | null>(null);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  function startAdd() {
    setSkillsError(null);
    setAddPackage("");
    setAddSkillsRaw("");
    setAddTab("install");
    setAddUploadFile(null);
    setSkillsAddOpen(true);
  }

  useImperativeHandle(ref, () => ({ startAdd }));

  async function loadSkills() {
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const res = await getSkillsList();
      setSkillsList(res.skills ?? []);
    } catch (e) {
      setSkillsError((e as Error).message);
    } finally {
      setSkillsLoading(false);
    }
  }

  useEffect(() => {
    loadSkills();
  }, []);

  return (
    <>
      <Modal
        open={skillsAddOpen}
        onClose={() => setSkillsAddOpen(false)}
        title="Add skill"
        maxWidth="2xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="success"
                disabled={skillsAddSubmitting}
                icon={
                  skillsAddSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : undefined
                }
                onClick={async () => {
                  if (addTab === "install") {
                    if (!addPackage.trim()) {
                      setSkillsError("Package name or URL is required.");
                      return;
                    }
                    setSkillsError(null);
                    setSkillsAddSubmitting(true);
                    try {
                      const skills = addSkillsRaw
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                      await addSkillsPackage({
                        package: addPackage.trim(),
                        skills: skills.length > 0 ? skills : undefined,
                      });
                      setSkillsAddOpen(false);
                      loadSkills();
                    } catch (e) {
                      setSkillsError((e as Error).message);
                    } finally {
                      setSkillsAddSubmitting(false);
                    }
                  } else {
                    if (!addUploadFile) {
                      setSkillsError("Please select a .md file.");
                      return;
                    }
                    setSkillsError(null);
                    setSkillsAddSubmitting(true);
                    try {
                      const content = await addUploadFile.text();
                      await uploadSkill({ content });
                      setSkillsAddOpen(false);
                      loadSkills();
                    } catch (e) {
                      setSkillsError((e as Error).message);
                    } finally {
                      setSkillsAddSubmitting(false);
                    }
                  }
                }}
              >
                {skillsAddSubmitting ? "Adding…" : "Add"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setSkillsAddOpen(false)}
                disabled={skillsAddSubmitting}
              >
                Cancel
              </Button>
            </div>
            {addTab === "install" && (
              <a
                href="https://smithery.ai/skills"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-hooman-border bg-hooman-surface px-3 py-2 text-sm text-[#FF5601] hover:bg-[#FF5601]/10 hover:text-[#FF5601] focus:outline-none focus:ring-2 focus:ring-[#FF5601]/50 focus:ring-offset-2 focus:ring-offset-hooman-bg"
              >
                <img
                  src="/smithery-logo.svg"
                  alt=""
                  className="h-4 w-auto"
                  width={34}
                  height={40}
                />
                Find on Smithery
              </a>
            )}
          </div>
        }
      >
        {skillsError && (
          <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 text-sm">
            {skillsError}
          </div>
        )}
        <div className="flex gap-1 border-b border-hooman-border -mb-px mb-4">
          {(
            [
              { id: "install" as const, label: "Install" },
              { id: "upload" as const, label: "Upload" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setAddTab(tab.id);
                setSkillsError(null);
              }}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                addTab === tab.id
                  ? "border-hooman-accent text-white bg-hooman-surface"
                  : "border-transparent text-hooman-muted hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {addTab === "install" && (
          <div className="space-y-3">
            <Input
              label="Package name or URL"
              placeholder="e.g. vercel-labs/agent-skills or https://github.com/owner/repo"
              value={addPackage}
              onChange={(e) => setAddPackage(e.target.value)}
            />
            <Input
              label="Skills (optional, comma-separated)"
              placeholder="e.g. frontend-design, skill-creator"
              value={addSkillsRaw}
              onChange={(e) => setAddSkillsRaw(e.target.value)}
            />
          </div>
        )}
        {addTab === "upload" && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                SKILL.md file
              </label>
              <input
                type="file"
                accept=".md"
                className="block w-full text-sm text-hooman-muted file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-hooman-surface file:text-white hover:file:bg-hooman-border"
                onChange={(e) => setAddUploadFile(e.target.files?.[0] ?? null)}
              />
              {addUploadFile && (
                <p className="text-xs text-hooman-muted mt-1">
                  {addUploadFile.name}
                </p>
              )}
            </div>
            <p className="text-xs text-hooman-muted">
              The skill is installed under the folder name from the{" "}
              <code className="text-hooman-accent">name</code> field in the
              file&apos;s frontmatter (e.g.{" "}
              <code className="text-hooman-accent">name: aws-agentic-ai</code> →
              .agents/skills/aws-agentic-ai/SKILL.md).
            </p>
          </div>
        )}
      </Modal>
      <Modal
        open={skillView !== null}
        onClose={() => setSkillView(null)}
        title={skillView ? `SKILL.md — ${skillView.name}` : "Skill"}
        maxWidth="2xl"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setSkillView(null)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="rounded-lg border border-hooman-border bg-hooman-bg p-4">
          {skillView && (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {skillView.content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </Modal>

      <div className="space-y-4">
        {skillsError && !skillsAddOpen && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 text-sm">
            {skillsError}
          </div>
        )}
        {skillsLoading ? (
          <p className="text-hooman-muted text-sm">Loading…</p>
        ) : skillsList.length === 0 ? (
          <p className="text-hooman-muted text-sm">
            No skills installed. Add one to install.
          </p>
        ) : (
          <ul className="space-y-3">
            {skillsList.map((skill) => (
              <li
                key={skill.id}
                className="rounded-xl border border-hooman-border bg-hooman-surface p-4 flex items-start justify-between"
              >
                <div className="min-w-0">
                  <span className="font-medium text-white">{skill.name}</span>
                  {skill.description && (
                    <p className="text-xs text-hooman-muted mt-0.5 line-clamp-2">
                      {skill.description}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0 items-center flex-wrap">
                  <Switch
                    id={`skill-enabled-${skill.id}`}
                    label="Enabled"
                    checked={skill.enabled !== false}
                    onChange={async (checked) => {
                      setSkillsError(null);
                      try {
                        await updateSkillEnabled(skill.id, checked);
                        loadSkills();
                      } catch (e) {
                        setSkillsError((e as Error).message);
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FileText className="w-4 h-4" />}
                    onClick={async () => {
                      setSkillViewLoading(true);
                      setSkillsError(null);
                      try {
                        const { content } = await getSkillContent(skill.id);
                        setSkillView({ name: skill.name, content });
                      } catch (e) {
                        setSkillsError((e as Error).message);
                      } finally {
                        setSkillViewLoading(false);
                      }
                    }}
                    disabled={skillViewLoading}
                  >
                    View
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Remove skill",
                        message: `Remove skill "${skill.name}"?`,
                        confirmLabel: "Remove",
                        variant: "danger",
                      });
                      if (!ok) return;
                      setSkillsError(null);
                      try {
                        await removeSkillsPackage([skill.id]);
                        loadSkills();
                      } catch (e) {
                        setSkillsError((e as Error).message);
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
});
