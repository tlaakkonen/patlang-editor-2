import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import InputLabel from '@mui/material/InputLabel'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import { SketchPicker } from 'react-color'

// Blank dialog for creating a wire item. Returns a default item on Add.
export default function AddWireDialog({ open, onClose, sectionKey, initialItem = null }) {
  const [label, setLabel] = React.useState('New Wire')
  const [color, setColor] = React.useState('#222222')
  const [colorAnchor, setColorAnchor] = React.useState(null)

  function hslToHex(h, s, l) {
    s /= 100
    l /= 100
    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2
    let r = 0
    let g = 0
    let b = 0
    if (0 <= h && h < 60) {
      r = c; g = x; b = 0
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c
    } else {
      r = c; g = 0; b = x
    }
    const toHex = (v) => {
      const R = Math.round((v + m) * 255)
      return R.toString(16).padStart(2, '0')
    }
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  function generateRandomColor() {
    // medium-high saturation and medium lightness for vibrant but not neon colors
    const h = Math.floor(Math.random() * 360)
    const s = Math.floor(Math.random() * 21) + 65 // 65-85%
    const l = Math.floor(Math.random() * 11) + 42 // 42-52%
    return hslToHex(h, s, l)
  }

  React.useEffect(() => {
    if (open) {
      // if editing, populate with initial values; otherwise reset to defaults
      setLabel(initialItem?.label ?? 'New Wire')
      setColor(initialItem?.color ?? generateRandomColor())
    }
    if (!open) setColorAnchor(null)
  }, [open, initialItem])

  function handleCancel() {
    onClose(null)
  }

  function handleAdd() {
    const newItem = {
      // preserve existing type when editing
      type: initialItem?.type ?? `${sectionKey || 'wires'}-wire-${Date.now()}`,
      label: label || 'New Wire',
      color: color || '#222222',
    }
    onClose(newItem)
  }

  return (
  <Dialog open={!!open} onClose={handleCancel} fullWidth maxWidth="sm">
      <DialogTitle>{initialItem ? 'Edit Wire' : 'Create Wire'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            fullWidth
            size="small"
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <InputLabel sx={{ fontSize: 13, color: 'text.secondary' }}>Color</InputLabel>
            <Box
              onClick={(e) => setColorAnchor(e.currentTarget)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                border: 1,
                borderColor: 'divider',
                cursor: 'pointer',
                backgroundColor: 'transparent',
              }}
              aria-label="color-swatch-frame"
            >
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: 0.5,
                  backgroundColor: color || 'transparent',
                  border: 1,
                  borderColor: 'divider',
                }}
              />
              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 13, color: 'text.primary' }}>{color}</Box>
            </Box>
            <Popover
              open={!!colorAnchor}
              anchorEl={colorAnchor}
              onClose={() => setColorAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            >
              <SketchPicker disableAlpha color={color} onChange={(c) => setColor(c.hex)} />
            </Popover>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleAdd} variant="contained">{initialItem ? 'Edit' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  )
}
