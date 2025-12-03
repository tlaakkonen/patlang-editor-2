import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'

export default function ArchitectureStep({ learners, value = {}, onChange, onValidityChange, validationErrors, showTransformer = true }) {
  // Fully controlled: render from `value` (learnerConfigs) and call
  // `onChange(updated)` when user edits fields. Compute validation
  // errors from `value` and report aggregate validity via
  // onValidityChange.

  const learnerErrors = React.useMemo(() => {
    const errs = {}
    for (const b of learners || []) {
      const cfg = value?.[b.type] || {}
      if (cfg.arch === 'MLP') {
        const mlp = cfg.mlp || {}
        const hlNum = parseInt(mlp.hiddenLayers, 10)
        const huNum = parseInt(mlp.hiddenUnits, 10)
        errs[b.type] = {
          hiddenLayers: (!Number.isFinite(hlNum) || hlNum < 1) ? 'Must be integer >= 1' : '',
          hiddenUnits: (!Number.isFinite(huNum) || huNum < 1) ? 'Must be integer >= 1' : '',
        }
      } else if (cfg.arch === 'Transformer') {
        const tr = cfg.transformer || {}
        const nl = parseInt(tr.numLayers, 10)
        const dm = parseInt(tr.dModel, 10)
        const nh = parseInt(tr.numHeads, 10)
        const df = parseInt(tr.dff, 10)
        const dp = parseFloat(tr.dropout)

        let dModelHeadError = ''
        if (Number.isFinite(dm) && Number.isFinite(nh) && nh > 0) {
          if (dm % nh !== 0) dModelHeadError = 'dModel must be divisible by numHeads'
        }

        errs[b.type] = {
          numLayers: (!Number.isFinite(nl) || nl < 1) ? 'Must be integer >= 1' : '',
          dModel: (!Number.isFinite(dm) || dm < 1) ? 'Must be integer >= 1' : dModelHeadError,
          numHeads: (!Number.isFinite(nh) || nh < 1) ? 'Must be integer >= 1' : '',
          dff: (!Number.isFinite(df) || df < 1) ? 'Must be integer >= 1' : '',
          dropout: (Number.isFinite(dp) ? (dp < 0 || dp > 1) : true) ? 'Must be number between 0 and 1' : '',
        }
      } else {
        errs[b.type] = { hiddenLayers: '', hiddenUnits: '' }
      }
    }
    return errs
  }, [learners, value])

  React.useEffect(() => {
    const valid = Object.values(learnerErrors).every((e) => Object.values(e).every((v) => !v))
    onValidityChange?.(valid)
  }, [learnerErrors, onValidityChange])

  // If the parent disables the Transformer option, clean up any existing
  // Transformer selections by clearing the arch and transformer config for
  // affected learners and notify the parent via onChange.
  React.useEffect(() => {
    if (!showTransformer) {
      let changed = false
      const next = { ...value }
      for (const b of learners || []) {
        const cfg = next[b.type] || {}
        if (cfg.arch === 'Transformer') {
          const newCfg = { ...cfg }
          if (newCfg.transformer) delete newCfg.transformer
          newCfg.arch = ''
          next[b.type] = newCfg
          changed = true
        }
      }
      if (changed) onChange?.(next)
    }
  }, [showTransformer, learners, value, onChange])

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>Configure the architecure for each learner:</Typography>

      {(() => {
        if (!learners.length) return <Alert severity="info">No learner boxes found in the palette.</Alert>

        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {learners.map((b, i) => {
              const learnerErrObj = learnerErrors[b.type] || {}
              const hasLearnerErr = Object.values(learnerErrObj).some(Boolean)
              const hasDiagErr = Boolean(validationErrors.find((err) => (err || '').includes(b.type) || (b.label && err && err.includes(b.label))))
              const hasError = hasLearnerErr || hasDiagErr
              return (
                <Accordion key={b.type} defaultExpanded={i === 0}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                      {hasError ? (
                        <ErrorOutlineIcon color="error" fontSize="small" sx={{ ml: 0 }} />
                      ) : null}
                      <Box sx={{
                        width: 14,
                        height: 14,
                        borderRadius: 1,
                        backgroundColor: b.color || 'transparent',
                        ml: hasError ? 0.5 : 0,
                        mr: 1,
                        border: b.color ? '1px solid rgba(0,0,0,0.12)' : 'none',
                        pointerEvents: 'none',
                      }} />
                      <Typography sx={{ fontWeight: 500 }}>{b.label || b.type}</Typography>
                      <Box sx={{ flex: 1 }} />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel id={`arch-select-label-${b.type}`} htmlFor={`arch-select-${b.type}`}>Architecture</InputLabel>
                        <Select
                          labelId={`arch-select-label-${b.type}`}
                          id={`arch-select-${b.type}`}
                          value={(value[b.type]?.arch) || ''}
                          label="Architecture"
                          onChange={(e) => {
                            const arch = e.target.value
                              const prev = value[b.type] || {}
                              const nextCfg = { ...prev, arch }
                            if (arch === 'MLP') {
                              if (!nextCfg.mlp) nextCfg.mlp = { hiddenLayers: '1', hiddenUnits: '64', activation: 'relu' }
                              if (nextCfg.transformer) delete nextCfg.transformer
                            } else if (arch === 'Transformer') {
                              if (!nextCfg.transformer) nextCfg.transformer = { numLayers: '6', dModel: '512', numHeads: '8', dff: '2048', dropout: '0.1' }
                              if (nextCfg.mlp) delete nextCfg.mlp
                            } else {
                              if (nextCfg.mlp) delete nextCfg.mlp
                              if (nextCfg.transformer) delete nextCfg.transformer
                            }
                              const updated = { ...value, [b.type]: nextCfg }
                              onChange?.(updated)
                          }}
                        >
                          <MenuItem value="Linear">Linear</MenuItem>
                          <MenuItem value="MLP">MLP</MenuItem>
                          {showTransformer && <MenuItem value="Transformer">Transformer</MenuItem>}
                        </Select>
                      </FormControl>

                          {value[b.type]?.arch === 'MLP' && (
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                          <TextField
                            label="Hidden layers"
                            type="number"
                            size="small"
                            value={value[b.type]?.mlp?.hiddenLayers ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), mlp: { ...(value[b.type]?.mlp || {}), hiddenLayers: v } } }
                              onChange?.(updated)
                              // learnerErrors is computed from value; validity will be
                              // reported via the effect that watches learnerErrors.
                            }}
                            error={Boolean(learnerErrors[b.type]?.hiddenLayers)}
                            helperText={learnerErrors[b.type]?.hiddenLayers || ' '}
                            sx={{ width: 160 }}
                          />

                          <TextField
                            label="Hidden units"
                            type="number"
                            size="small"
                            value={value[b.type]?.mlp?.hiddenUnits ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), mlp: { ...(value[b.type]?.mlp || {}), hiddenUnits: v } } }
                              onChange?.(updated)
                              // learnerErrors computed from value; validity reported
                            }}
                            error={Boolean(learnerErrors[b.type]?.hiddenUnits)}
                            helperText={learnerErrors[b.type]?.hiddenUnits || ' '}
                            sx={{ width: 160 }}
                          />

                          <TextField
                            select
                            size="small"
                            label="Activation"
                            value={value[b.type]?.mlp?.activation ?? 'relu'}
                            onChange={(e) => {
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), mlp: { ...(value[b.type]?.mlp || {}), activation: e.target.value } } }
                              onChange?.(updated)
                            }}
                            sx={{ width: 160 }}
                            helperText={' '}
                          >
                            <MenuItem value="relu">ReLU</MenuItem>
                            <MenuItem value="tanh">Tanh</MenuItem>
                            <MenuItem value="sigmoid">Sigmoid</MenuItem>
                          </TextField>
                        </Box>
                      )}

                      {value[b.type]?.arch === 'Transformer' && showTransformer && (
                        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                          <TextField
                            label="Encoder layers"
                            type="number"
                            size="small"
                            value={value[b.type]?.transformer?.numLayers ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), transformer: { ...(value[b.type]?.transformer || {}), numLayers: v } } }
                              onChange?.(updated)
                            }}
                            error={Boolean(learnerErrors[b.type]?.numLayers)}
                            helperText={learnerErrors[b.type]?.numLayers || ' '}
                            sx={{ width: 160 }}
                          />

                          <TextField
                            label="dModel"
                            type="number"
                            size="small"
                            value={value[b.type]?.transformer?.dModel ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), transformer: { ...(value[b.type]?.transformer || {}), dModel: v } } }
                              onChange?.(updated)
                            }}
                            error={Boolean(learnerErrors[b.type]?.dModel)}
                            helperText={learnerErrors[b.type]?.dModel || ' '}
                            sx={{ width: 140 }}
                          />

                          <TextField
                            label="Heads"
                            type="number"
                            size="small"
                            value={value[b.type]?.transformer?.numHeads ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), transformer: { ...(value[b.type]?.transformer || {}), numHeads: v } } }
                              onChange?.(updated)
                            }}
                            error={Boolean(learnerErrors[b.type]?.numHeads)}
                            helperText={learnerErrors[b.type]?.numHeads || ' '}
                            sx={{ width: 120 }}
                          />

                          <TextField
                            label="FF dim"
                            type="number"
                            size="small"
                            value={value[b.type]?.transformer?.dff ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), transformer: { ...(value[b.type]?.transformer || {}), dff: v } } }
                              onChange?.(updated)
                            }}
                            error={Boolean(learnerErrors[b.type]?.dff)}
                            helperText={learnerErrors[b.type]?.dff || ' '}
                            sx={{ width: 140 }}
                          />

                          {/* Transformer activation option intentionally removed from UI */}
                          <TextField
                            label="Dropout"
                            type="number"
                            inputProps={{ step: '0.01', min: '0', max: '1' }}
                            size="small"
                            value={value[b.type]?.transformer?.dropout ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              const updated = { ...value, [b.type]: { ...(value[b.type] || {}), transformer: { ...(value[b.type]?.transformer || {}), dropout: v } } }
                              onChange?.(updated)
                            }}
                            error={Boolean(learnerErrors[b.type]?.dropout)}
                            helperText={learnerErrors[b.type]?.dropout || ' '}
                            sx={{ width: 120 }}
                          />

                          
                        </Box>
                      )}
                    </Box>
                  </AccordionDetails>
                </Accordion>
              )
            })}
          </Box>
        )
      })()}
    </Box>
  )
}
