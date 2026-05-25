// src/ink/panels/Env/views/images/images.pull.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Pull Image overlay.
// Mirrors: Portainer imageController.js pullImage()
//
// POST /images/create?fromImage={image}&tag={tag}
// Streams Docker's newline-delimited JSON progress events.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import { pullImage }  from "../../../../agent-client.ts";
import { Divider }    from "../../../../components/Divider.tsx";
import { KeyHints }   from "../../../../components/KeyHint.tsx";
import { Spinner }    from "../../../../components/Spinner.tsx";
import { TextInput }  from "../../../../components/TextInput.tsx";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";

interface PullImageViewProps {
  env:    UnaxisEnvironment;
  onDone: (pulled: boolean) => void;
}

type Field = "image" | "tag" | "confirm" | "pulling" | "done";

export function PullImageView({ env, onDone }: PullImageViewProps) {
  const [field,   setField]   = useState<Field>("image");
  const [image,   setImage]   = useState("");
  const [tag,     setTag]     = useState("latest");
  const [lines,   setLines]   = useState<string[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const busy = field === "pulling";

  useInput((input, key) => {
    if (busy) return;

    if (field === "done") {
      onDone(success);
      return;
    }

    if (key.escape || (input === "q" && field !== "image" && field !== "tag")) {
      onDone(false);
      return;
    }

    if (field === "tag") {
      if (key.upArrow) { setField("image"); return; }
    }

    if (field === "confirm") {
      if (key.return || input === "y") { void startPull(); return; }
      if (input === "n" || key.escape) { onDone(false); return; }
      if (key.upArrow)                 { setField("tag"); return; }
    }
  });

  async function startPull() {
    setField("pulling");
    setLines([]);
    setError(null);

    const imgPart = image.trim();
    const tagPart = tag.trim() || "latest";

    const ok = await pullImage(env, imgPart, tagPart, (line) => {
      setLines((prev) => {
        // Keep last 20 lines for display
        const next = [...prev, line];
        return next.length > 20 ? next.slice(-20) : next;
      });
    });

    if (ok) {
      setSuccess(true);
      setLines((prev) => [...prev, `✓ Pull complete: ${imgPart}:${tagPart}`]);
    } else {
      setError(`Failed to pull ${imgPart}:${tagPart}`);
    }
    setField("done");
  }

  const fullImage = `${image || "<image>"}:${tag || "latest"}`;

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">Pull Image</Text>
        <Text dimColor>{env.name}</Text>
      </Box>
      <Divider />

      <Box flexDirection="column" gap={1} paddingX={2} marginTop={1}>

        {/* Image name */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Image</Text></Box>
          {field === "image" ? (
            <TextInput
              width={48}
              placeholder="nginx  or  ghcr.io/foo/bar"
              onSubmit={(v) => { setImage(v); setField("tag"); }}
              onCancel={() => onDone(false)}
            />
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1} width={48}>
              <Text color="white">{image || <Text dimColor>—</Text>}</Text>
            </Box>
          )}
        </Box>

        {/* Tag */}
        <Box gap={2} alignItems="center">
          <Box width={14}><Text dimColor>Tag</Text></Box>
          {field === "tag" ? (
            <TextInput
              width={24}
              placeholder="latest"
              onSubmit={(v) => { setTag(v || "latest"); setField("confirm"); }}
              onCancel={() => setField("image")}
            />
          ) : (
            <Box borderStyle="single" borderColor="gray" paddingX={1} width={24}>
              <Text color="white">{tag || "latest"}</Text>
            </Box>
          )}
        </Box>

        {/* Confirm */}
        {field === "confirm" && (
          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={2}
            paddingY={1}
            marginTop={1}
          >
            <Text bold color="cyan">Ready to pull</Text>
            <Text dimColor>image: <Text color="white">{fullImage}</Text></Text>
            <Box marginTop={1}>
              <Text color="green">Press Enter or [y] to pull  ·  [n] to cancel</Text>
            </Box>
          </Box>
        )}

        {/* Progress stream */}
        {(field === "pulling" || field === "done") && (
          <Box flexDirection="column" marginTop={1} gap={0}>
            {field === "pulling" && <Spinner message={`Pulling ${fullImage}…`} />}
            {lines.map((line, i) => (
              <Text key={i} dimColor wrap="truncate">{line}</Text>
            ))}
            {error && <Text color="red">{error}</Text>}
            {field === "done" && !error && (
              <Box marginTop={1}>
                <Text color="green">Done.  Press any key to continue.</Text>
              </Box>
            )}
            {field === "done" && error && (
              <Box marginTop={1}>
                <Text dimColor>Press any key to go back.</Text>
              </Box>
            )}
          </Box>
        )}
      </Box>

      {!busy && (
        <KeyHints hints={[
          { k: "Enter", label: field === "confirm" ? "pull" : "next" },
          { k: "esc",   label: "cancel" },
        ]} />
      )}
    </Box>
  );
}
