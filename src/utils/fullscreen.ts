import { isEnvTruthy } from "./envUtils.js";

/**
 * Mouse clicks are disabled in accessibility mode so the terminal can keep the
 * native cursor visible and stay keyboard-first.
 */
export function isMouseClicksDisabled(): boolean {
	return isEnvTruthy(process.env.UNT_TERM_ACCESSIBILITY);
}
