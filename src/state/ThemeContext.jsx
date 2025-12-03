/* eslint-disable react-refresh/only-export-components */
import React from 'react'
import { ThemeProvider as MUIThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

const ThemeContext = React.createContext(null)

export function useThemeContext() {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider')
  return ctx
}

function buildTheme(mode) {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'dark' ? '#60a5fa' : '#1f6feb',
      },
      background: {
        default: mode === 'dark' ? '#0b1220' : '#f5f7fa',
        paper: mode === 'dark' ? '#0f1724' : '#ffffff',
      },
      text: {
        primary: mode === 'dark' ? '#e5e7eb' : '#111827',
      },
    },
  })
}

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = React.useState(() => {
    try {
      const v = localStorage.getItem('patlang:darkMode')
      if (v !== null) return v === '1'
    } catch {
      // intentionally ignore localStorage errors (e.g. SSR or blocked storage)
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  React.useEffect(() => {
    try {
      if (darkMode) {
        document.documentElement.classList.add('dark')
        localStorage.setItem('patlang:darkMode', '1')
      } else {
        document.documentElement.classList.remove('dark')
        localStorage.setItem('patlang:darkMode', '0')
      }
    } catch {
      // ignore localStorage/document errors in restrictive environments
    }
  }, [darkMode])

  const theme = React.useMemo(() => buildTheme(darkMode ? 'dark' : 'light'), [darkMode])

  return (
    <ThemeContext.Provider value={{ darkMode, setDarkMode }}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  )
}

export default ThemeContext
