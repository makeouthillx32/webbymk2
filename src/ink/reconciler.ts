import createReconciler from 'react-reconciler';
import { getYogaCounters } from 'src/native-ts/yoga-layout/index.js';
import {
  appendChildNode,
  clearYogaNodeReferences,
  createNode,
  createTextNode,
  type DOMElement,
  type DOMNodeAttribute,
  type ElementNames,
  insertBeforeNode,
  markDirty,
  removeChildNode,
  setAttribute,
  setStyle,
  setTextNodeValue,
  setTextStyles,
  type TextNode,
} from './dom.js';
import { Dispatcher } from './events/dispatcher.js';
import { EVENT_HANDLER_PROPS } from './events/event-handlers.js';
import { getFocusManager, getRootNode } from './focus.js';
import { LayoutDisplay } from './layout/node.js';
import applyStyles, { type Styles, type TextStyles } from './styles.js';

// Devtools connection simplified
if (process.env.NODE_ENV === 'development') {
  try {
    void import('./devtools.js');
  } catch {
    // Silently fail if devtools not present
  }
}

type AnyObject = Record<string, unknown>;

const diff = (before: AnyObject, after: AnyObject): AnyObject | undefined => {
  if (before === after) return;
  if (!before) return after;

  const changed: AnyObject = {};
  let isChanged = false;

  for (const key of Object.keys(before)) {
    const isDeleted = after ? !Object.hasOwn(after, key) : true;
    if (isDeleted) {
      changed[key] = undefined;
      isChanged = true;
    }
  }

  if (after) {
    for (const key of Object.keys(after)) {
      if (after[key] !== before[key]) {
        changed[key] = after[key];
        isChanged = true;
      }
    }
  }

  return isChanged ? changed : undefined;
};

const cleanupYogaNode = (node: DOMElement | TextNode): void => {
  const yogaNode = node.yogaNode;
  if (yogaNode) {
    yogaNode.unsetMeasureFunc();
    clearYogaNodeReferences(node);
    yogaNode.freeRecursive();
  }
};

type Props = Record<string, unknown>;

type HostContext = {
  isInsideText: boolean;
};

function setEventHandler(node: DOMElement, key: string, value: unknown): void {
  if (!node._eventHandlers) {
    node._eventHandlers = {};
  }
  node._eventHandlers[key] = value;
}

function applyProp(node: DOMElement, key: string, value: unknown): void {
  if (key === 'children') return;

  if (key === 'style') {
    setStyle(node, value as Styles);
    if (node.yogaNode) {
      applyStyles(node.yogaNode, value as Styles);
    }
    return;
  }

  if (key === 'textStyles') {
    node.textStyles = value as TextStyles;
    return;
  }

  if (EVENT_HANDLER_PROPS.has(key)) {
    setEventHandler(node, key, value);
    return;
  }

  setAttribute(node, key, value as DOMNodeAttribute);
}

type FiberLike = {
  elementType?: { displayName?: string; name?: string } | string | null;
  _debugOwner?: FiberLike | null;
  return?: FiberLike | null;
};

export function getOwnerChain(fiber: unknown): string[] {
  const chain: string[] = [];
  const seen = new Set<unknown>();
  let cur = fiber as FiberLike | null | undefined;
  for (let i = 0; cur && i < 50; i++) {
    if (seen.has(cur)) break;
    seen.add(cur);
    const t = cur.elementType;
    const name =
      typeof t === 'function'
        ? (t as { displayName?: string; name?: string }).displayName ||
          (t as { displayName?: string; name?: string }).name
        : typeof t === 'string'
          ? undefined
          : t?.displayName || t?.name;
    if (name && name !== chain[chain.length - 1]) chain.push(name);
    cur = cur._debugOwner ?? cur.return;
  }
  return chain;
}

export const dispatcher = new Dispatcher();

let _lastYogaMs = 0;
let _lastCommitMs = 0;
let _commitStart = 0;

export function recordYogaMs(ms: number): void {
  _lastYogaMs = ms;
}
export function getLastYogaMs(): number {
  return _lastYogaMs;
}
export function markCommitStart(): void {
  _commitStart = performance.now();
}
export function getLastCommitMs(): number {
  return _lastCommitMs;
}
export function resetProfileCounters(): void {
  _lastYogaMs = 0;
  _lastCommitMs = 0;
  _commitStart = 0;
}

const reconciler = createReconciler<
  ElementNames,
  Props,
  DOMElement,
  DOMElement,
  TextNode,
  DOMElement,
  unknown,
  unknown,
  DOMElement,
  HostContext,
  null,
  NodeJS.Timeout,
  -1,
  null
