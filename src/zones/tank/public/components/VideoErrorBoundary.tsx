"use client";

import React from "react";

// Keeps a broken player from taking the site with it.
//
// Without a boundary, any throw inside a player unmounts the whole React tree
// above it — chat, the room list, everything — and the visitor is left on a
// blank page that never recovers. Video is the least reliable thing on the
// page and the least essential: it should be allowed to fail on its own.

type Props = {
  children: React.ReactNode;
  /** Shown in place of the player. Defaults to the NO SIGNAL-style panel. */
  fallback?: React.ReactNode;
  /** Lets a parent re-mount the subtree (e.g. when the camera changes). */
  resetKey?: string | number;
};

type State = { failed: boolean };

export class VideoErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidUpdate(prev: Props) {
    // A new camera deserves a fresh attempt; without this the panel would stay
    // stuck on the failure from a stream the viewer already navigated away from.
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  componentDidCatch(error: unknown) {
    // Report, but never rethrow: the point is that this stops here.
    console.warn("[VideoErrorBoundary] player crashed, isolating:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback) return <>{this.props.fallback}</>;

    return (
      <div className="grid h-full w-full place-items-center bg-black px-4 text-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">No signal</p>
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="mt-2 rounded border border-white/30 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white/80 transition hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}

export default VideoErrorBoundary;
