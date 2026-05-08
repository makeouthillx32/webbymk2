import type { ReactNode } from 'react'
import { logForDebugging } from '../utils/debug.js'
import { Stream } from 'stream'
import type { FrameEvent } from './frame.js'
import Ink, { type Options as InkOptions } from './ink.tsx'
import instances from './instances.js'

export type RenderOptions = {
  stdout?: NodeJS.WriteStream
  stdin?: NodeJS.ReadStream
  stderr?: NodeJS.WriteStream
  exitOnCtrlC?: boolean
  patchConsole?: boolean
  onFrame?: (event: FrameEvent) => void
}

export type Instance = {
  rerender: Ink['render']
  unmount: Ink['unmount']
  waitUntilExit: Ink['waitUntilExit']
  cleanup: () => void
}

export type Root = {
  render: (node: ReactNode) => void
  unmount: () => void
  waitUntilExit: () => Promise<void>
}

export const renderSync = (
  node: ReactNode,
  options?: NodeJS.WriteStream | RenderOptions,
): Instance => {
  const opts = getOptions(options)
  const inkOptions: InkOptions = {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    exitOnCtrlC: true,
    patchConsole: true,
    ...opts,
  }

  const instance: Ink = getInstance(
    inkOptions.stdout,
    () => new Ink(inkOptions),
  )

  instance.render(node)
  
  // FORCE FIRST RENDER: Standard Ink's onRender is throttled/deferred.
  // We trigger it multiple times to ensure AlternateScreen and Layout effects apply.
  instance.onRender();
  instance.onRender();
  instance.onRender();

  return {
    rerender: instance.render,
    unmount() {
      instance.unmount()
    },
    waitUntilExit: instance.waitUntilExit,
    cleanup: () => instances.delete(inkOptions.stdout),
  }
}

const wrappedRender = async (
  node: ReactNode,
  options?: NodeJS.WriteStream | RenderOptions,
): Promise<Instance> => {
  await Promise.resolve()
  const instance = renderSync(node, options)
  return instance
}

export default wrappedRender

export async function createRoot({
  stdout = process.stdout,
  stdin = process.stdin,
  stderr = process.stderr,
  exitOnCtrlC = true,
  patchConsole = true,
  onFrame,
}: RenderOptions = {}): Promise<Root> {
  await Promise.resolve()
  const instance = new Ink({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC,
    patchConsole,
    onFrame,
  })

  instances.set(stdout, instance)

  return {
    render: node => {
        instance.render(node);
        instance.onRender(); 
        instance.onRender();
        instance.onRender();
    },
    unmount: () => instance.unmount(),
    waitUntilExit: () => instance.waitUntilExit(),
  }
}

function getOptions(
  obj: NodeJS.WriteStream | RenderOptions | undefined = {},
): RenderOptions {
  if (obj instanceof Stream || (obj && (obj as any)._writableState)) {
    return {
      stdout: obj as NodeJS.WriteStream,
    }
  }

  return obj as RenderOptions;
}

const getInstance = (
  stdout: NodeJS.WriteStream,
  createInstance: () => Ink,
): Ink => {
  let instance = instances.get(stdout)
  if (!instance) {
    instance = createInstance()
    instances.set(stdout, instance)
  }
  return instance
}