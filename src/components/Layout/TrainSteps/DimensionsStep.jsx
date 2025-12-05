import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'

const MNIST_IMAGE_DIM = '784'
const MNIST_LABEL_DIM = '10'
const OPTIONS = [
  { key: 'mnist-images', label: 'MNIST images', dim: MNIST_IMAGE_DIM, oneHot: false },
  { key: 'mnist-labels', label: 'MNIST labels', dim: MNIST_LABEL_DIM, oneHot: true },
  { key: 'custom', label: 'Custom' },
]

export default function DimensionsStep({ wires, value = {}, selects = {}, oneHot = {}, onChange, onValidityChange, dataBoxes = [], dataAssignments = {}, onDataAssignmentsChange }) {
  // Fully controlled component: render from `value` and `selects` props
  // and call `onChange(nextDims, nextSelects)` on user interactions.

  // compute validation errors from controlled value
  const wireErrors = React.useMemo(() => {
    const errs = {}
    for (const w of wires || []) {
        const raw = value?.[w.type]
        const cur = (raw === undefined || raw === null) ? '' : raw
        // determine the selected preset for this wire ('' | 'mnist-images' | 'mnist-labels' | 'custom')
        const rawSel = selects?.[w.type]
        const allowed = new Set(['', 'mnist-images', 'mnist-labels', 'custom'])
        const sel = (rawSel !== undefined && allowed.has(rawSel))
          ? rawSel
          : (cur === MNIST_IMAGE_DIM ? 'mnist-images' : (cur === MNIST_LABEL_DIM ? 'mnist-labels' : 'custom'))
        // Only validate numeric dimension for custom selections. For presets or None,
        // we avoid showing the per-wire numeric error message; overall validity
        // will still be computed elsewhere (e.g., ensuring no None selections remain).
        if (sel === 'custom') {
          const v = cur === '' ? NaN : parseFloat(cur)
          errs[w.type] = (!Number.isFinite(v) || v <= 0) ? 'Must be a number greater than 0' : ''
        } else {
          errs[w.type] = ''
        }
      }
    return errs
  }, [wires, value, selects])

  // compute selected option per wire and counts for MNIST presets
  const selectCounts = React.useMemo(() => {
    let img = 0
    let lbl = 0
    for (const w of wires || []) {
      const cur = (value?.[w.type] ?? '')
      // normalize select values: accept only our option keys, otherwise infer
      const rawSel = selects?.[w.type]
      const allowed = new Set(['', 'mnist-images', 'mnist-labels', 'custom'])
      const sel = (rawSel !== undefined && allowed.has(rawSel))
        ? rawSel
        : (cur === MNIST_IMAGE_DIM ? 'mnist-images' : (cur === MNIST_LABEL_DIM ? 'mnist-labels' : 'custom'))
      if (sel === 'mnist-images') img += 1
      if (sel === 'mnist-labels') lbl += 1
    }
    return { images: img, labels: lbl }
  }, [wires, value, selects])

  // compute allowed assignments for each data box based on its outputs
  const allowedMap = React.useMemo(() => {
    const map = {}
    const mnistAssigned = selectCounts.images === 1 && selectCounts.labels === 1
    for (const b of (dataBoxes || [])) {
      const outputs = b.outputs || []
      let okLabelled = false
      let okRandom = false
      let okRandomVector = false
      if (mnistAssigned) {
        // labelled: exactly two output wires, one maps to MNIST images and one to MNIST labels
        if (outputs.length === 2) {
          const hasImg = outputs.some((t) => (value?.[t] ?? '') === MNIST_IMAGE_DIM)
          const hasLbl = outputs.some((t) => (value?.[t] ?? '') === MNIST_LABEL_DIM)
          if (hasImg && hasLbl) okLabelled = true
        }
        // random: exactly one output wire and it maps to MNIST labels
        if (outputs.length === 1) {
          const only = outputs[0]
          if ((value?.[only] ?? '') === MNIST_LABEL_DIM) okRandom = true
        }
      }
      // Random Vector: allowed when the data box outputs exist and ALL are custom dimensions
      if (outputs.length >= 1) {
        const allCustom = outputs.every((t) => {
          const sel = selects?.[t]
          if (sel) return sel === 'custom'
          const dim = (value?.[t] ?? '')
          return dim !== MNIST_IMAGE_DIM && dim !== MNIST_LABEL_DIM && dim !== ''
        })
        if (allCustom) okRandomVector = true
      }
  map[b.type] = { labelled: okLabelled, random: okRandom, 'random-vector': okRandomVector }
    }
    return map
  }, [dataBoxes, value, selectCounts])

  // ensure assigned values remain valid: clear any invalid existing assignments
  React.useEffect(() => {
    if (!onDataAssignmentsChange) return
    const next = { ...(dataAssignments || {}) }
    let changed = false
    for (const b of (dataBoxes || [])) {
      const assigned = next[b.type]
      if (assigned && assigned !== '' && !allowedMap[b.type]?.[assigned]) {
        next[b.type] = ''
        changed = true
      }
    }
    if (changed) onDataAssignmentsChange(next)
  }, [allowedMap, dataBoxes, dataAssignments, onDataAssignmentsChange])

  // report aggregate validity whenever inputs change or dialog opens
  React.useEffect(() => {
  const dimsValid = Object.values(wireErrors).every((e) => !e)
  const requiresMnistLocal = Object.values(dataAssignments || {}).some((v) => v === 'labelled' || v === 'random')
  const mnistValid = !requiresMnistLocal || (selectCounts.images === 1 && selectCounts.labels === 1)
    const dataValid = (dataBoxes || []).every((b) => {
      const v = dataAssignments?.[b.type]
      return typeof v === 'string' && v.length > 0
    })
    // ensure no wire is left as None (empty select)
    const anyNone = (wires || []).some((w) => {
      const cur = (value?.[w.type] ?? '')
      const rawSel = selects?.[w.type]
      const allowed = new Set(['', 'mnist-images', 'mnist-labels', 'custom'])
      const sel = (rawSel !== undefined && allowed.has(rawSel))
        ? rawSel
        : (cur === MNIST_IMAGE_DIM ? 'mnist-images' : (cur === MNIST_LABEL_DIM ? 'mnist-labels' : 'custom'))
      return sel === ''
    })
  onValidityChange?.(dimsValid && mnistValid && dataValid && !anyNone)
  }, [wireErrors, selectCounts, dataBoxes, dataAssignments, selects, value, wires, onValidityChange])

  const handleWireDimChange = (type, raw) => {
    const next = { ...value, [type]: raw }
    onChange?.(next, selects, oneHot)
  }

  const handlePresetSelect = (type, selected) => {
    const nextSelects = { ...selects, [type]: selected }
    if (selected === 'custom') {
      // preserve current custom value (or empty)
      const current = value?.[type]
      const nextVal = (current === undefined || current === null) ? '' : current
      const next = { ...value, [type]: nextVal }
      onChange?.(next, nextSelects, oneHot)
      return
    }
    if (selected === '') {
      // None selected: clear the dimension and one-hot flag
      const next = { ...value, [type]: '' }
      const nextOneHot = { ...oneHot, [type]: false }
      onChange?.(next, nextSelects, nextOneHot)
      return
    }
    // preset MNIST options: enforce dimension and one-hot according to option
    const opt = OPTIONS.find((o) => o.key === selected)
    const next = { ...value, [type]: opt?.dim ?? '' }
    const nextOneHot = { ...oneHot, [type]: Boolean(opt?.oneHot) }
    onChange?.(next, nextSelects, nextOneHot)
  }

  const handleOneHotChange = (type, checked) => {
    const nextOneHot = { ...oneHot, [type]: checked }
    // propagate current dims/selects and the updated one-hot mapping
    onChange?.(value, selects, nextOneHot)
  }

  const handleDataAssignChange = (boxType, val) => {
    const next = { ...(dataAssignments || {}), [boxType]: val }
    onDataAssignmentsChange?.(next)
  }

  const requiresMnist = React.useMemo(() => (
    Object.values(dataAssignments || {}).some((v) => v === 'labelled' || v === 'random')
  ), [dataAssignments])
  const mnistValidRender = (!requiresMnist) || (selectCounts.images === 1 && selectCounts.labels === 1)
  const dataValidRender = (dataBoxes || []).every((b) => {
    const v = dataAssignments?.[b.type]
    return typeof v === 'string' && v.length > 0
  })

  const unassignedBoxes = (dataBoxes || []).filter((b) => !(dataAssignments?.[b.type] && dataAssignments[b.type] !== '')).map((b) => b.label || b.type)
  const invalidAssigned = (dataBoxes || []).filter((b) => {
    const assigned = dataAssignments?.[b.type]
    return assigned && assigned !== '' && !allowedMap[b.type]?.[assigned]
  }).map((b) => b.label || b.type)

  return (
    <Box sx={{ p: 2 }}>
      {(!mnistValidRender || !dataValidRender || invalidAssigned.length > 0) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {(!mnistValidRender) && (
            <div>Please assign exactly one wire to "MNIST images" and exactly one wire to "MNIST labels".</div>
          )}
          {unassignedBoxes.length > 0 && (
            <div>Please assign a data source to every data box. Unassigned: {unassignedBoxes.join(', ')}</div>
          )}
          {invalidAssigned.length > 0 && (
            <div>Some data boxes have invalid assignments: {invalidAssigned.join(', ')}. Adjust outputs or change the assignment.</div>
          )}
        </Alert>
      )}
      <Typography variant="subtitle1" sx={{ mb: 2 }}>Assign dimensions to each wire type:</Typography>

      {!wires || wires.length === 0 ? (
        <Alert severity="info">No wire types found in the palette. Add wires in the sidebar to continue.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {wires.map((w) => (
            <Box key={w.type} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 14,
                height: 14,
                borderRadius: 1,
                backgroundColor: w.color || 'transparent',
                mr: 1,
                border: w.color ? '1px solid rgba(0,0,0,0.12)' : 'none',
                pointerEvents: 'none',
              }} />
              <Typography variant="body2">{w.label || w.type}</Typography>

              <Box sx={{ flex: 1 }} />

              <Box sx={{ minWidth: 180, textAlign: 'right', mr: 1 }}>
                <Typography variant="caption" color={wireErrors[w.type] ? 'error.main' : 'text.secondary'}>
                  {wireErrors[w.type] || '\u00A0'}
                </Typography>
              </Box>

              {(() => {
                const cur = (value?.[w.type] ?? '')
                const selectVal = (selects?.[w.type] ?? (cur === MNIST_IMAGE_DIM ? 'mnist-images' : (cur === MNIST_LABEL_DIM ? 'mnist-labels' : 'custom')))
                return (
                  <>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                      <InputLabel id={`dim-select-${w.type}`} htmlFor={`dim-select-${w.type}-select`}>Type</InputLabel>
                      <Select
                        labelId={`dim-select-${w.type}`}
                        id={`dim-select-${w.type}-select`}
                        value={selectVal}
                        label="Type"
                        onChange={(e) => handlePresetSelect(w.type, e.target.value)}
                        sx={{ width: 180 }}
                      >
                        <MenuItem value=""><em>None</em></MenuItem>
                        {OPTIONS.map((o) => (
                          <MenuItem key={o.key} value={o.key}>{o.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {(selectVal === 'custom') && (
                      <TextField
                        label="Custom dimension"
                        type="number"
                        size="small"
                        value={cur}
                        onChange={(e) => handleWireDimChange(w.type, e.target.value)}
                        error={Boolean(wireErrors[w.type])}
                        sx={{ width: 140, ml: 1 }}
                      />
                    )}

                    <FormControlLabel
                      control={(
                        <Checkbox
                          size="small"
                          checked={Boolean(oneHot?.[w.type])}
                          onChange={(e) => handleOneHotChange(w.type, e.target.checked)}
                          disabled={selectVal !== 'custom'}
                        />
                      )}
                      label="One-hot"
                      sx={{ ml: 1 }}
                    />
                  </>
                )
              })()}
            </Box>
          ))}
          {/* Data boxes section */}
          {dataBoxes && dataBoxes.length > 0 && (
            <>
              <Divider sx={{ mt: 1, mb: 1 }} />
              <Typography variant="subtitle1">Assign a data source to each data box:</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {dataBoxes.map((b) => (
                  <Box key={b.type} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{
                      width: 14,
                      height: 14,
                      borderRadius: 1,
                      backgroundColor: b.color || 'transparent',
                      mr: 1,
                      border: b.color ? '1px solid rgba(0,0,0,0.12)' : 'none',
                      pointerEvents: 'none',
                    }} />
                    <Typography variant="body2">{b.label || b.type}</Typography>
                    <Box sx={{ flex: 1 }} />
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                      <InputLabel id={`data-assign-${b.type}`}>Assignment</InputLabel>
                      <Select
                        labelId={`data-assign-${b.type}`}
                        value={dataAssignments?.[b.type]}
                        label="Assignment"
                        onChange={(e) => handleDataAssignChange(b.type, e.target.value)}
                        sx={{ width: 180 }}
                      >
                          <MenuItem value=""><em>None</em></MenuItem>
                          <MenuItem value="labelled" disabled={!allowedMap[b.type]?.labelled}>Labelled Data</MenuItem>
                          <MenuItem value="random" disabled={!allowedMap[b.type]?.random}>Random Labels</MenuItem>
                          <MenuItem value="random-vector" disabled={!allowedMap[b.type]?.['random-vector']}>Random Vector</MenuItem>
                      </Select>
                    </FormControl>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  )

}

