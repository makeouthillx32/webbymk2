import React from 'react';
import { PassThrough } from 'stream';
import { renderSync } from './root.js';
import instances from './instances.js';
import { WelcomeScreen } from '../screens/WelcomeScreen.jsx';
import type { DOMNode, DOMElement } from './dom.js';
import * as fs from 'fs';

function createMockStdout(columns: number, rows: number): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  stream.columns = columns;
  stream.rows = rows;
  stream.isTTY = true;
  (stream as any).on = () => stream;
  return stream;
}

const mockStdin = new PassThrough() as unknown as NodeJS.ReadStream;
mockStdin.isTTY = true;
(mockStdin as any).setRawMode = () => mockStdin;
(mockStdin as any).setEncoding = () => mockStdin;
(mockStdin as any).ref = () => mockStdin;
(mockStdin as any).unref = () => mockStdin;

const stdout = createMockStdout(80, 24);

const noop = () => {};
const element = (
  <WelcomeScreen
    zones={[]}
    zoneStatuses={{}}
    proxyStatus="running"
    isActive={true}
    onManage={noop}
    onSettings={noop}
    onQuit={noop}
  />
);

const instance = renderSync(element, {
  stdout,
  stdin: mockStdin,
  exitOnCtrlC: false,
});

// Let React commit
await Promise.resolve();

const inkInstance = instances.get(stdout);
if (!inkInstance) {
  console.error("No Ink instance found for stdout!");
  process.exit(1);
}

const root = (inkInstance as any).rootNode as DOMElement;

let outputLines: string[] = [];

function printTree(node: DOMNode, depth: number = 0) {
  const indent = '  '.repeat(depth);
  if (node.nodeName === '#text') {
    const textVal = JSON.stringify((node as any).nodeValue);
    outputLines.push(`${indent}#text: ${textVal}`);
    return;
  }

  const el = node as DOMElement;
  const yoga = el.yogaNode;
  let layoutStr = 'no layout';
  if (yoga) {
    layoutStr = `left:${yoga.getComputedLeft()} top:${yoga.getComputedTop()} w:${yoga.getComputedWidth()} h:${yoga.getComputedHeight()}`;
  }

  const stylesStr = JSON.stringify(el.style);
  outputLines.push(`${indent}${el.nodeName} [${layoutStr}] styles:${stylesStr}`);

  for (const child of el.childNodes) {
    printTree(child, depth + 1);
  }
}

printTree(root);

fs.writeFileSync('src/ink/layout-tree.txt', outputLines.join('\n'));

instance.unmount();
instance.cleanup();
process.exit(0);
