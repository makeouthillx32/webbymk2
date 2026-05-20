import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const NON_MODAL_OVERLAYS = new Set(['autocomplete'])

type OverlayContextValue = {
  activeOverlays: ReadonlySet<string>
  registerOverlay: (id: string) => void
  unregisterOverlay: (id: string) => void
}

const noopContext: OverlayContextValue = {
  activeOverlays: new Set<string>(),
  registerOverlay: () => {},
  unregisterOverlay: () => {},
}

const OverlayContext = createContext<OverlayContextValue>(noopContext)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [activeOverlays, setActiveOverlays] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )

  const registerOverlay = useCallback((id: string) => {
    setActiveOverlays(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const unregisterOverlay = useCallback((id: string) => {
    setActiveOverlays(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const value = useMemo<OverlayContextValue>(() => ({
    activeOverlays,
    registerOverlay,
    unregisterOverlay,
  }), [activeOverlays, registerOverlay, unregisterOverlay])

  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
}

export function useRegisterOverlay(id: string, enabled = true): void {
  const { registerOverlay, unregisterOverlay } = useContext(OverlayContext)

  useEffect(() => {
    if (!enabled) return
    registerOverlay(id)
    return () => unregisterOverlay(id)
  }, [enabled, id, registerOverlay, unregisterOverlay])
}

export function useIsOverlayActive(): boolean {
  return useContext(OverlayContext).activeOverlays.size > 0
}

export function useIsModalOverlayActive(): boolean {
  const { activeOverlays } = useContext(OverlayContext)
  for (const id of activeOverlays) {
    if (!NON_MODAL_OVERLAYS.has(id)) return true
  }
  return false
}
