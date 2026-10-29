import { buildGraphFromTopologyAndPrompts } from "@startdownnotez404/playground3-stage-sdk";
import mainTopology from "./main.topology.json";
import { appMainPrompts } from "./prompts";

export const buildAppMainGraphJson = (): string =>
  buildGraphFromTopologyAndPrompts(JSON.stringify(mainTopology), appMainPrompts);
