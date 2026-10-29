import type {
  Playground3AgentDefinition,
  Playground3AgentProfile,
} from "@startdownnotez404/playground3-stage-sdk";
import { ADD_NOTE_TOOL } from "../contract/manifest";
import { appMainPrompts } from "./prompts";

export const appAgentDefinitions: Record<string, Playground3AgentDefinition> = {
  assistant: {
    id: "assistant",
    name: "Assistant",
    description:
      appMainPrompts.agents?.assistant?.description ?? "Answers and adds notes.",
    agentPersona: appMainPrompts.agents?.assistant?.agentPersona ?? "",
    performerId: "fast",
    capabilities: {
      tools: [ADD_NOTE_TOOL],
      askHuman: true,
    },
  },
};

export const appAgentProfiles: Record<string, Playground3AgentProfile> = {
  assistant: { name: "Assistant", icon: "📝", roleLabel: "Assistant" },
};
