"use client"

export function isIOSChromium(): boolean {
  if (typeof navigator === "undefined") return false

  const ua = navigator.userAgent
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

  // Check if it's a Chromium-based browser on iOS
  // All iOS browsers use WebKit, but we can detect Chrome/Brave/Edge by their UA strings
  const isChromium = /CriOS|EdgiOS/.test(ua) || (isIOS && /FxiOS|OPiOS|Mercury/.test(ua))

  return isIOS && isChromium
}
