"""
unaxis_ipc.py — Claude's IPC helper for the UNAXIS TUI bridge.

Exit code conventions (from __UNAXIS_EXIT__:<code>:<label> sentinel):
  0  ok      — clean success
  1  error   — hard failure
  2  usage   — bad args (caller's fault)
  3  queued  — --bg op queued in TUI stack, not done yet
  4  review  — completed with warnings, inspect output
  5  unknown — uncaught exception, needs human check

Usage:
  from unaxis_ipc import ipc, ipc_multi, UNAXIS

  result = ipc(["db", "instances"])
  if result.ok:
      print(result.text)
  elif result.queued:
      print("running in background, check TUI stack")
  elif result.review:
      print("completed with warnings:", result.text)
  else:
      print("FAILED:", result.text)
"""

import socket
import json
import time
from dataclasses import dataclass, field
from typing import Optional

UNAXIS = {
    "host":  "192.168.50.204",
    "port":  50506,
    "token": "4f11bb222b454ec68f608d7bc4691f27ed5150548c0430986f27d476545e5bd4",
}

SENTINEL_PREFIX = "__UNAXIS_EXIT__:"


@dataclass
class IpcResult:
    argv:      list
    text:      str
    exit:      int      = 0
    label:     str      = "ok"
    timed_out: bool     = False

    @property
    def ok(self) -> bool:      return self.exit == 0
    @property
    def error(self) -> bool:   return self.exit == 1
    @property
    def usage(self) -> bool:   return self.exit == 2
    @property
    def queued(self) -> bool:  return self.exit == 3
    @property
    def review(self) -> bool:  return self.exit == 4
    @property
    def unknown(self) -> bool: return self.exit == 5 or self.timed_out

    def __str__(self) -> str:
        icon = {0:"✓", 1:"✗", 2:"?", 3:"⚡", 4:"⚠", 5:"??"}.get(self.exit, "??")
        return f"[{icon} {self.label}]  {self.text[:120]}{'…' if len(self.text)>120 else ''}"


def ipc(argv: list, timeout: int = 25, conn: Optional[dict] = None) -> IpcResult:
    """Run one IPC command. Returns IpcResult with exit code and full text."""
    c = conn or UNAXIS
    s = socket.socket()
    s.settimeout(8)
    try:
        s.connect((c["host"], c["port"]))
        s.sendall(f"AUTH {c['token']}\n".encode())
        auth = s.recv(64).decode().strip()
        if auth != "OK":
            return IpcResult(argv, f"Auth failed: {auth}", 5, "unknown")

        s.sendall((json.dumps({"argv": argv}) + "\n").encode())
        s.settimeout(timeout)

        raw_lines = []
        while True:
            try:
                chunk = s.recv(4096)
                if not chunk:
                    break
                raw_lines.append(chunk.decode())
                # Break as soon as we see the sentinel — TUI keeps connection open
                if "__UNAXIS_EXIT__" in raw_lines[-1]:
                    break
            except socket.timeout:
                # Timed out before sentinel arrived
                text = "".join(raw_lines).rstrip()
                return IpcResult(argv, text, 5, "unknown", timed_out=True)

        full = "".join(raw_lines)
    finally:
        s.close()

    # Parse sentinel from last line
    lines = full.split("\n")
    sentinel_line = ""
    for line in reversed(lines):
        if line.startswith(SENTINEL_PREFIX):
            sentinel_line = line
            break

    if not sentinel_line:
        return IpcResult(argv, full.rstrip(), 5, "unknown")

    # Strip sentinel from text
    text = full[:full.rfind(sentinel_line)].rstrip()

    parts = sentinel_line[len(SENTINEL_PREFIX):].split(":", 1)
    code  = int(parts[0]) if parts[0].isdigit() else 5
    label = parts[1] if len(parts) > 1 else "unknown"

    return IpcResult(argv, text, code, label)


def ipc_multi(commands: list[list], timeout: int = 25, conn: Optional[dict] = None) -> list[IpcResult]:
    """Run multiple IPC commands sequentially. Returns list of IpcResult."""
    return [ipc(argv, timeout=timeout, conn=conn) for argv in commands]


def ipc_check(result: IpcResult, label: str = "") -> None:
    """Print result with triage header. Use for quick inspection."""
    prefix = f"[{label}] " if label else ""
    icons  = {0:"✓", 1:"✗", 2:"?", 3:"⚡", 4:"⚠", 5:"??"}
    icon   = icons.get(result.exit, "??")
    print(f"\n{'─'*60}")
    print(f"{prefix}{icon} {result.label.upper()}  ← {' '.join(result.argv)}")
    if result.timed_out:
        print("  ⏱ TIMED OUT before sentinel received")
    print(result.text)


if __name__ == "__main__":
    import sys
    argv = json.loads(sys.argv[1]) if len(sys.argv) > 1 else ["session"]
    r = ipc(argv)
    ipc_check(r, " ".join(argv))
    print(f"\nExit: {r.exit} ({r.label})  ok={r.ok}")
