import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'

const POW2_PRESETS = ['1', '2', '4', '8', '16', '32', '64', '128', '256', '512']

export default function DimensionsStep({ wires, value = {}, selects = {}, oneHot = {}, onChange, onValidityChange }) {
  // Fully controlled component: render from `value` and `selects` props
  // and call `onChange(nextDims, nextSelects)` on user interactions.

  // compute validation errors from controlled value
  const wireErrors = React.useMemo(() => {
    const errs = {}
    for (const w of wires || []) {
      const raw = value?.[w.type]
      const v = raw === '' || raw === undefined ? NaN : parseFloat(raw)
      errs[w.type] = (!Number.isFinite(v) || v <= 0) ? 'Must be a number greater than 0' : ''
    }
    return errs
  }, [wires, value])

  // report aggregate validity whenever inputs change or dialog opens
  React.useEffect(() => {
    const valid = Object.values(wireErrors).every((e) => !e)
    onValidityChange?.(valid)
  }, [wireErrors, onValidityChange])

  const handleWireDimChange = (type, raw) => {
    const next = { ...value, [type]: raw }
    onChange?.(next, selects, oneHot)
  }

  const handlePresetSelect = (type, selected) => {
    const nextSelects = { ...selects, [type]: selected }
    if (selected === 'custom') {
      const current = value?.[type]
      const nextVal = POW2_PRESETS.includes(String(current)) ? '' : (current ?? '')
      const next = { ...value, [type]: nextVal }
      onChange?.(next, nextSelects, oneHot)
      return
    }
    const next = { ...value, [type]: selected }
    onChange?.(next, nextSelects, oneHot)
  }

  const handleOneHotChange = (type, checked) => {
    const nextOneHot = { ...oneHot, [type]: checked }
    // propagate current dims/selects and the updated one-hot mapping
    onChange?.(value, selects, nextOneHot)
  }

  return (
    <Box sx={{ p: 2 }}>
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
                const selectVal = (selects?.[w.type] ?? (POW2_PRESETS.includes(String(cur)) ? String(cur) : (cur === '' ? '' : 'custom')))
                return (
                  <>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel id={`dim-select-${w.type}`} htmlFor={`dim-select-${w.type}-select`}>Dimension</InputLabel>
                      <Select
                        labelId={`dim-select-${w.type}`}
                        id={`dim-select-${w.type}-select`}
                        value={selectVal}
                        label="Dimension"
                        onChange={(e) => handlePresetSelect(w.type, e.target.value)}
                        sx={{ width: 140 }}
                      >
                        {POW2_PRESETS.map((p) => (
                          <MenuItem key={p} value={p}>{p}</MenuItem>
                        ))}
                        <MenuItem value="custom"><em>Custom...</em></MenuItem>
                      </Select>
                    </FormControl>

                        {(selectVal === 'custom') && (
                      <TextField
                        label="Custom"
                        type="number"
                        size="small"
                            value={cur}
                            onChange={(e) => handleWireDimChange(w.type, e.target.value)}
                        error={Boolean(wireErrors[w.type])}
                        sx={{ width: 120, ml: 1 }}
                      />
                    )}
                    <FormControlLabel
                      control={(
                        <Checkbox
                          size="small"
                          checked={Boolean(oneHot?.[w.type])}
                          onChange={(e) => handleOneHotChange(w.type, e.target.checked)}
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
        </Box>
      )}
    </Box>
  )

}

