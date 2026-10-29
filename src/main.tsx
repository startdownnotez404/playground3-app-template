import { mountPlayground3StageApp } from "@startdownnotez404/playground3-stage-sdk";
import { ThemeProvider } from "@startdownnotez404/ui/theme";
import { appDefinition } from "./definition";
import { APP_EMBEDDED_MCP } from "./stage/embeddedContent";

const STAGE_ROOT_STYLE = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
} as const;

const hashAppearance = new URLSearchParams(window.location.hash.slice(1)).get(
  "appearance"
);
const defaultMode =
  hashAppearance === "dark" || hashAppearance === "light"
    ? hashAppearance
    : "system";

mountPlayground3StageApp({
  definition: appDefinition,
  embeddedMcp: APP_EMBEDDED_MCP,
  standalonePlaygroundId: appDefinition.id,
  hostUiTheme: false,
  wrap: (stage) => (
    <ThemeProvider defaultMode={defaultMode} storageManager={null}>
      <div data-app-stage-root style={STAGE_ROOT_STYLE}>
        {stage}
      </div>
    </ThemeProvider>
  ),
});
