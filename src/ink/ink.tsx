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
import {
  CURSOR_HOME,
  ENABLE_KITTY_KEYBOARD,
  ENABLE_MODIFY_OTHER_KEYS,
  ERASE_SCREEN,
} from './termio/csi.js';
import { LogUpdate } from './log-update.js';
import { emptyFrame, type FrameEvent } from './frame.js';
import {
  captureScrolledRows,
  clearSelection,
  createSelectionState,
  extendSelection,
  getSelectedText,
  hasSelection,
  moveFocus,
  applySelectionOverlay,
  selectLineAt,
  selectWordAt,
  shiftSelection,
  updateSelection,
  type FocusMove,
  type SelectionState,
} from './selection.js';
import type { DOMElement } from './dom.js';
import { dispatchClick, dispatchHover } from './hit-test.js';
import { CellWidth, cellAt, cellAtIndex } from './screen.js';
import {
  applyPositionedHighlight,
  type MatchPosition,
} from './render-to-screen.js';
import { applySearchHighlight } from './searchHighlight.js';
import { Dispatcher } from './events/dispatcher.js';
import { KeyboardEvent } from './events/keyboard-event.js';
import type { ParsedKey } from './parse-keypress.js';
import { nodeCache } from './node-cache.js';
import {
  EBP,
  EFE,
  ENABLE_MOUSE_TRACKING,
  ENTER_ALT_SCREEN,
} from './termio/dec.js';
import { supportsExtendedKeys } from './terminal.js';

export type Options = {
  stdout: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stderr: NodeJS.WriteStream;
  exitOnCtrlC: boolean;
  patchConsole: boolean;
  onFrame?: (event: FrameEvent) => void;
};

export default class Ink {
  private readonly options: Options;
  private readonly stylePool = new StylePool();
  private readonly charPool = new CharPool();
  private readonly hyperlinkPool = new HyperlinkPool();
  private readonly rootNode: dom.DOMElement;
  private readonly renderer: Renderer;
  private readonly container: any;
  private readonly dispatcher = new Dispatcher();
  private readonly focusManager: FocusManager;
  private readonly logUpdate: LogUpdate;
  private terminalColumns: number;
  private terminalRows: number;
  private currentNode: ReactNode = null;
  private isUnmounted = false;
  private frontFrame: any = null;
  isAltScreenActive = false;
  private isMouseTrackingActive = false;
  private selectionSubscribers = new Set<() => void>();
  private searchHighlightQuery = '';
  private searchPositions: {
    positions: MatchPosition[];
    rowOffset: number;
    currentIdx: number;
  } | null = null;
  private previousFrameHadOverlay = false;
  private hoveredNodes = new Set<DOMElement>();
  private hasRenderedFullFrame = false;
  private exitError: Error | undefined;
  private readonly exitPromise: Promise<void>;
  private resolveExitPromise!: () => void;
  private rejectExitPromise!: (error: Error) => void;
  readonly selection: SelectionState = createSelectionState();

  constructor(options: Options) {
    autoBind(this);
    this.options = options;
    this.exitPromise = new Promise((resolve, reject) => {
      this.resolveExitPromise = resolve;
      this.rejectExitPromise = reject;
    });
    this.terminalColumns = options.stdout.columns || 80;
    this.terminalRows = options.stdout.rows || 24;

    this.logUpdate = new LogUpdate({
      isTTY: true, // Force to true to fix Windows PowerShell false negatives
      stylePool: this.stylePool,
    });

    this.rootNode = dom.createNode('ink-root');
    this.focusManager = new FocusManager((target, event) =>
      this.dispatcher.dispatchDiscrete(target, event),
    );
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
        selection={this.selection}
        onSelectionChange={this.notifySelectionChange}
        onClickAt={this.dispatchClickAt}
        onHoverAt={this.dispatchHoverAt}
        getHyperlinkAt={this.getHyperlinkAt}
        onOpenHyperlink={() => {}}
        onMultiClick={this.handleMultiClickSelection}
        onSelectionDrag={this.handleSelectionDrag}
        dispatchKeyboardEvent={this.dispatchKeyboardEvent}
        onStdinResume={this.handleStdinResume}
      >
        {node}
      </App>
    );

