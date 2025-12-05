import React from 'react'
import Box from '@mui/material/Box'
import TopMenu from './TopMenu'

export default function Layout({ sidebar, children }) {
  const MIN_WIDTH = 300
  const [sidebarWidth, setSidebarWidth] = React.useState(MIN_WIDTH)
  const draggingRef = React.useRef(false)
  const startXRef = React.useRef(0)
  const startWidthRef = React.useRef(MIN_WIDTH)

  React.useEffect(() => {
    function onMouseMove(e) {
      if (!draggingRef.current) return
      const delta = e.clientX - startXRef.current
      const maxWidth = Math.max(MIN_WIDTH, (window.innerWidth || 0) - 240) // leave some space for canvas
      const next = Math.max(MIN_WIDTH, Math.min(startWidthRef.current + delta, maxWidth))
      setSidebarWidth(next)
    }
    function onMouseUp() {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  function onResizeStart(e) {
    draggingRef.current = true
    startXRef.current = e.clientX
    startWidthRef.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>
      <Box
        component="header"
        sx={{
          flexShrink: 0,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <TopMenu />
      </Box>

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box
          component="aside"
          sx={{
            width: sidebarWidth,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            overflow: 'auto',
          }}
        >
          {sidebar}
        </Box>
        {/* Vertical resize handle */}
        <Box
          onMouseDown={onResizeStart}
          title="Resize sidebar"
          role="separator"
          aria-orientation="vertical"
          sx={{
            width: 3,
            height: '100%',
            alignSelf: 'center',
            cursor: 'col-resize'
          }}
        />
        <Box
          component="main"
          sx={{ flex: 1, p: 2, bgcolor: 'background.default', overflow: 'hidden' }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}
