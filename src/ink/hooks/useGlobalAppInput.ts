import { useInput } from "../runtimeInk.js";
import { openConfigInEditor } from "../../screens/SettingsScreen.js";
import { gracefulShutdownSync } from "../../utils/gracefulShutdown.js";
import { PANEL_TABS, type PanelTab } from "./useAppRouter.ts";

type UseGlobalAppInputParams = {
  view: string;
  tokenEditing: boolean;
  splashDone: boolean;
  hasBackgroundOps: boolean;
  goBack: () => void;
  navigateReplace: (view: PanelTab) => void;
  toggleStackFocus: () => void;
  toggleStackManager: () => void;
};

export function useGlobalAppInput({
  view,
  tokenEditing,
  splashDone,
  hasBackgroundOps,
  goBack,
  navigateReplace,
  toggleStackFocus,
  toggleStackManager,
}: UseGlobalAppInputParams) {
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      gracefulShutdownSync(0);
      return;
    }

    if (input === "q" && view === "welcome") {
      gracefulShutdownSync(0);
      return;
    }

    if (input === "o" && hasBackgroundOps) {
      toggleStackFocus();
      return;
    }

    if (input === "O" && hasBackgroundOps) {
      toggleStackManager();
      return;
    }

    if (view === "wizard") return;

    if (view === "settings") {
      if (key.escape || input === "q") {
        goBack();
        return;
      }
      if (input === "e") {
        openConfigInEditor();
        return;
      }
      return;
    }

    if (key.tab && (PANEL_TABS as readonly string[]).includes(view)) {
      const idx = PANEL_TABS.indexOf(view as PanelTab);
      navigateReplace(PANEL_TABS[(idx + 1) % PANEL_TABS.length]);
    }
  }, { isActive: !tokenEditing && splashDone });
}
