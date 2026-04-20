// tui/components/index.ts
// Barrel export — all TUI design-system components.
//
// Components are API-compatible with src/components/design-system/ so
// panel code reads the same way as core UI code.

export { ContainerDot }                     from "./ContainerDot.tsx";
export { Divider }                          from "./Divider.tsx";
export type { DividerProps }                from "./Divider.tsx";
export { KeyHint }                          from "./KeyHint.tsx";
export type { Hint }                        from "./KeyHint.tsx";
export { KeyboardShortcutHint }             from "./KeyboardShortcutHint.tsx";
export type { KeyboardShortcutHintProps }   from "./KeyboardShortcutHint.tsx";
export { ListItem }                         from "./ListItem.tsx";
export type { ListItemProps }               from "./ListItem.tsx";
export { NoSelect }                         from "./NoSelect.tsx";
export { Pane }                             from "./Pane.tsx";
export type { PaneProps }                   from "./Pane.tsx";
export { StatusIcon }                       from "./StatusIcon.tsx";
export type { StatusIconProps, IconStatus } from "./StatusIcon.tsx";
export { Tabs }                             from "./Tabs.tsx";
