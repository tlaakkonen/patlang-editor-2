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

export default function ArchitectureStep({ learners, value = {}, onChange, onValidityChange, validationErrors }) {
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
                            } else {
                              if (nextCfg.mlp) delete nextCfg.mlp
                            }
                              const updated = { ...value, [b.type]: nextCfg }
                              onChange?.(updated)
                          }}
                        >
                          <MenuItem value="Linear">Linear</MenuItem>
                          <MenuItem value="MLP">MLP</MenuItem>
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
