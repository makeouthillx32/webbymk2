// Utility to get static theme colors for generateMetadata
export const getThemeColors = (isHomePage = false) => {
  // These should match your CSS variables
  const lightColor = isHomePage ? "#f9fafb" : "#ffffff"
  const darkColor = isHomePage ? "#0f172a" : "#111827"

  return [
    { media: "(prefers-color-scheme: dark)", color: darkColor },
    { media: "(prefers-color-scheme: light)", color: lightColor },
  ]
}
