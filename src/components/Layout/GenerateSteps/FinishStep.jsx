import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import { generatePython, generateNotebook } from '../../../utils/generateFiles'
import { isMobile, isIOS } from 'react-device-detect'

export default function FinishStep({ wizardState, sections }) {
  const downloadBlob = async (content, mimeType, filename) => {
    // Support modern file sharing (Web Share API) where available
    // and fall back to opening the blob URL on iOS Safari which
    // does not reliably honor the `download` attribute.
    const blob = new Blob([content || ''], { type: mimeType || 'application/octet-stream' })
    const fileName = filename || 'download'

    // Try Web Share API for files on mobile platforms (iOS/Android).
    // Avoid using Web Share on desktop even if the API exists there.
    try {
      // include iPads which sometimes report a desktop UA but are iOS devices
      if ((isMobile || isIOS) && navigator.share && navigator.canShare && typeof File !== 'undefined') {
        // Some browsers may throw when constructing File, guard with try/catch
        try {
          const file = new File([blob], fileName, { type: blob.type })
          if (navigator.canShare({ files: [file] })) {
            // Use native share dialog to let the user save to Files or another app
            try {
              await navigator.share({ files: [file], title: fileName })
              return
            } catch (shareErr) {
              // share can reject for many reasons (user cancels, permission denied, etc.)
              // If the user explicitly cancelled the share, do not fall back to downloading.
              const shareMsg = shareErr && (shareErr.message || String(shareErr))
              const shareName = shareErr && shareErr.name
              const isUserCancel = shareName === 'AbortError' || /cancel|abort/i.test(shareMsg || '')
              if (isUserCancel) {
                return
              }
            }
          }
        } catch {
          // ignore errors constructing File or testing navigator.canShare in restrictive browsers
        }
      }
    } catch {
      // ignore Web Share detection errors and fall back to downloading the blob
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    // revoke after a short delay
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const handleDownloadPython = async () => {
    // create a deep copy of `sections` at the time of button press
    const sectionsCopy = sections ? JSON.parse(JSON.stringify(sections)) : []
    let res;
    try {
        res = generatePython(wizardState, sectionsCopy)
    } catch (err) {
        alert(err.message ? err.message : String(err))
    }
    if (res === null) { return }
    // res: { content, mimeType, filename }
    await downloadBlob(res.content, res.mimeType, res.filename)
  }

  const handleDownloadNotebook = async () => {
    // create a deep copy of `sections` at the time of button press
    const sectionsCopy = sections ? JSON.parse(JSON.stringify(sections)) : []
    const res = generateNotebook(wizardState, sectionsCopy)
    if (res === null) { return }
    await downloadBlob(res.content, res.mimeType, res.filename)
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