>({
  getRootHostContext: () => ({ isInsideText: false }),
  prepareForCommit: () => null,
  preparePortalMount: () => null,
  clearContainer: () => false,
  resetAfterCommit(rootNode) {
    _lastCommitMs = _commitStart > 0 ? performance.now() - _commitStart : 0;
    _commitStart = 0;
    
    if (typeof rootNode.onComputeLayout === 'function') {
      rootNode.onComputeLayout();
    }

    if (process.env.NODE_ENV === 'test') {
      if (rootNode.childNodes.length === 0 && rootNode.hasRenderedContent) {
        return;
      }
      if (rootNode.childNodes.length > 0) {
        rootNode.hasRenderedContent = true;
      }
      rootNode.onImmediateRender?.();
      return;
    }

    rootNode.onRender?.();
  },
  getChildHostContext(
    parentHostContext: HostContext,
    type: ElementNames,
  ): HostContext {
    const previousIsInsideText = parentHostContext.isInsideText;
    const isInsideText =
      type === 'ink-text' || type === 'ink-virtual-text' || type === 'ink-link';

    if (previousIsInsideText === isInsideText) {
      return parentHostContext;
    }

    return { isInsideText };
  },
  shouldSetTextContent: () => false,
  createInstance(
    originalType: ElementNames,
    newProps: Props,
    _root: DOMElement,
    hostContext: HostContext,
    internalHandle?: unknown,
  ): DOMElement {
    if (hostContext.isInsideText && originalType === 'ink-box') {
      throw new Error(`<Box> can't be nested inside <Text> component`);
    }

    const type =
      originalType === 'ink-text' && hostContext.isInsideText
        ? 'ink-virtual-text'
        : originalType;

    const node = createNode(type);
    for (const [key, value] of Object.entries(newProps)) {
      applyProp(node, key, value);
    }

    return node;
  },
  createTextInstance(
    text: string,
    _root: DOMElement,
    hostContext: HostContext,
  ): TextNode {
    if (!hostContext.isInsideText) {
      throw new Error(
        `Text string "${text}" must be rendered inside <Text> component`,
      );
    }

    return createTextNode(text);
  },
  resetTextContent() {},
  hideTextInstance(node) {
    setTextNodeValue(node, '');
  },
  unhideTextInstance(node, text) {
    setTextNodeValue(node, text);
  },
  getPublicInstance: (instance): DOMElement => instance as DOMElement,
  hideInstance(node) {
    node.isHidden = true;
    node.yogaNode?.setDisplay(LayoutDisplay.None);
    markDirty(node);
  },
  unhideInstance(node) {
    node.isHidden = false;
    node.yogaNode?.setDisplay(LayoutDisplay.Flex);
    markDirty(node);
  },
  appendInitialChild: appendChildNode,
  appendChild: appendChildNode,
  insertBefore: insertBeforeNode,
  finalizeInitialChildren(
    _node: DOMElement,
    _type: ElementNames,
    props: Props,
  ): boolean {
    return props['autoFocus'] === true;
  },
  commitMount(node: DOMElement): void {
    getFocusManager(node).handleAutoFocus(node);
  },
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getCurrentUpdatePriority: () => dispatcher.currentUpdatePriority,
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  detachDeletedInstance() {},
  getInstanceFromNode: () => null,
  prepareScopeUpdate() {},
  getInstanceFromScope: () => null,
  appendChildToContainer: appendChildNode,
  insertInContainerBefore: insertBeforeNode,
  removeChildFromContainer(node: DOMElement, removeNode: DOMElement): void {
    removeChildNode(node, removeNode);
    cleanupYogaNode(removeNode);
    getFocusManager(node).handleNodeRemoved(removeNode, node);
  },
  commitUpdate(
    node: DOMElement,
    _type: ElementNames,
    oldProps: Props,
    newProps: Props,
  ): void {
    const props = diff(oldProps, newProps);
    const style = diff(oldProps['style'] as Styles, newProps['style'] as Styles);

    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key === 'style') {
          setStyle(node, value as Styles);
          continue;
        }

        if (key === 'textStyles') {
          setTextStyles(node, value as TextStyles);
          continue;
        }

        if (EVENT_HANDLER_PROPS.has(key)) {
          setEventHandler(node, key, value);
          continue;
        }

        setAttribute(node, key, value as DOMNodeAttribute);
      }
    }

    if (style && node.yogaNode) {
      applyStyles(node.yogaNode, style, newProps['style'] as Styles);
    }
  },
  commitTextUpdate(node: TextNode, _oldText: string, newText: string): void {
    setTextNodeValue(node, newText);
  },
  removeChild(node, removeNode) {
    removeChildNode(node, removeNode);
    cleanupYogaNode(removeNode);
    if (removeNode.nodeName !== '#text') {
      const root = getRootNode(node);
      root.focusManager!.handleNodeRemoved(removeNode, root);
    }
  },
  maySuspendCommit(): boolean {
    return false;
  },
  preloadInstance(): boolean {
    return true;
  },
  startSuspendingCommit(): void {},
  suspendInstance(): void {},
  waitForCommitToBeReady(): null {
    return null;
  },
  NotPendingTransition: null,
  HostTransitionContext: {
    $$typeof: Symbol.for('react.context'),
    _currentValue: null,
  } as never,
  setCurrentUpdatePriority(newPriority: number): void {
    dispatcher.currentUpdatePriority = newPriority;
  },
  resolveUpdatePriority(): number {
    return dispatcher.resolveEventPriority();
  },
  resetFormInstance(): void {},
  requestPostPaintCallback(): void {},
  shouldAttemptEagerTransition(): boolean {
    return false;
  },
  trackSchedulerEvent(): void {},
  resolveEventType(): string | null {
    return dispatcher.currentEvent?.type ?? null;
  },
  resolveEventTimeStamp(): number {
    return dispatcher.currentEvent?.timeStamp ?? -1.1;
  },
});

dispatcher.discreteUpdates = reconciler.discreteUpdates.bind(reconciler);

export default reconciler;
