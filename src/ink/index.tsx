// src/ink/index.tsx — TUI Shell (Debug mode: No AlternateScreen)
import React, { useState, useCallback } from "react";
import { useInput, useApp, render, Box, Text } from "ink";

import { useZones } from "./zone-store.js";
import { buildAll, deployAll, gitPush } from "./zone-build.js";
import { backupDatabase } from "./db-api.js";

import { WelcomeScreen } from "../screens/WelcomeScreen.js";
import { SettingsScreen } from "../screens/SettingsScreen.js";
import { ZoneWizardScreen } from "../screens/ZoneWizardScreen.js";
import { NpmPanel } from "./panels/Npm/index.js";
import { DbPanel } from "./panels/Db/index.js";
import { InfraPanel } from "./panels/Infra/index.js";

import { BackgroundStackProvider, useBackgroundStack } from "./components/DetachedStack.js";
import { NotificationsProvider, useNotifications } from "./components/Notifications.js";
import { useCopyOnSelect } from "./hooks/useCopyOnSelect.js";
import { useWidths } from "./hooks/useTermWidth.js";
import { npmEnableHost, npmDisableHost } from "./npm/index.ts";
import { TerminalSizeProvider } from "./components/TerminalSizeContext.js";
import { ThemeProvider } from "./components/design-system/ThemeProvider.js";
import { TerminalWriteProvider } from "./useTerminalNotification.js";

import { AppShell } from "./AppShell.js";
import { AlternateScreen } from "./components/AlternateScreen.js";
import { useAppRouter } from "./hooks/useAppRouter.js";
import { useTuiActions } from "./hooks/useTuiActions.js";
import { ZonesView } from "./views/ZonesView.js";

export function TuiMain() {
    const { exit } = useApp();
    const { copy } = useCopyOnSelect();
    const { addNotification } = useNotifications();

    const {
        zones, statuses: zoneStatuses, proxyStatus,
        reload: reloadZones, refreshStatuses,
    } = useZones();

    const {
        view, setView, setViewHistory,
        navigateTo, navigateBack, cyclePanels
    } = useAppRouter();

    const [welcomeMenu, setWelcomeMenu] = useState(0);

    const {
        anyBusy, _startOp, openLogs, runOp: rawRunOp, setBgOps
    } = useBackgroundStack();

    const { runOp, runCreateZone, executeAction } = useTuiActions(
        rawRunOp, _startOp, openLogs, refreshStatuses,
        addNotification, reloadZones, setBgOps, zones
    );

    const [npmSelected, setNpmSelected] = useState(0);
    const [tokenEditing, setTokenEditing] = useState(false);

    const handleNpmToggle = useCallback(async (host: any) => {
        try {
            if (host.enabled) await npmDisableHost(host.id);
            else await npmEnableHost(host.id);
        } catch { }
    }, []);

    useInput((input, key) => {
        if (view === "wizard" || view === "zones") return;

        if (view === "welcome") {
            if (input === "q") { exit(); return; }
            if (key.upArrow || input === "k") { setWelcomeMenu((s) => Math.max(0, s - 1)); return; }
            if (key.downArrow || input === "j") { setWelcomeMenu((s) => Math.min(1, s + 1)); return; }
            if (key.return || key.rightArrow) {
                if (welcomeMenu === 0) navigateTo("zones");
                else navigateTo("settings");
                return;
            }
            if (input === "s") { navigateTo("settings"); return; }
            return;
        }

        if (view === "settings") {
            if (key.escape || input === "q") { navigateBack(); return; }
            return;
        }

        if (input === "q") { navigateBack(); return; }
        if (key.tab) {
            cyclePanels();
            return;
        }

        if (view === "npm") {
            if (key.upArrow || input === "k") { setNpmSelected((s) => Math.max(0, s - 1)); return; }
            if (key.downArrow || input === "j") { setNpmSelected((s) => s + 1); return; }
        }
    }, { isActive: !tokenEditing });

    const { tw, th } = useWidths();

    if (view === "wizard") {
        return (
            <ZoneWizardScreen
                onDone={(derived) => {
                    setView("zones");
                    setViewHistory((h) => [...h, "welcome"]);
                    runCreateZone(derived);
                }}
                onCancel={() => navigateBack()}
            />
        );
    }

    return (
        <AppShell view={view} tw={tw} th={th}>
            {/* DEBUG: Absolute visible marker */}
            <Box position="absolute" top={0} left={0}>
                <Text color="red" bold>CORE ENGINE ACTIVE: {view} ({tw}x{th})</Text>
            </Box>

            {view === "welcome" && (
                <WelcomeScreen
                    zones={zones}
                    zoneStatuses={zoneStatuses}
                    proxyStatus={proxyStatus}
                    selected={welcomeMenu}
                    busy={anyBusy}
                />
            )}

            {view === "settings" && (
                <SettingsScreen
                    zones={zones}
                    onTokenEditStart={() => setTokenEditing(true)}
                    onTokenEditEnd={() => setTokenEditing(false)}
                />
            )}

            {view === "zones" && (
                <ZonesView
                    zones={zones}
                    zoneStatuses={zoneStatuses as any}
                    proxyStatus={proxyStatus}
                    executeAction={executeAction}
                    openLogs={openLogs}
                    navigateTo={navigateTo}
                    runOp={runOp}
                />
            )}

            {view === "npm" && (
                <NpmPanel
                    selected={npmSelected}
                    onSelect={setNpmSelected}
                    onToggle={handleNpmToggle}
                    onCopy={copy}
                />
            )}

            {view === "db" && (
                <DbPanel
                    onLogs={(svc) => openLogs(svc, svc)}
                    onBackup={() => runOp("DB backup", (o) => backupDatabase(o))}
                    onCopy={copy}
                />
            )}

            {view === "infra" && (
                <InfraPanel isActive={view === "infra"} />
            )}
        </AppShell>
    );
}

process.stdout.write("\x1b[2J\x1b[H");

render(
    <TerminalWriteProvider value={process.stdout.write.bind(process.stdout)}>
        <TerminalSizeProvider>
            <ThemeProvider initialState="dark">
                <NotificationsProvider>
                    <BackgroundStackProvider>
                        <AlternateScreen>
                            <TuiMain />
                        </AlternateScreen>
                    </BackgroundStackProvider>
                </NotificationsProvider>
            </ThemeProvider>
        </TerminalSizeProvider>
    </TerminalWriteProvider>,
    {
        patchConsole: false,
        exitOnCtrlC: false,
    }
);