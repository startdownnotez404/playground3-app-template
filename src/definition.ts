import { lazy } from "react";
import {
  createPlayground3StageTurnRunner,
  type Playground3Definition,
} from "@startdownnotez404/playground3-stage-sdk";
import appConfig from "../app.config.json";
import mainTopology from "./agent/orchestration/main.topology.json";
import { buildAppMainGraphJson } from "./agent/orchestration/graph";
import { appMainPrompts } from "./agent/orchestration/prompts";
import {
  appAgentDefinitions,
  appAgentProfiles,
} from "./agent/orchestration/agentDefinitions";
import { APP_PLAYGROUND3_ID, buildAppMcpManifest } from "./agent/contract/manifest";
import { appCheckpoint, buildAppCheckpointPromptView } from "./runtime/checkpoint";
import { executeAppTool } from "./runtime/tools";
import type { AppState } from "./runtime/types";

// Lazy so tooling can import the definition without pulling the UI bundle.
const AppShell = lazy(() => import("./ui/Shell"));

export const appDefinition: Playground3Definition<AppState> = {
  id: APP_PLAYGROUND3_ID,
  title: appConfig.title,
  assistantSpeaker: { name: "Assistant", icon: "📝" },
  contract: {
    buildManifest: buildAppMcpManifest,
  },
  orchestration: {
    defaultGraphKey: "main",
    agentDefinitions: appAgentDefinitions,
    agentProfiles: appAgentProfiles,
    graphs: {
      main: {
        topologyJson: JSON.stringify(mainTopology),
        prompts: appMainPrompts,
        buildGraphJson: buildAppMainGraphJson,
        entry: {
          label: "Ask",
          firstNodeId: "assist",
          textInput: true,
          mediaInput: [],
          modeType: "agent",
        },
      },
    },
  },
  runtime: {
    checkpoint: appCheckpoint,
    executeTool: executeAppTool,
    // Graph-driven: the topology decides node prompts, so no per-node plans.
    buildInference: () => [],
    runTurn: createPlayground3StageTurnRunner<AppState>({
      playgroundId: APP_PLAYGROUND3_ID,
      buildCheckpointState: buildAppCheckpointPromptView,
      buildFrontendStateJson: (state) => appCheckpoint.serialize(state),
    }),
    buildCheckpointState: buildAppCheckpointPromptView,
  },
  ui: AppShell,
};
