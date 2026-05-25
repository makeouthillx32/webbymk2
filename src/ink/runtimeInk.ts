/**
 * Current production Ink adapter.
 *
 * Unaxis still renders the live TUI through the npm Ink runtime by default.
 * The env switch is for detached local-engine smoke/preview harnesses only;
 * production boot must not rely on it until the launcher path is explicitly
 * wired and verified.
 */
import {
  Box as NpmBox,
  Text as NpmText,
  useApp as npmUseApp,
  useInput as npmUseInput,
  useStdin as npmUseStdin,
  Newline as NpmNewline,
  Spacer as NpmSpacer,
} from 'ink'
import LocalBox from './components/Box.js'
import LocalText from './components/Text.js'
import LocalNewline from './components/Newline.js'
import LocalSpacer from './components/Spacer.js'
import localUseApp from './hooks/use-app.js'
import localUseInput from './hooks/use-input.js'
import localUseStdin from './hooks/use-stdin.js'

const useLocalRuntime = process.env.UNAXIS_LOCAL_INK_RUNTIME === '1'

export const Box = useLocalRuntime ? LocalBox : NpmBox
export const Text = useLocalRuntime ? LocalText : NpmText
export const useApp = useLocalRuntime ? localUseApp : npmUseApp
export const useInput = useLocalRuntime ? localUseInput : npmUseInput
export const useStdin = useLocalRuntime ? localUseStdin : npmUseStdin
export const Newline = useLocalRuntime ? LocalNewline : NpmNewline
export const Spacer = useLocalRuntime ? LocalSpacer : NpmSpacer
