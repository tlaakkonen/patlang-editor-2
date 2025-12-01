import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import { generatePython, generateNotebook } from '../../../utils/generateFiles'

export default function FinishStep({ wizardState, sections }) {
  const downloadBlob = (content, mimeType, filename) => {
    const blob = new Blob([content || ''], { type: mimeType || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || 'download'
    document.body.appendChild(a)
    a.click()
    a.remove()
    // revoke after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const handleDownloadPython = () => {
    // create a deep copy of `sections` at the time of button press
    const sectionsCopy = sections ? JSON.parse(JSON.stringify(sections)) : []
    const res = generatePython(wizardState, sectionsCopy)
    // res: { content, mimeType, filename }
    downloadBlob(res.content, res.mimeType, res.filename)
  }

  const handleDownloadNotebook = () => {
    // create a deep copy of `sections` at the time of button press
    const sectionsCopy = sections ? JSON.parse(JSON.stringify(sections)) : []
    const res = generateNotebook(wizardState, sectionsCopy)
    downloadBlob(res.content, res.mimeType, res.filename)
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>Configuration complete</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Use the buttons below to download the generated Python file or a Jupyter notebook.
      </Typography>

      <Divider sx={{ my: 2 }} />

      <Stack direction="row" spacing={2}>
        <Button variant="contained" color="primary" onClick={handleDownloadNotebook}>
          Download Notebook
        </Button>
        <Button variant="outlined" color="primary" onClick={handleDownloadPython}>
          Download Python
        </Button>
      </Stack>
    </Box>
  )
}
