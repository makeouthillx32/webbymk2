import React, {
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  type AppState,
  type AppStateStore,
  getDefaultAppState,
} from './AppStateStore.js'
import { createStore } from './store.js'

export { type AppState, type AppStateStore, getDefaultAppState } from './AppStateStore.js'

export const AppStoreContext = React.createContext<AppStateStore | null>(null)

type Props = {
  children: ReactNode
  initialState?: AppState
  onChangeAppState?: (args: { newState: AppState; oldState: AppState }) => void
}

const HasAppStateContext = React.createContext(false)

export function AppStateProvider({
  children,
  initialState,
  onChangeAppState,
}: Props): ReactNode {
  const hasAppStateContext = useContext(HasAppStateContext)
  if (hasAppStateContext) {
    throw new Error('AppStateProvider can not be nested within another AppStateProvider')
  }

  const [store] = useState(() =>
    createStore<AppState>(initialState ?? getDefaultAppState(), onChangeAppState),
  )

  return (
    <HasAppStateContext.Provider value={true}>
      <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>
    </HasAppStateContext.Provider>
  )
}

function useAppStore(): AppStateStore {
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new ReferenceError(
      'useAppState/useSetAppState cannot be called outside of an <AppStateProvider />',
    )
  }
  return store
}

export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore()
  const get = () => selector(store.getState())
  return useSyncExternalStore(store.subscribe, get, get)
}

export function useSetAppState() {
  return useAppStore().setState
}

export function useAppStateStore() {
  return useAppStore()
}

const NOOP_SUBSCRIBE = () => () => {}

export function useAppStateMaybeOutsideOfProvider<T>(
  selector: (state: AppState) => T,
): T | undefined {
  const store = useContext(AppStoreContext)
  const get = () => (store ? selector(store.getState()) : undefined)
  return useSyncExternalStore(store ? store.subscribe : NOOP_SUBSCRIBE, get, get)
}
