import autoBind from 'auto-bind';
import React, { type ReactNode } from 'react';
import { LegacyRoot } from 'react-reconciler/constants.js';
import onExit from 'signal-exit';
import * as dom from './dom.js';
import { FocusManager } from './focus.js';
import instances from './instances.js';
import Output from './output.js';
import reconciler from './reconciler.js';
import App from './components/App.js';
import renderNodeToOutput from './render-node-to-output.js';
import createRenderer, { type Renderer } from './renderer.js';
import { createScreen, StylePool, CharPool, HyperlinkPool } from './screen.js';
import { writeDiffToTerminal } from './terminal.js';
import { ERASE_SCREEN, CURSOR_HOME } from './termio/csi.js';
import { LogUpdate } from './log-update.js';
import { emptyFrame } from './frame.js';

export type Options = {
  stdout: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stderr: NodeJS.WriteStream;
  exitOnCtrlC: boolean;
  patchConsole: boolean;
};

export default class Ink {
  private readonly options: Options;
  private readonly stylePool = new StylePool();
  private readonly charPool = new CharPool();
  private readonly hyperlinkPool = new HyperlinkPool();
  private readonly rootNode: dom.DOMElement;
  private readonly renderer: Renderer;
  private readonly container: any;
  private readonly focusManager: FocusManager;
  private readonly logUpdate: LogUpdate;
  private terminalColumns: number;
  private terminalRows: number;
  private currentNode: ReactNode = null;
  private isUnmounted = false;
  private frontFrame: any = null;
  private isAltScreenActive = false;
  private hasRenderedFullFrame = false;

  constructor(options: Options) {
    autoBind(this);
    this.options = options;
    this.terminalColumns = options.stdout.columns || 80;
    this.terminalRows = options.stdout.rows || 24;

    this.logUpdate = new LogUpdate({
      isTTY: true, // Force to true to fix Windows PowerShell false negatives
      stylePool: this.stylePool,
    });

    this.rootNode = dom.createNode('ink-root');
    this.focusManager = new FocusManager(() => true);
    this.rootNode.focusManager = this.focusManager;
    
    this.container = reconciler.createContainer(this.rootNode, LegacyRoot, null, false, null, 'id', () => {});
    this.renderer = createRenderer(this.rootNode, this.stylePool);

    this.rootNode.onRender = () => this.onRender();
    this.rootNode.onComputeLayout = () => {
      if (this.isUnmounted || !this.rootNode.yogaNode) return;
      this.rootNode.yogaNode.setWidth(this.terminalColumns);
      this.rootNode.yogaNode.calculateLayout(this.terminalColumns, this.terminalRows);
    };

    if (options.stdout.isTTY) {
      options.stdout.on('resize', () => {
        this.terminalColumns = options.stdout.columns || 80;
        this.terminalRows = options.stdout.rows || 24;
        this.onRender();
      });
    }

    onExit(this.unmount);
  }

  render(node: ReactNode): void {
    this.currentNode = node;
    const rootNode = (
      <App
        stdin={this.options.stdin}
        stdout={this.options.stdout}
        stderr={this.options.stderr}
        exitOnCtrlC={this.options.exitOnCtrlC}
        onExit={this.unmount}
        terminalColumns={this.terminalColumns}
        terminalRows={this.terminalRows}
      >
        {node}
      </App>
    );

    reconciler.updateContainer(rootNode, this.container, null, () => {
        this.onRender();
    });
  }

  setAltScreenActive(isActive: boolean): void {
    this.isAltScreenActive = isActive;
    this.hasRenderedFullFrame = false;
    this.onRender();
  }

  clearTextSelection(): void {
    // No-op for compatibility with AlternateScreen component
  }

  onRender() {
    if (this.isUnmounted) return;

    const prevFrame = this.frontFrame || emptyFrame(this.terminalRows, this.terminalColumns, this.stylePool, this.charPool, this.hyperlinkPool);

    const frame = this.renderer({
      frontFrame: prevFrame,
      backFrame: { screen: createScreen(this.terminalColumns, this.terminalRows, this.stylePool, this.charPool, this.hyperlinkPool) } as any,
      isTTY: true,
      terminalWidth: this.terminalColumns,
      terminalRows: this.terminalRows,
      altScreen: this.isAltScreenActive,
      prevFrameContaminated: this.isAltScreenActive && !this.hasRenderedFullFrame
    });

    this.frontFrame = frame;

    if (this.isAltScreenActive && !this.hasRenderedFullFrame) {
      // Full frame render ONLY for the first frame to fill conhost buffers with spaces.
      // This prevents the "Managezones" squishing bug without causing constant flicker.
      this.hasRenderedFullFrame = true;
      const fullFrameDiff = this.logUpdate.renderFullFrame(frame);
      this.options.stdout.write(CURSOR_HOME);
      writeDiffToTerminal({ stdout: this.options.stdout, stderr: this.options.stderr } as any, fullFrameDiff, true);
    } else {
      // Subsequent frames (like the clock) use the smart diff engine for zero flicker.
      const diff = this.logUpdate.render(prevFrame, frame, this.isAltScreenActive, true);
      writeDiffToTerminal({ stdout: this.options.stdout, stderr: this.options.stderr } as any, diff, true);
    }
  }

  unmount = () => {
    if (this.isUnmounted) return;
    this.isUnmounted = true;
    reconciler.updateContainer(null, this.container, null, () => {
        instances.delete(this.options.stdout);
    });
  };

  waitUntilExit() { return new Promise(() => {}); }
}