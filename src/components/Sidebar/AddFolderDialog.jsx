import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'

// Dialog for creating/renaming a folder within a palette section.
// Props:
// - open: boolean
// - onClose: function(folder | null)
// - initialFolder: optional { id, name }
export default function AddFolderDialog({ open, onClose, initialFolder = null }) {
  const [name, setName] = React.useState('New folder')
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setName(initialFolder?.name ?? 'New folder')
      setError('')
    }
  }, [open, initialFolder])

  function validate(n) {
    const v = String(n || '').trim()
    if (!v) return 'Folder name is required'
    if (v.length > 100) return 'Folder name is too long'
    return ''
  }

  function handleCancel() {
    if (onClose) onClose(null)
  }

  function handleSave() {
    const msg = validate(name)
    if (msg) {
      setError(msg)
      return
    }
    const folder = {
      id: initialFolder?.id ?? `fld-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(name).trim(),
      createdAt: initialFolder?.createdAt ?? Date.now(),
    }
    if (onClose) onClose(folder)
  }

  return (
    <Dialog open={!!open} onClose={handleCancel} fullWidth maxWidth="xs">
      <DialogTitle>{initialFolder ? 'Rename Folder' : 'Add Folder'}</DialogTitle>
      <DialogContent>
        {/* Wrapper Box adds margin-top to create space below the title.
            This avoids a global rule that removes DialogContent top padding. */}
        <Box sx={{ mt: 1 }}>
          <TextField
            label="Folder name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
            size="small"
            error={!!error}
            helperText={error || ' '}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleSave} variant="contained">{initialFolder ? 'Save' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  )
}
