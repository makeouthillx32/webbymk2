import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type NotificationPriority = 'low' | 'medium' | 'high' | 'immediate'
export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export type Notification = {
  key: string
  text?: string
  jsx?: ReactNode
  color?: string
  type?: NotificationType
  priority: NotificationPriority
  timeoutMs?: number
  invalidates?: string[]
  fold?: (accumulator: Notification, incoming: Notification) => Notification
}

type AddNotificationFn = (content: Notification) => void
type RemoveNotificationFn = (key: string) => void

type NotificationsContextValue = {
  current: Notification | null
  queue: Notification[]
  notifications: Notification[]
  addNotification: AddNotificationFn
  removeNotification: RemoveNotificationFn
}

const DEFAULT_TIMEOUT_MS = 8000
const PRIORITIES: Record<NotificationPriority, number> = {
  immediate: 0,
  high: 1,
  medium: 2,
  low: 3,
}

const noopContext: NotificationsContextValue = {
  current: null,
  queue: [],
  notifications: [],
  addNotification: () => {},
  removeNotification: () => {},
}

const NotificationsContext = createContext<NotificationsContextValue>(noopContext)

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [current, setCurrent] = useState<Notification | null>(null)
  const [queue, setQueue] = useState<Notification[]>([])

  const clearCurrentTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const removeNotification = useCallback<RemoveNotificationFn>((key) => {
    clearCurrentTimeout()
    setCurrent(prev => (prev?.key === key ? null : prev))
    setQueue(prev => prev.filter(notification => notification.key !== key))
  }, [clearCurrentTimeout])

  const scheduleCurrent = useCallback((notification: Notification) => {
    clearCurrentTimeout()
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null
      setCurrent(prev => (prev?.key === notification.key ? null : prev))
    }, notification.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  }, [clearCurrentTimeout])

  const addNotification = useCallback<AddNotificationFn>((incoming) => {
    if (incoming.priority === 'immediate') {
      clearCurrentTimeout()
      setQueue(prev => prev.filter(item => !incoming.invalidates?.includes(item.key)))
      setCurrent(incoming)
      scheduleCurrent(incoming)
      return
    }

    setQueue(prev => {
      const withoutInvalidated = prev.filter(
        item => !incoming.invalidates?.includes(item.key),
      )
      const existingIndex = withoutInvalidated.findIndex(item => item.key === incoming.key)
      if (existingIndex !== -1 && incoming.fold) {
        const next = [...withoutInvalidated]
        next[existingIndex] = incoming.fold(next[existingIndex]!, incoming)
        return next
      }
      if (existingIndex !== -1) {
        const next = [...withoutInvalidated]
        next[existingIndex] = incoming
        return next
      }
      return [...withoutInvalidated, incoming]
    })

    setCurrent(prev => {
      if (prev && incoming.invalidates?.includes(prev.key)) return null
      if (prev?.key === incoming.key && incoming.fold) {
        const folded = incoming.fold(prev, incoming)
        scheduleCurrent(folded)
        return folded
      }
      if (incoming.priority === 'immediate' || prev === null) {
        scheduleCurrent(incoming)
        return incoming
      }
      return prev
    })
  }, [clearCurrentTimeout, scheduleCurrent])

  useEffect(() => {
    if (current || queue.length === 0) return
    const next = getNext(queue)
    if (!next) return
    setQueue(prev => prev.filter(item => item !== next))
    setCurrent(next)
    scheduleCurrent(next)
  }, [current, queue, scheduleCurrent])

  const value = useMemo<NotificationsContextValue>(() => ({
    current,
    queue,
    notifications: current ? [current, ...queue] : queue,
    addNotification,
    removeNotification,
  }), [addNotification, current, queue, removeNotification])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext)
}

export function getNext(queue: Notification[]): Notification | undefined {
  if (queue.length === 0) return undefined
  return queue.reduce((min, notification) =>
    PRIORITIES[notification.priority] < PRIORITIES[min.priority]
      ? notification
      : min,
  )
}
