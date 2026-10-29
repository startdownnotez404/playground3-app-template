import type { EmbeddedPlayground3McpContent } from "@startdownnotez404/playground3-stage-sdk";
import appRules from "../agent/RULE.md?raw";

/**
 * RULE.md + every src/agent/skills/<id>/SKILL.md, embedded at build time so
 * the single-file HTML carries them. Skill ids are the folder names and must
 * match `skills[].id` in the MCP manifest.
 */
const skillFiles = import.meta.glob("../agent/skills/*/SKILL.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const skills = Object.fromEntries(
  Object.entries(skillFiles).map(([filePath, markdown]) => [
    filePath.split("/").at(-2) ?? filePath,
    markdown,
  ])
);

export const APP_EMBEDDED_MCP: EmbeddedPlayground3McpContent = {
  appRules,
  skills,
};
