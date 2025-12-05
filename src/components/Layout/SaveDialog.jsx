import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import CloseIcon from '@mui/icons-material/Close'

export default function SaveDialog({ open, onClose, sections, nodes, edges }) {
  const [jsonText, setJsonText] = React.useState('')
  const [fileName, setFileName] = React.useState('patlang-export')

  React.useEffect(() => {
    if (!open) return
    const payload = { sections: sections || [], nodes: nodes || [], edges: edges || [] }
    setJsonText(JSON.stringify(payload, null, 2))
  }, [open, sections, nodes, edges])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jsonText)
    } catch {
      // ignore
    }
  }

  function handleDownload() {
    const blob = new Blob([jsonText], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // ensure we don't include an extension in the text field; append .json
    const base = (fileName || 'patlang-export').replace(/\.[^/.]+$/, '')
    a.download = `${base}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Export JSON
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TextField
          value={jsonText}
          multiline
          fullWidth
          minRows={10}
          variant="outlined"
          slotProps={{ input: { readOnly: true } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCopy}>Copy to clipboard</Button>
        <Box sx={{ flex: 1 }} />
        <TextField
          label="Filename"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          size="small"
          sx={{ mr: 1, width: 220 }}
        />
        <Button onClick={handleDownload} variant="outlined">Download</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