    reconciler.updateContainer(rootNode, this.container, null, () => {
        this.onRender();
    });
  }

  setAltScreenActive(isActive: boolean, mouseTracking = false): void {
    this.isAltScreenActive = isActive;
    this.isMouseTrackingActive = isActive && mouseTracking;
    this.hasRenderedFullFrame = false;
    this.onRender();
  }

  drainStdin(): void {
    const { stdin } = this.options;
    if (!stdin.readable || !stdin.read) {
      return;
    }

    try {
      while (stdin.read() !== null) {
        // Drain pending terminal bytes before returning to cooked mode.
      }
    } catch {
      // The terminal may already be gone during shutdown.
    }
  }

  detachForShutdown(): void {
    this.isUnmounted = true;
    this.isAltScreenActive = false;
    this.isMouseTrackingActive = false;
    instances.delete(this.options.stdout);
    this.resolveExitPromise();
  }

  clearTextSelection(): void {
    clearSelection(this.selection);
    this.notifySelectionChange();
    this.onRender();
  }

  hasTextSelection(): boolean {
    return hasSelection(this.selection);
  }

  copySelectionNoClear(): string {
    const screen = this.frontFrame?.screen;
    if (!screen || !hasSelection(this.selection)) {
      return '';
    }
    return getSelectedText(this.selection, screen);
  }

  copySelection(): string {
    const selected = this.copySelectionNoClear();
    this.clearTextSelection();
    return selected;
  }

  subscribeToSelectionChange = (subscriber: () => void): (() => void) => {
    this.selectionSubscribers.add(subscriber);
    return () => {
      this.selectionSubscribers.delete(subscriber);
    };
  };

  shiftSelectionForScroll(dRow: number, minRow: number, maxRow: number): void {
    shiftSelection(
      this.selection,
      dRow,
      minRow,
      maxRow,
      Math.max(1, this.terminalColumns),
    );
    this.notifySelectionChange();
    this.onRender();
  }

  moveSelectionFocus(move: FocusMove): void {
    const focus = this.selection.focus;
    if (!focus) {
      return;
    }

    const maxCol = Math.max(0, this.terminalColumns - 1);
    const maxRow = Math.max(0, this.terminalRows - 1);
    let col = focus.col;
    let row = focus.row;

    switch (move) {
      case 'left':
        col = col > 0 ? col - 1 : 0;
        break;
      case 'right':
        col = col < maxCol ? col + 1 : maxCol;
        break;
      case 'up':
        row = row > 0 ? row - 1 : 0;
        break;
      case 'down':
        row = row < maxRow ? row + 1 : maxRow;
        break;
      case 'lineStart':
        col = 0;
        break;
      case 'lineEnd':
        col = maxCol;
        break;
    }

    moveFocus(this.selection, col, row);
    this.notifySelectionChange();
    this.onRender();
  }

  captureScrolledRows(
    firstRow: number,
    lastRow: number,
    side: 'above' | 'below',
  ): void {
    const screen = this.frontFrame?.screen;
    if (!screen) {
      return;
    }

    captureScrolledRows(this.selection, screen, firstRow, lastRow, side);
    this.notifySelectionChange();
  }

  setSelectionBgColor(_color: string): void {
    // Selection theming is a renderer overlay concern; keep this as a stable
    // compatibility point until the overlay path is wired into this engine.
  }

  setSearchHighlight(query: string): void {
    this.searchHighlightQuery = query;
    this.onRender();
  }

  scanElementSubtree(el: DOMElement): MatchPosition[] {
    const screen = this.frontFrame?.screen;
    const rect = nodeCache.get(el);
    const query = this.searchHighlightQuery.toLowerCase();

    if (!screen || !rect || !query) {
      return [];
    }

    const positions: MatchPosition[] = [];
    const queryLength = query.length;
    const minRow = Math.max(0, rect.y);
    const maxRow = Math.min(screen.height, rect.y + rect.height);
    const minCol = Math.max(0, rect.x);
    const maxCol = Math.min(screen.width, rect.x + rect.width);

    for (let row = minRow; row < maxRow; row++) {
      let text = '';
      const colOf: number[] = [];
      const codeUnitToCell: number[] = [];

      for (let col = minCol; col < maxCol; col++) {
        const idx = row * screen.width + col;
        const cell = cellAtIndex(screen, idx);
        if (
          cell.width === CellWidth.SpacerTail ||
          cell.width === CellWidth.SpacerHead ||
          screen.noSelect[idx] === 1
        ) {
          continue;
        }

        const lower = cell.char.toLowerCase();
        const cellIndex = colOf.length;
        for (let i = 0; i < lower.length; i++) {
          codeUnitToCell.push(cellIndex);
        }
        text += lower;
        colOf.push(col);
      }

      let foundAt = text.indexOf(query);
      while (foundAt >= 0) {
        const startCellIndex = codeUnitToCell[foundAt]!;
        const endCellIndex = codeUnitToCell[foundAt + queryLength - 1]!;
        const col = colOf[startCellIndex]!;
        const endCol = colOf[endCellIndex]! + 1;
        positions.push({
          row: row - rect.y,
          col: col - rect.x,
          len: endCol - col,
        });
        foundAt = text.indexOf(query, foundAt + queryLength);
      }
    }

    return positions;
  }

  setSearchPositions(
    state: {
      positions: MatchPosition[];
      rowOffset: number;
      currentIdx: number;
    } | null,
  ): void {
    this.searchPositions = state;
    this.onRender();
  }

  private notifySelectionChange = (): void => {
    this.selectionSubscribers.forEach(subscriber => subscriber());
  }

  private handleSelectionDrag = (col: number, row: number): void => {
    const screen = this.frontFrame?.screen;
    if (screen && this.selection.anchorSpan) {
      extendSelection(this.selection, screen, col, row);
    } else {
      updateSelection(this.selection, col, row);
    }
    this.notifySelectionChange();
    this.onRender();
  };

  private handleMultiClickSelection = (
    col: number,
    row: number,
    count: 2 | 3,
  ): void => {
    const screen = this.frontFrame?.screen;
    if (!screen) {
      return;
    }

    if (count === 2) {
      selectWordAt(this.selection, screen, col, row);
    } else {
      selectLineAt(this.selection, screen, row);
    }

    this.notifySelectionChange();
    this.onRender();
  };

  private dispatchClickAt = (col: number, row: number): boolean => {
    if (!this.isAltScreenActive) {
      return false;
    }

    const screen = this.frontFrame?.screen;
    const cellIsBlank = !screen || cellAt(screen, col, row)?.char === ' ';
    return dispatchClick(this.rootNode, col, row, cellIsBlank);
  };

  private dispatchHoverAt = (col: number, row: number): void => {
    if (!this.isAltScreenActive) {
      return;
    }

    dispatchHover(this.rootNode, col, row, this.hoveredNodes);
  };

  private getHyperlinkAt = (col: number, row: number): string | undefined => {
    const screen = this.frontFrame?.screen;
    return screen ? cellAt(screen, col, row)?.hyperlink : undefined;
  };

  private dispatchKeyboardEvent = (parsedKey: ParsedKey): void => {
    if (!this.focusManager.activeElement) {
      const firstFocusable = this.findFirstFocusable(this.rootNode);
      if (firstFocusable) {
        this.focusManager.focus(firstFocusable);
      }
    }

    const target = this.focusManager.activeElement ?? this.rootNode;
    const event = new KeyboardEvent(parsedKey);
    const shouldRunDefault = this.dispatcher.dispatchDiscrete(target, event);

    if (!shouldRunDefault || event.key !== 'tab') {
      return;
    }

    if (event.shift) {
      this.focusManager.focusPrevious(this.rootNode);
    } else {
      this.focusManager.focusNext(this.rootNode);
    }
  };

  private findFirstFocusable(node: DOMElement): DOMElement | null {
    if (typeof node.attributes['tabIndex'] === 'number') {
      return node;
    }

    for (const child of node.childNodes) {
      if (child.nodeName === '#text') {
        continue;
      }

      const match = this.findFirstFocusable(child);
      if (match) {
        return match;
      }
    }

    return null;
  }

  private handleStdinResume = (): void => {
    if (!this.options.stdout.isTTY) {
      return;
    }

    this.options.stdout.write(EBP + EFE);
    if (supportsExtendedKeys()) {
      this.options.stdout.write(ENABLE_KITTY_KEYBOARD + ENABLE_MODIFY_OTHER_KEYS);
    }
    if (this.isAltScreenActive) {
      this.options.stdout.write(
        ENTER_ALT_SCREEN +
          (this.isMouseTrackingActive ? ENABLE_MOUSE_TRACKING : ''),
      );
      this.hasRenderedFullFrame = false;
      this.onRender();
    }
  };

  onRender() {
    if (this.isUnmounted) return;

    const frameStartedAt = performance.now();
    const prevFrame = this.frontFrame || emptyFrame(this.terminalRows, this.terminalColumns, this.stylePool, this.charPool, this.hyperlinkPool);

    const frame = this.renderer({
      frontFrame: prevFrame,
      backFrame: { screen: createScreen(this.terminalColumns, this.terminalRows, this.stylePool, this.charPool, this.hyperlinkPool) } as any,
      isTTY: true,
      terminalWidth: this.terminalColumns,
      terminalRows: this.terminalRows,
      altScreen: this.isAltScreenActive,
      prevFrameContaminated:
        (this.isAltScreenActive && !this.hasRenderedFullFrame) ||
        this.previousFrameHadOverlay
    });

    const selectionOverlayApplied = hasSelection(this.selection);
    if (selectionOverlayApplied) {
      applySelectionOverlay(frame.screen, this.selection, this.stylePool);
    }

    const searchOverlayApplied = applySearchHighlight(
      frame.screen,
      this.searchHighlightQuery,
      this.stylePool,
    );

    const positionedSearchApplied = this.searchPositions
      ? applyPositionedHighlight(
          frame.screen,
          this.stylePool,
          this.searchPositions.positions,
          this.searchPositions.rowOffset,
          this.searchPositions.currentIdx,
        )
      : false;

    this.previousFrameHadOverlay =
      selectionOverlayApplied || searchOverlayApplied || positionedSearchApplied;

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

    this.options.onFrame?.({
      durationMs: performance.now() - frameStartedAt,
      flickers: [],
    });
  }

  unmount = (error?: Error) => {
    if (this.isUnmounted) return;
    this.isUnmounted = true;
    this.exitError = error;
    reconciler.updateContainer(null, this.container, null, () => {
        instances.delete(this.options.stdout);
        if (this.exitError) {
          this.rejectExitPromise(this.exitError);
        } else {
          this.resolveExitPromise();
        }
    });
  };

  waitUntilExit() {
    return this.exitPromise;
  }
}
