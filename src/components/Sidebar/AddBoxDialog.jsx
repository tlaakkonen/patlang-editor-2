import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import InputLabel from '@mui/material/InputLabel'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import DeleteIcon from '@mui/icons-material/Delete'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { usePalette } from '../../state/PaletteContext'
import FormControl from '@mui/material/FormControl'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormHelperText from '@mui/material/FormHelperText'
import Divider from '@mui/material/Divider'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import { SketchPicker } from 'react-color'

// Dialog for creating/editing a box item. Returns the configured item on Add.
export default function AddBoxDialog({ open, onClose, sectionKey, initialItem = null }) {
  const [label, setLabel] = React.useState('New Box')
  const [color, setColor] = React.useState('#dddddd')
  const [colorAnchor, setColorAnchor] = React.useState(null)
  const [kind, setKind] = React.useState('Learner')
  const [inputs, setInputs] = React.useState(initialItem?.inputs ?? [])
  const [outputs, setOutputs] = React.useState(initialItem?.outputs ?? [])
  const [dragOverInputs, setDragOverInputs] = React.useState(false)
  const [dragOverOutputs, setDragOverOutputs] = React.useState(false)
  const { sections, nodes } = usePalette()

  React.useEffect(() => {
    if (open) {
      setLabel(initialItem?.label ?? 'New Box')
      setColor(initialItem?.color ?? generateRandomColor())
      setKind(initialItem?.kind ?? 'learner')
      setInputs(initialItem?.inputs ?? [])
      setOutputs(initialItem?.outputs ?? [])
    }
    if (!open) setColorAnchor(null)
  }, [open, initialItem])

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
    const h = Math.floor(Math.random() * 360)
    const s = Math.floor(Math.random() * 21) + 65 // 65-85%
    const l = Math.floor(Math.random() * 11) + 42 // 42-52%
    return hslToHex(h, s, l)
  }

  const isTypeUsed = React.useMemo(() => {
    if (!initialItem?.type) return false
    // check current canvas nodes
    const inCanvas = (nodes || []).some((n) => n.data?.type === initialItem.type)
    // check any diagrams stored in the 'diagrams' section — each diagram item may have its own nodes array
    const diagSection = (sections || []).find((s) => s.key === 'diagrams')
    const diagrams = diagSection?.items || []
    const inDiagrams = diagrams.some((d) => (d.nodes || []).some((n) => n.data?.type === initialItem.type))
    return inCanvas || inDiagrams
  }, [initialItem, nodes, sections])
  const editablePorts = !isTypeUsed
  // additionally, some kinds should lock a specific side:
  // - kind === 'data'  -> inputs should not be editable
  // - kind === 'output' -> outputs should not be editable
  const editableInputs = editablePorts && kind !== 'data'
  const editableOutputs = editablePorts && kind !== 'output'

  function handleCancel() {
    onClose(null)
  }

  function handleAdd() {
    const finalInputs = isTypeUsed && initialItem ? (initialItem.inputs || []) : (inputs || [])
    const finalOutputs = isTypeUsed && initialItem ? (initialItem.outputs || []) : (outputs || [])

    const newItem = {
      type: initialItem?.type ?? `${sectionKey || 'boxes'}-box-${Date.now()}`,
      label: label || 'New Box',
      color: color || '#dddddd',
      kind: kind || 'Learner',
      inputs: finalInputs,
      outputs: finalOutputs,
    }
    onClose(newItem)
  }

  // available wire types from palette
  const wireSection = sections?.find((s) => s.key === 'wires')
  const wireTypes = wireSection?.items || []

  function onSwatchDragStart(e, type) {
    e.dataTransfer.setData('application/x-wire-type', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function onItemDragStart(e, side, index) {
    e.dataTransfer.setData('application/x-wire-reorder', JSON.stringify({ side, index }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDropOnInputs(e) {
    e.preventDefault()
    const t = e.dataTransfer.getData('application/x-wire-type')
    const reorder = e.dataTransfer.getData('application/x-wire-reorder')
    if (reorder) {
      const { side, index } = JSON.parse(reorder)
      if (side === 'inputs') {
        // reorder within inputs to end
        setInputs((prev) => {
          const next = [...prev]
          const [moved] = next.splice(index, 1)
          next.push(moved)
          return next
        })
      }
    } else if (t) setInputs((prev) => [...prev, t])
    setDragOverInputs(false)
  }

  function handleDropOnOutputs(e) {
    e.preventDefault()
    const t = e.dataTransfer.getData('application/x-wire-type')
    const reorder = e.dataTransfer.getData('application/x-wire-reorder')
    if (reorder) {
      const { side, index } = JSON.parse(reorder)
      if (side === 'outputs') {
        // reorder within outputs to end
        setOutputs((prev) => {
          const next = [...prev]
          const [moved] = next.splice(index, 1)
          next.push(moved)
          return next
        })
      }
    } else if (t) setOutputs((prev) => [...prev, t])
    setDragOverOutputs(false)
  }

  function handleRemoveInput(index) {
    setInputs((prev) => prev.filter((_, i) => i !== index))
  }

  function handleRemoveOutput(index) {
    setOutputs((prev) => prev.filter((_, i) => i !== index))
  }

  function handleItemDrop(e, targetSide, targetIndex) {
    e.preventDefault()
    const reorder = e.dataTransfer.getData('application/x-wire-reorder')
    const t = e.dataTransfer.getData('application/x-wire-type')
    if (reorder) {
      const { side: srcSide, index: srcIndex } = JSON.parse(reorder)
      // same side reordering
      if (srcSide === targetSide) {
        if (srcSide === 'inputs') {
          setInputs((prev) => {
            const next = [...prev]
            const [moved] = next.splice(srcIndex, 1)
            let insertAt = targetIndex
            // if removing earlier index shifts target
            if (srcIndex < targetIndex) insertAt--
            next.splice(insertAt, 0, moved)
            return next
          })
        } else {
          setOutputs((prev) => {
            const next = [...prev]
            const [moved] = next.splice(srcIndex, 1)
            let insertAt = targetIndex
            if (srcIndex < targetIndex) insertAt--
            next.splice(insertAt, 0, moved)
            return next
          })
        }
      }
    } else if (t) {
      // palette drop onto a specific position
      if (targetSide === 'inputs') {
        setInputs((prev) => {
          const next = [...prev]
          next.splice(targetIndex, 0, t)
          return next
        })
      } else {
        setOutputs((prev) => {
          const next = [...prev]
          next.splice(targetIndex, 0, t)
          return next
        })
      }
    }
  }

  return (
  <Dialog open={!!open} onClose={handleCancel} fullWidth maxWidth="md">
      <DialogTitle>{initialItem ? 'Edit Box' : 'Create Box'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField label="Label" value={label} onChange={(e) => setLabel(e.target.value)} fullWidth size="small" />
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

          <Divider sx={{ my: 1 }} />

          {/* kind selector (was accidentally removed) */}
          <FormControl size="small" fullWidth>
            <InputLabel id="kind-label" sx={{ fontSize: 13 }}>Kind</InputLabel>
            <Select
              labelId="kind-label"
              value={kind}
              label="Kind"
              onChange={(e) => setKind(e.target.value)}
            >
              <MenuItem value="learner">Learner</MenuItem>
              <MenuItem
                value="data"
                disabled={inputs.length > 0}
              >
                Data
              </MenuItem>
              <MenuItem value="fixed">Fixed</MenuItem>
              <MenuItem
                value="output"
                disabled={outputs.length > 0}
              >
                Output
              </MenuItem>
            </Select>
            {(inputs.length > 0 || outputs.length > 0) && (
              <FormHelperText>
                {inputs.length > 0 && 'Cannot set kind to "Data" while inputs exist.'}
                {inputs.length > 0 && outputs.length > 0 && ' '}
                {outputs.length > 0 && 'Cannot set kind to "Output" while outputs exist.'}
              </FormHelperText>
            )}
          </FormControl>

          {/* Drag palette + inputs/outputs editor */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            {/* palette of wire types */}
            <Paper variant="outlined" sx={{ width: 160, p: 1 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Types</Typography>
              <List dense>
                {wireTypes.length === 0 && <ListItem><ListItemText primary="(no wire types)" /></ListItem>}
                {wireTypes.map((w) => (
                  <ListItem
                    key={w.type}
                    draggable
                    onDragStart={(e) => onSwatchDragStart(e, w.type)}
                    sx={{ cursor: 'grab', alignItems: 'center' }}
                  >
                    <Box sx={{ width: 20, height: 20, borderRadius: 1, background: w.color, mr: 1 }} />
                    <ListItemText primary={w.label || w.type} />
                  </ListItem>
                ))}
              </List>
            </Paper>

            {/* inputs and outputs columns */}
            <Box sx={{ display: 'flex', flex: 1, gap: 2 }}>
              <Paper
                variant="outlined"
                sx={{ flex: 1, p: 1, minHeight: 120, borderStyle: dragOverInputs ? 'dashed' : 'solid', opacity: editableInputs ? 1 : 0.6 }}
                {...(editableInputs
                  ? {
                      onDragOver: (e) => e.preventDefault(),
                      onDragEnter: () => setDragOverInputs(true),
                      onDragLeave: () => setDragOverInputs(false),
                      onDrop: handleDropOnInputs,
                    }
                  : {}
                )}
              >
                <Typography variant="subtitle2">INPUTS</Typography>
                {!editableInputs && (
                  <Typography variant="caption" color="text.secondary">
                    {isTypeUsed ? 'Cannot edit while this box type exists in a diagram or on the canvas.' : (kind === 'data' ? 'Data boxes may not have inputs.' : 'Cannot edit inputs.')}
                  </Typography>
                )}
                <List dense>
                  {inputs.map((t, i) => {
                    const w = wireTypes.find((x) => x.type === t)
                    return (
                      <ListItem
                        key={`${t}-${i}`}
                        draggable={editableInputs}
                        onDragStart={(e) => editableInputs && onItemDragStart(e, 'inputs', i)}
                        onDragOver={(e) => editableInputs && e.preventDefault()}
                        onDrop={(e) => editableInputs && handleItemDrop(e, 'inputs', i)}
                        secondaryAction={<IconButton edge="end" size="small" onClick={() => handleRemoveInput(i)} disabled={!editableInputs}><DeleteIcon fontSize="small" /></IconButton>}
                        sx={{ cursor: editableInputs ? 'grab' : 'default', alignItems: 'center' }}
                      >
                        <Box sx={{ width: 14, height: 14, background: w?.color || 'transparent', borderRadius: 1, mr: 1 }} />
                        <ListItemText primary={w?.label || t} />
                      </ListItem>
                    )
                  })}
                </List>
              </Paper>

              <Paper
                variant="outlined"
                sx={{ flex: 1, p: 1, minHeight: 120, borderStyle: dragOverOutputs ? 'dashed' : 'solid', opacity: editableOutputs ? 1 : 0.6 }}
                {...(editableOutputs
                  ? {
                      onDragOver: (e) => e.preventDefault(),
                      onDragEnter: () => setDragOverOutputs(true),
                      onDragLeave: () => setDragOverOutputs(false),
                      onDrop: handleDropOnOutputs,
                    }
                  : {}
                )}
              >
                <Typography variant="subtitle2">OUTPUTS</Typography>
                {!editableOutputs && (
                  <Typography variant="caption" color="text.secondary">
                    {isTypeUsed ? 'Cannot edit while this box type exists in a diagram or on the canvas.' : (kind === 'output' ? 'Output boxes may not have outputs.' : 'Cannot edit outputs.')}
                  </Typography>
                )}
                <List dense>
                  {outputs.map((t, i) => {
                    const w = wireTypes.find((x) => x.type === t)
                    return (
                      <ListItem
                        key={`${t}-${i}`}
                        draggable={editableOutputs}
                        onDragStart={(e) => editableOutputs && onItemDragStart(e, 'outputs', i)}
                        onDragOver={(e) => editableOutputs && e.preventDefault()}
                        onDrop={(e) => editableOutputs && handleItemDrop(e, 'outputs', i)}
                        secondaryAction={<IconButton edge="end" size="small" onClick={() => handleRemoveOutput(i)} disabled={!editableOutputs}><DeleteIcon fontSize="small" /></IconButton>}
                        sx={{ cursor: editableOutputs ? 'grab' : 'default', alignItems: 'center' }}
                      >
                        <Box sx={{ width: 14, height: 14, background: w?.color || 'transparent', borderRadius: 1, mr: 1 }} />
                        <ListItemText primary={w?.label || t} />
                      </ListItem>
                    )
                  })}
                </List>
              </Paper>
            </Box>
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
