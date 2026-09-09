/** @jsxRuntime classic */
import React, { useCallback, useState } from "../reactRuntime.js";
import { Box, Text, useInput } from "../runtimeInk.js";
import type { Zone } from "../../config/zones.js";
import { applyStripeLaneMode } from "../stripe-lane-apply.js";
import {
  readStripeLaneSnapshot,
  type StripeLaneSnapshot,
  type StripeLaneTarget,
  type StripeMode,
} from "../stripe-lanes.js";
import { SectionFrame } from "./design-system/SectionFrame.jsx";

const TARGETS: StripeLaneTarget[] = ["all", "shop", "labs", "pos", "tank"];

type RunOp = (
  title: string,
  run: (onLine: (line: string) => void) => Promise<number> | number,
  priority?: any,
) => void;

export function StripePaymentsSettings({
  zones,
  runOp,
  active,
}: {
  zones: Zone[];
  runOp: RunOp;
  active: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [snapshot, setSnapshot] = useState<StripeLaneSnapshot>(() => readStripeLaneSnapshot());
  const [pendingLive, setPendingLive] = useState<StripeLaneTarget | null>(null);

  const refresh = useCallback(() => setSnapshot(readStripeLaneSnapshot()), []);

  const queueChange = useCallback((target: StripeLaneTarget, mode: StripeMode, confirmLive = false) => {
    runOp(`Stripe ${target} → ${mode}`, async (onLine) => {
      const code = await applyStripeLaneMode({ target, mode, confirmLive, zones, onLine });
      refresh();
      return code;
    }, "now");
  }, [refresh, runOp, zones]);

  useInput((input, key) => {
    if (!active) return;
    if (pendingLive) {
      if (input.toLowerCase() === "y" || key.return) {
        const target = pendingLive;
        setPendingLive(null);
        queueChange(target, "live", true);
      } else if (input.toLowerCase() === "n" || key.escape) {
        setPendingLive(null);
      }
      return;
    }

    if (key.upArrow) setSelected((value) => Math.max(0, value - 1));
    if (key.downArrow) setSelected((value) => Math.min(TARGETS.length - 1, value + 1));
    if (input.toLowerCase() === "r") refresh();
    if (input.toLowerCase() === "t") queueChange(TARGETS[selected], "test");
    if (input.toLowerCase() === "l") setPendingLive(TARGETS[selected]);
  });

  return (
    <Box flexDirection="column" flexShrink={0}>
      <SectionFrame title="Stripe Payment Lanes" tone="suggestion">
        <Text dimColor>Credentials stay masked. Changes recreate only affected services and roll back on failure.</Text>
        <Box flexDirection="column" marginTop={1} flexShrink={0}>
          {TARGETS.map((target, index) => {
            if (target === "all") {
              const modes = new Set(snapshot.statuses.map((status) => status.mode));
              return (
                <Box key={target} gap={2} flexShrink={0}>
                  <Text color={selected === index ? "cyan" : "gray"}>{selected === index ? "›" : " "}</Text>
                  <Text bold={selected === index}>{"all".padEnd(7)}</Text>
                  <Text color={modes.size === 1 && modes.has("live") ? "yellow" : modes.size === 1 ? "green" : "magenta"}>
                    {modes.size === 1 ? [...modes][0] : "mixed"}
                  </Text>
                  <Text dimColor>sequential apply</Text>
                </Box>
              );
            }
            const status = snapshot.statuses.find((candidate) => candidate.lane === target)!;
            const ready = status.serverKey === status.mode && status.publicKey === status.mode;
            return (
              <Box key={target} gap={2} flexShrink={0}>
                <Text color={selected === index ? "cyan" : "gray"}>{selected === index ? "›" : " "}</Text>
                <Text bold={selected === index}>{target.padEnd(7)}</Text>
                <Text color={status.mode === "live" ? "yellow" : "green"}>{status.mode.padEnd(5)}</Text>
                <Text color={ready ? "green" : "red"}>{ready ? "keys ready" : "keys missing/invalid"}</Text>
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1} gap={3}>
          <Text color={snapshot.testWebhookReady ? "green" : "red"}>test webhook: {snapshot.testWebhookReady ? "ready" : "missing"}</Text>
          <Text color={snapshot.liveWebhookReady ? "green" : "red"}>live webhook: {snapshot.liveWebhookReady ? "ready" : "missing"}</Text>
        </Box>
      </SectionFrame>

      {pendingLive && (
        <Box flexDirection="column" flexShrink={0}>
          <Text color="yellow" bold>⚠ Switch {pendingLive} to LIVE and recreate affected services?</Text>
          <Text dimColor>y/Enter confirm · n/Esc cancel · readiness gates still apply</Text>
        </Box>
      )}
    </Box>
  );
}
