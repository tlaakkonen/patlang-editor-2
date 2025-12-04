import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { del as idbDel } from 'idb-keyval'

export default function ClearDialog({ open, onClose, onConfirm }) {
  async function handleClear() {
    if (onConfirm) {
      onConfirm()
      return
    }
    // default behavior: remove local storage key, delete MNIST from IndexedDB and reload
    try {
      localStorage.removeItem('patlang:v1')
    } catch {
      // ignore
    }
    try {
      await idbDel('patlang:mnist')
    } catch (e) {
      console.error('Failed to delete MNIST from IndexedDB', e)
    }
    onClose()
    // reload to ensure app re-initializes from defaults
    window.location.reload()
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Clear local data?</DialogTitle>
      <DialogContent>
        <Typography>This will remove all autosaved local data from your browser, not just the current diagram! The app will reload afterwards.</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={handleClear}>Clear</Button>
      </DialogActions>
    </Dialog>
  )
}
