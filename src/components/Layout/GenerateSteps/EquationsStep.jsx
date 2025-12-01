import React from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Tooltip from '@mui/material/Tooltip'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { usePalette } from '../../../state/PaletteContext'

export default function EquationsStep({ value = {}, onChange, oneHot = {}, learnersValue = {}, learnersOnChange, weightsValue = {}, weightsOnChange }) {
  const { sections } = usePalette()
  const equations = React.useMemo(() => (sections || []).find((s) => s.key === 'equations')?.items || [], [sections])
  const wiresSection = React.useMemo(() => (sections || []).find((s) => s.key === 'wires')?.items || [], [sections])
  // controlled expanded state for accordions to avoid MUI warning about
  // changing defaultExpanded on uncontrolled Accordion after initialization
  const [expandedMap, setExpandedMap] = React.useState(() => {
    const init = {}
    for (let i = 0; i < equations.length; i++) {
      init[equations[i].type] = i === 0
    }
    return init
  })

  React.useEffect(() => {
    // reconcile expandedMap when equations array changes: preserve existing
    // values for known keys, add defaults for new ones (first item expanded)
    setExpandedMap((prev) => {
      const next = {}
      for (let i = 0; i < equations.length; i++) {
        const t = equations[i].type
        if (Object.prototype.hasOwnProperty.call(prev, t)) next[t] = prev[t]
        else next[t] = i === 0
      }
      return next
    })
  }, [equations])

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>Configure the loss function for each equation:</Typography>

      {!equations || equations.length === 0 ? (
        <Alert severity="error">No equations found in the palette. Add equations in the sidebar to continue.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {equations.map((eq, i) => {
            // find diagram and box sections and compute available learner types
            const diagramsSection = (sections || []).find((s) => s.key === 'diagrams')
            const boxesSection = (sections || []).find((s) => s.key === 'boxes')
            const lhsDiagram = diagramsSection?.items?.find((d) => d.type === eq['lhs-type'])
            const rhsDiagram = diagramsSection?.items?.find((d) => d.type === eq['rhs-type'])
            const outputNodes = (lhsDiagram?.nodes || []).filter((n) => {
              const boxDef = boxesSection?.items?.find((b) => b.type === n.data?.type)
              return boxDef?.kind === 'output'
            })
            const lhsNodesSet = new Set((lhsDiagram?.nodes || []).map((n) => n.data?.type))
            const rhsNodesSet = new Set((rhsDiagram?.nodes || []).map((n) => n.data?.type))
            const availableLearners = (boxesSection?.items || []).filter((b) => b.kind === 'learner' && (lhsNodesSet.has(b.type) || rhsNodesSet.has(b.type))).map((b) => ({ type: b.type, label: b.label, color: b.color }))
            const selectedTypes = learnersValue?.[eq.type] ?? availableLearners.map((a) => a.type)
            const selectedOptions = availableLearners.filter((a) => selectedTypes.includes(a.type))

            return (
              <Accordion
                key={eq.type}
                expanded={!!expandedMap[eq.type]}
                onChange={(_, isExpanded) => setExpandedMap((m) => ({ ...m, [eq.type]: isExpanded }))}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} component="div">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    {/* inline warning icon moved to the left of the equation title */}
                    {availableLearners.length === 0 ? (
                      <Tooltip title="No learners found in the LHS or RHS diagrams — the loss function will never decrease." onClick={(e) => e.stopPropagation()}>
                        <WarningAmberIcon color="warning" fontSize="small" sx={{ mr: 0.5 }} />
                      </Tooltip>
                    ) : (selectedOptions.length === 0 && (
                      <Tooltip title="No learners selected for training - the loss function will never decrease." onClick={(e) => e.stopPropagation()}>
                        <WarningAmberIcon color="warning" fontSize="small" sx={{ mr: 0.5 }} />
                      </Tooltip>
                    ))}

                    <Typography sx={{ fontWeight: 500 }}>{eq.label || eq.type}</Typography>
                    <Box sx={{ flex: 1 }} />

                    {/* numeric weight input for the equation */}
                    <TextField
                      size="small"
                      type="number"
                      inputProps={{ min: 0, step: 'any' }}
                      value={String(weightsValue?.[eq.type] ?? '1')}
                      onChange={(e) => {
                        const next = { ...(weightsValue || {}), [eq.type]: e.target.value }
                        weightsOnChange?.(next)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      sx={{ width: 96, mr: 1 }}
                      label="Weight"
                    />

                    {/* learners selector moved into header */}
                    {availableLearners.length > 0 ? (
                      <Box sx={{ minWidth: 300, mr: 2 }} onClick={(e) => e.stopPropagation()}>
                        <Autocomplete
                          multiple
                          options={availableLearners}
                          getOptionLabel={(o) => o.label || o.type}
                          value={selectedOptions}
                          onChange={(e, newVal) => {
                            const next = { ...(learnersValue || {}), [eq.type]: newVal.map((v) => v.type) }
                            learnersOnChange?.(next)
                          }}
                          renderOption={(props, option) => {
                            // getTagProps / renderOption may include a `key` property in the props
                            // which must not be spread into JSX. Extract it and pass an explicit key.
                            const optionProps = props || {}
                            const { key: _k, ...rest } = optionProps
                            return (
                              <li key={option.type} {...rest}>
                                <Box sx={{ width: 14, height: 14, borderRadius: 1, backgroundColor: option.color || 'transparent', mr: 1, border: option.color ? '1px solid rgba(0,0,0,0.12)' : 'none' }} />
                                <Box component="span">{option.label || option.type}</Box>
                              </li>
                            )
                          }}
                          renderValue={(tagValue, getTagProps) =>
                            tagValue.map((option, index) => {
                              const tagProps = getTagProps({ index }) || {}
                              const { key: _k, ...rest } = tagProps
                              return (
                                <Chip
                                  key={option.type}
                                  {...rest}
                                  size="small"
                                  label={(
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Box sx={{ width: 12, height: 12, borderRadius: 1, backgroundColor: option.color || 'transparent', border: option.color ? '1px solid rgba(0,0,0,0.12)' : 'none' }} />
                                      <Box component="span">{option.label || option.type}</Box>
                                    </Box>
                                  )}
                                />
                              )
                            })
                          }
                          renderInput={(params) => <TextField {...params} label="Trainable learners" size="small" />}
                        />
                      </Box>
                    ) : null}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {/* warnings moved to header as inline icons */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {outputNodes.map((node) => {
                      const boxDef = boxesSection?.items?.find((b) => b.type === node.data?.type) || {}
                      const inputs = boxDef.inputs || []
                      return (
                        <Box key={node.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1, borderRadius: 1, bgcolor: 'background.paper', border: '1px solid rgba(0,0,0,0.04)' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{
                              width: 14,
                              height: 14,
                              borderRadius: 1,
                              backgroundColor: boxDef.color || 'transparent',
                              mr: 1,
                              border: boxDef.color ? '1px solid rgba(0,0,0,0.12)' : 'none',
                              pointerEvents: 'none',
                            }} />
                            <Typography sx={{ fontWeight: 500 }}>{boxDef.label || boxDef.type || node.id}</Typography>
                            <Box sx={{ flex: 1 }} />
                          </Box>

                          {/* list inputs for this output node */}
                          <Divider sx={{ my: 1 }} />
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                            {inputs.map((wireType) => {
                              const wireDef = wiresSection.find((w) => w.type === wireType) || {}
                              // display either the persisted selection or a sensible default
                              // default: L2, unless the wire type is one-hot -> use BCE (cross-entropy)
                              const persisted = value?.[eq.type]?.[node.id]?.[wireType]
                              const current = persisted !== undefined && persisted !== null && persisted !== ''
                                ? persisted
                                : (oneHot?.[wireType] ? 'CE' : 'L2')
                              return (
                                <Box key={wireType} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: 1,
                                    backgroundColor: wireDef.color || 'transparent',
                                    mr: 1,
                                    border: wireDef.color ? '1px solid rgba(0,0,0,0.12)' : 'none',
                                    pointerEvents: 'none',
                                  }} />
                                  <Typography variant="body2">{wireDef.label || wireDef.type}</Typography>
                                  <Box sx={{ flex: 1 }} />
                                  <FormControl size="small" sx={{ minWidth: 140 }}>
                                    <InputLabel id={`loss-select-${eq.type}-${node.id}-${wireType}`}>Loss</InputLabel>
                                    <Select
                                      labelId={`loss-select-${eq.type}-${node.id}-${wireType}`}
                                      id={`loss-select-${eq.type}-${node.id}-${wireType}`}
                                      value={current}
                                      label="Loss"
                                      onChange={(e) => {
                                        const selected = e.target.value
                                        const prevEq = value?.[eq.type] || {}
                                        const prevNode = prevEq?.[node.id] || {}
                                        const nextNode = { ...prevNode, [wireType]: selected }
                                        const nextEq = { ...prevEq, [node.id]: nextNode }
                                        const updated = { ...(value || {}), [eq.type]: nextEq }
                                        onChange?.(updated)
                                      }}
                                    >
                                      <MenuItem value="L2">L2</MenuItem>
                                      <MenuItem value="SSIM">SSIM</MenuItem>
                                      <MenuItem value="BCE">Binary CE</MenuItem>
                                      <MenuItem value="CE">Cross-entropy</MenuItem>
                                    </Select>
                                  </FormControl>
                                </Box>
                              )
                            })}
                          </Box>
                          
                        </Box>
                      )
                    })}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
