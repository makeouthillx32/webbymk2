import { useContext, useEffect, useMemo, useState } from 'react'
import StdinContext from '../components/StdinContext.js'

const MIN_WIDTH = 20
const FALLBACK_WIDTH = 80
const FALLBACK_HEIGHT = 24

type Size = {
  width: number
  height: number
}

type SizeSubscriber = (size: Size) => void

type TerminalSizeChannel = {
  stdout: NodeJS.WriteStream
  subscribers: Set<SizeSubscriber>
  listener: () => void
}

const channels = new WeakMap<NodeJS.WriteStream, TerminalSizeChannel>()

function readSize(stdout: NodeJS.WriteStream): Size {
  return {
    width: Math.max(MIN_WIDTH, stdout.columns ?? FALLBACK_WIDTH),
    height: stdout.rows ?? FALLBACK_HEIGHT,
  }
}

function getChannel(stdout: NodeJS.WriteStream): TerminalSizeChannel {
  let channel = channels.get(stdout)

  if (channel) {
    return channel
  }

  channel = {
    stdout,
    subscribers: new Set<SizeSubscriber>(),
    listener: () => {
      const size = readSize(stdout)
      channel?.subscribers.forEach(subscriber => subscriber(size))
    },
  }

  channels.set(stdout, channel)
  return channel
}

function subscribeToTerminalSize(
  stdout: NodeJS.WriteStream,
  subscriber: SizeSubscriber,
): () => void {
  const channel = getChannel(stdout)
  const shouldAttachListener = channel.subscribers.size === 0

  channel.subscribers.add(subscriber)

  if (shouldAttachListener) {
    channel.stdout.on('resize', channel.listener)
  }

  subscriber(readSize(stdout))

  return () => {
    channel.subscribers.delete(subscriber)

    if (channel.subscribers.size === 0) {
      channel.stdout.off('resize', channel.listener)
    }
  }
}

function useTerminalSize(): Size {
  const { stdout } = useContext(StdinContext)
  const [size, setSize] = useState<Size>(() => readSize(stdout))

  useEffect(() => {
    return subscribeToTerminalSize(stdout, setSize)
  }, [stdout])

  return size
}

export function useTermWidth(): number {
  return useTerminalSize().width
}

export function useTermHeight(): number {
  return useTerminalSize().height
}

export function useWidths() {
  const size = useTerminalSize()

  return useMemo(
    () =>
      ({
        tw: size.width,
        iw: size.width - 4,
        dw: size.width - 6,
        th: size.height,
      }) as const,
    [size.height, size.width],
  )
}
