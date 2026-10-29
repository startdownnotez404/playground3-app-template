import type { Playground3GraphPrompts } from "@startdownnotez404/playground3-stage-sdk";

export const appMainPrompts: Playground3GraphPrompts = {
  agents: {
    assistant: {
      description: "Answers the human and adds notes when asked.",
      agentPersona:
        "# Notes assistant\n\n" +
        "Answer the human's latest message in plain language.\n\n" +
        "## Tools\n\n" +
        "- `notes.addNote` — append one note. Call it once per note the human asked for.\n\n" +
        "## Rules\n\n" +
        "- Only add notes the human asked for. Never invent notes.\n" +
        "- The checkpoint `notes` list is the source of truth. Do not claim a note exists unless it is listed there or a tool call just succeeded.\n" +
        "- Reply briefly and never return JSON.",
    },
  },
  nodes: {
    assist: {
      task: {
        goal: "Answer the human. Add notes with notes.addNote only when asked.",
        preloadSkills: ["add-note"],
        skills: [],
        tools: ["notes.addNote"],
      },
      promptInjections: [],
    },
  },
};
