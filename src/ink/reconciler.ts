import createReconciler from 'react-reconciler';
import { DefaultEventPriority, LegacyRoot } from 'react-reconciler/constants.js';
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
import { getFocusManager, getRootNode } from './focus.js';
import { LayoutDisplay } from './layout/node.js';
import { EVENT_HANDLER_PROPS } from './events/event-handlers.js';
import applyStyles, { type Styles, type TextStyles } from './styles.js';

type AnyObject = Record<string, unknown>;

const diff = (before: AnyObject, after: AnyObject): AnyObject | undefined => {
  if (before === after) return;
  if (!before) return after;
  const changed: AnyObject = {};
  let isChanged = false;
  for (const key of Object.keys(before)) {
    if (after ? !Object.hasOwn(after, key) : true) {
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

const dispatcher = {
    currentUpdatePriority: DefaultEventPriority,
};

function applyProp(node: DOMElement, key: string, value: unknown): void {
  if (key === 'children') return;
  if (EVENT_HANDLER_PROPS.has(key)) {
    if (!node._eventHandlers) {
      node._eventHandlers = {};
    }

    if (typeof value === 'function') {
      node._eventHandlers[key] = value;
    } else {
      delete node._eventHandlers[key];
    }

    return;
  }
  if (key === 'style') {
    setStyle(node, value as Styles);
    if (node.yogaNode) applyStyles(node.yogaNode, value as Styles);
    return;
  }
  if (key === 'textStyles') {
    setTextStyles(node, value as TextStyles);
    return;
  }
  setAttribute(node, key, value as DOMNodeAttribute);
}

const reconciler = createReconciler<
  ElementNames,
  Record<string, any>,
  DOMElement,
  DOMElement,
  TextNode,
  DOMElement,
  unknown,
  unknown,
  DOMElement,
  { isInsideText: boolean },
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
    if (typeof rootNode.onComputeLayout === 'function') rootNode.onComputeLayout();
    rootNode.onRender?.();
  },
  getChildHostContext(parent, type) {
    const isInsideText = type === 'ink-text' || type === 'ink-virtual-text' || type === 'ink-link';
    return parent.isInsideText === isInsideText ? parent : { isInsideText };
  },
  shouldSetTextContent: () => false,
  createInstance(originalType, newProps, _root, hostContext) {
    const type = (originalType === 'ink-text' && hostContext.isInsideText) ? 'ink-virtual-text' : originalType;
    const node = createNode(type);
    for (const [key, value] of Object.entries(newProps)) applyProp(node, key, value);
    return node;
  },
  createTextInstance: (text) => createTextNode(text),
  resetTextContent() {},
  getPublicInstance: (instance) => instance,
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
  finalizeInitialChildren: (node, type, props) => props['autoFocus'] === true,
  commitMount: (node) => getFocusManager(node).handleAutoFocus(node),
  isPrimaryRenderer: true,
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  getCurrentUpdatePriority: () => dispatcher.currentUpdatePriority,
  detachDeletedInstance() {},
  prepareUpdate: () => true,
  commitUpdate(node, _type, oldProps, newProps) {
    const props = diff(oldProps, newProps);
    if (props) {
      // Route every changed prop through applyProp so event handlers (onFocus,
      // onClick, onKeyDown, etc.) land in node._eventHandlers, not attributes.
      // The old code called setAttribute directly, which silently discarded
      // event handler updates — handlers set on initial mount would never update.
      for (const [key, value] of Object.entries(props)) {
        applyProp(node, key, value);
      }
    }
    const style = diff(oldProps['style'] as Styles, newProps['style'] as Styles);
    if (style && node.yogaNode) applyStyles(node.yogaNode, style, newProps['style'] as Styles);
  },
  commitTextUpdate: (node, _old, newText) => setTextNodeValue(node, newText),
  removeChild(node, removeNode) {
    removeChildNode(node, removeNode);
    cleanupYogaNode(removeNode);
    if (removeNode.nodeName !== '#text') getFocusManager(node).handleNodeRemoved(removeNode, getRootNode(node));
  },
  appendChildToContainer: appendChildNode,
  insertInContainerBefore: insertBeforeNode,
  removeChildFromContainer(node, removeNode) {
    removeChildNode(node, removeNode);
    cleanupYogaNode(removeNode);
    getFocusManager(node).handleNodeRemoved(removeNode, node);
  },
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady: () => null,
  NotPendingTransition: null,
  HostTransitionContext: { $$typeof: Symbol.for('react.context'), _currentValue: null } as any,
  setCurrentUpdatePriority: (p) => { dispatcher.currentUpdatePriority = p; },
  resolveUpdatePriority: () => dispatcher.currentUpdatePriority,
  getCurrentEventPriority: () => DefaultEventPriority,
  resolveUpdateLane: () => DefaultEventPriority,
  resolveEventTimeStamp: () => performance.now(),
  resetFormInstance() {},
  requestPostPaintCallback() {},
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent() {},
  resolveEventType: () => null,
});

export default reconciler;

// Scroll-bypass timing hook — called by ScrollBox before scheduleRenderFrom
// so the reconciler can track commit-start timing for frame-gap diagnostics.
// No-op in this build; present to satisfy the import.
export function markCommitStart(): void {}