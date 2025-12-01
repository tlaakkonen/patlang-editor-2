import React from 'react'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import examples from '../../assets/examples'

export default function LoadDialog({ open, onClose, onImport }) {
  const [loadText, setLoadText] = React.useState('')
  const [loadError, setLoadError] = React.useState('')
  const [selectedExample, setSelectedExample] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setLoadText('')
      setLoadError('')
      setSelectedExample('')
    }
  }, [open])

  function handleChooseFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async (ev) => {
      const f = ev.target.files && ev.target.files[0]
      if (!f) return
      try {
        const text = await f.text()
        setLoadText(text)
        setLoadError('')
      } catch {
        setLoadError('Failed to read file')
      }
    }
    input.click()
  }

  function handleLoadExample(key) {
    const ex = examples.find((e) => e.key === key)
    if (!ex) return
    const parsed = ex.data
    setLoadText(JSON.stringify(parsed, null, 2))
    setLoadError('')
  }

  function handleApplyLoad() {
    if (!loadText) {
      setLoadError('No JSON to load')
      return
    }

    let parsed
    try {
      parsed = JSON.parse(loadText)
    } catch {
      setLoadError('This JSON is invalid')
      return
    }

    function isValidImport(obj) {
      if (!obj || typeof obj !== 'object') return false
      if (!('sections' in obj) || !('nodes' in obj) || !('edges' in obj)) return false
      const sections = obj.sections
      if (!Array.isArray(sections)) return false

      const requiredKeys = ['diagrams', 'wires', 'boxes']
      for (const key of requiredKeys) {
        const sec = sections.find((s) => s && s.key === key)
        if (!sec) return false
        if (!Array.isArray(sec.items)) return false
      }

      const diagramsSection = sections.find((s) => s && s.key === 'diagrams')
      if (!diagramsSection || !Array.isArray(diagramsSection.items)) return false
      const hasOpened = diagramsSection.items.some((d) => d && (d.opened === true || d.opened === 'true'))
      if (!hasOpened) return false

      return true
    }

    if (!isValidImport(parsed)) {
      setLoadError('This JSON is invalid')
      return
    }

    // At this point the JSON looks acceptable — call back to TopMenu
    if (onImport) onImport(parsed)
    setLoadError('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        Import JSON
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
        {/* Wrapper Box adds margin-top to create space below the title.
            This avoids fighting a global adjacent-sibling rule that sets
            DialogContent padding-top to zero. */}
        <Box sx={{ mt: 1.0 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
            <Button onClick={handleChooseFile} variant='outlined'>Choose file...</Button>
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <FormControl size="small" sx={{ minWidth: 180, mt: 1 }}>
              <InputLabel id="example-select-label">Example</InputLabel>
              <Select
                labelId="example-select-label"
                value={selectedExample}
                label="Example"
                onChange={(e) => setSelectedExample(e.target.value)}
              >
                <MenuItem value="">(none)</MenuItem>
                {examples.map((ex) => (
                  <MenuItem key={ex.key} value={ex.key}>{ex.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              disabled={!selectedExample}
              onClick={() => handleLoadExample(selectedExample)}
            >
              Load example
            </Button>
          </Stack>
        </Box>
        {loadError && <Typography color="error" sx={{ mb: 1 }}>{loadError}</Typography>}
        <TextField
          value={loadText}
          onChange={(e) => setLoadText(e.target.value)}
          multiline
          fullWidth
          minRows={10}
          variant="outlined"
          placeholder="Paste JSON here or choose a file"
          inputProps={{ spellCheck: 'false' }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => { setLoadText(''); setLoadError('') }}>Clear</Button>
        <Button onClick={handleApplyLoad} variant="contained">Load</Button>
      </DialogActions>
    </Dialog>
  )
}
