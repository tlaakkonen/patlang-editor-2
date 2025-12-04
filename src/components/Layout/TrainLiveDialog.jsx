import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import ValidationStep from './TrainSteps/ValidationStep'
import DimensionsStep from './TrainSteps/DimensionsStep'
import ArchitectureStep from './GenerateSteps/ArchitectureStep'
import EquationsStep from './GenerateSteps/EquationsStep'
import TrainStep from './TrainSteps/TrainStep'
import WizardStepper from './GenerateSteps/WizardStepper'
// step components contain their own UI imports
import { usePalette } from '../../state/PaletteContext'
import { set as idbSet, get as idbGet } from 'idb-keyval'
import mnistUrl1 from '../../assets/mnist1.bin'
import mnistUrl2 from '../../assets/mnist2.bin'

export default function TrainLiveDialog({ open, onClose }) {
  const { sections, findItemByType } = usePalette()
  const [validationErrors, setValidationErrors] = React.useState([])
  const [activeStep, setActiveStep] = React.useState(0)
  // per-step validity reported from child step components
  const [stepValidity, setStepValidity] = React.useState({})

  const wires = React.useMemo(() => (sections || []).find((s) => s.key === 'wires')?.items || [], [sections])
  const equations = React.useMemo(() => (sections || []).find((s) => s.key === 'equations')?.items || [], [sections])
  const learners = React.useMemo(() => {
    const boxes = (sections || []).find((s) => s.key === 'boxes')?.items || []
    return boxes.filter((b) => b?.kind === 'learner')
  }, [sections])
  const dataBoxes = React.useMemo(() => {
    const boxes = (sections || []).find((s) => s.key === 'boxes')?.items || []
    return boxes.filter((b) => b?.kind === 'data')
  }, [sections])

  // Controlled wizard state (no localStorage persistence)
  const DEFAULT_WIZARD = { 
    activeStep: 0,
    wireDims: {},
    wireSelects: {},
    wireOneHot: {},
    dataAssignments: {},
    learnerConfigs: {},
    outputLosses: {},
    outputLearners: {},
    outputWeights: {},
  };

  const [wizardState, setWizardState] = React.useState(DEFAULT_WIZARD)

  // MNIST download state: before the MNIST dataset is downloaded, the
  // Train step's Start button should be disabled. While downloading show
  // a modal progress indicator.
  const [mnistDownloading, setMnistDownloading] = React.useState(false)
  const [mnistAvailable, setMnistAvailable] = React.useState(false)
  const [mnistProgress, setMnistProgress] = React.useState(0)

  // Persist models while dialog is open and navigating steps; dispose on close
  const [liveModels, setLiveModels] = React.useState(null)
  const handleClose = React.useCallback(() => {
    try {
      const m = liveModels || {}
      for (const k of Object.keys(m)) {
        try { m[k]?.dispose && m[k].dispose() } catch {}
      }
    } catch {}
    setLiveModels(null)
    onClose && onClose()
  }, [liveModels, onClose])

  // On mount, check IndexedDB for an existing MNIST payload so availability
  // persists across page reloads / sessions.
  React.useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const stored = await idbGet('patlang:mnist')
        if (mounted && stored) setMnistAvailable(true)
      } catch (e) {
        console.error('Failed to read MNIST from IndexedDB', e)
      }
    })()
    return () => { mounted = false }
  }, [])

  // reconcile wizardState when wire types or learners change between open/close
  React.useEffect(() => {
    // build next-wire dims/selects preserving existing values where possible
    const nextWireDims = {}
    const nextWireSelects = {}
    const nextWireOneHot = {}
    for (const w of wires) {
      const existing = wizardState.wireDims?.[w.type]
      // default to empty selection (None) so the new UI can force the user to choose
      nextWireDims[w.type] = existing !== undefined ? existing : ''
      const sel = wizardState.wireSelects?.[w.type]
      if (sel !== undefined) {
        nextWireSelects[w.type] = sel
      } else {
        // DimensionsStep expects select values among: '', 'mnist-images', 'mnist-labels', 'custom'
        // Use the same MNIST dimension strings used in the DimensionsStep component
        const dim = nextWireDims[w.type]
        if (dim === '784') nextWireSelects[w.type] = 'mnist-images'
        else if (dim === '10') nextWireSelects[w.type] = 'mnist-labels'
        else if (dim === '' || dim === undefined) nextWireSelects[w.type] = ''
        else nextWireSelects[w.type] = 'custom'
      }
      const existingOne = wizardState.wireOneHot?.[w.type]
      nextWireOneHot[w.type] = existingOne !== undefined ? existingOne : false
    }

    // learner configs: keep existing keys, add defaults for new learners
    const nextLearnerConfigs = { ...(wizardState.learnerConfigs || {}) }
    for (const b of learners) {
      if (!nextLearnerConfigs[b.type]) nextLearnerConfigs[b.type] = { arch: 'Linear' }
    }

    // output learners: for each equation, default to all available learners
    // (so the EquationsStep shows everything selected AND the wizardState
    // reflects that default selection).
    const nextOutputLearners = { ...(wizardState.outputLearners || {}) }
    // compute available learners per equation using the same logic as
    // EquationsStep so defaults match the UI fallback there
    const diagramsSection = (sections || []).find((s) => s.key === 'diagrams')
    const boxesSection = (sections || []).find((s) => s.key === 'boxes')
    for (const eq of equations) {
      if (!nextOutputLearners[eq.type]) {
        const lhsDiagram = diagramsSection?.items?.find((d) => d.type === eq['lhs-type'])
        const rhsDiagram = diagramsSection?.items?.find((d) => d.type === eq['rhs-type'])
        const lhsNodesSet = new Set((lhsDiagram?.nodes || []).map((n) => n.data?.type))
        const rhsNodesSet = new Set((rhsDiagram?.nodes || []).map((n) => n.data?.type))
        const availableLearnersForEq = (boxesSection?.items || [])
          .filter((b) => b.kind === 'learner' && (lhsNodesSet.has(b.type) || rhsNodesSet.has(b.type)))
          .map((b) => b.type)
        nextOutputLearners[eq.type] = availableLearnersForEq
      }
    }

    // output weights: default to '1' for any missing equation weight
    const nextOutputWeights = { ...(wizardState.outputWeights || {}) }
    for (const eq of equations) {
      if (nextOutputWeights[eq.type] === undefined) nextOutputWeights[eq.type] = '1'
    }

    // output losses: keep any explicit user-configured values only; do not
    // auto-populate defaults here so that the EquationsStep component can
    // compute render-time defaults based on the current `oneHot` mapping.
    const nextOutputLosses = { ...(wizardState.outputLosses || {}) }

    // prune removed keys
    for (const k of Object.keys(wizardState.outputLearners || {})) {
      if (!equations.find((e) => e.type === k)) delete nextOutputLearners[k]
    }
    for (const k of Object.keys(wizardState.outputWeights || {})) {
      if (!equations.find((e) => e.type === k)) delete nextOutputWeights[k]
    }
    for (const k of Object.keys(wizardState.outputLosses || {})) {
      if (!equations.find((e) => e.type === k)) delete nextOutputLosses[k]
    }

    // prune removed keys
    for (const k of Object.keys(wizardState.wireDims || {})) {
      if (!wires.find((w) => w.type === k)) {
        delete nextWireDims[k]
        delete nextWireSelects[k]
        delete nextWireOneHot[k]
      }
    }
    for (const k of Object.keys(wizardState.learnerConfigs || {})) {
      if (!learners.find((b) => b.type === k)) delete nextLearnerConfigs[k]
    }

    // data assignments: for boxes with kind==='data', default to empty (no selection)
    const nextDataAssignments = { ...(wizardState.dataAssignments || {}) }
    for (const b of (boxesSection?.items || []).filter((bb) => bb.kind === 'data')) {
      if (nextDataAssignments[b.type] === undefined) nextDataAssignments[b.type] = ''
    }
    // prune removed data keys
    for (const k of Object.keys(nextDataAssignments)) {
      if (!(boxesSection?.items || []).find((bb) => bb.type === k && bb.kind === 'data')) delete nextDataAssignments[k]
    }

    // if changed, update
    const changed = JSON.stringify(nextWireDims) !== JSON.stringify(wizardState.wireDims) ||
      JSON.stringify(nextWireSelects) !== JSON.stringify(wizardState.wireSelects) ||
      JSON.stringify(nextWireOneHot) !== JSON.stringify(wizardState.wireOneHot) ||
      JSON.stringify(nextLearnerConfigs) !== JSON.stringify(wizardState.learnerConfigs) ||
      JSON.stringify(nextOutputLearners) !== JSON.stringify(wizardState.outputLearners) ||
      JSON.stringify(nextOutputWeights) !== JSON.stringify(wizardState.outputWeights) ||
      JSON.stringify(nextOutputLosses) !== JSON.stringify(wizardState.outputLosses) ||
      JSON.stringify(nextDataAssignments) !== JSON.stringify(wizardState.dataAssignments)
    if (changed) {
      setWizardState((s) => ({ ...s, wireDims: nextWireDims, wireSelects: nextWireSelects, wireOneHot: nextWireOneHot, learnerConfigs: nextLearnerConfigs, outputLearners: nextOutputLearners, outputWeights: nextOutputWeights, outputLosses: nextOutputLosses, dataAssignments: nextDataAssignments }))
    }
  }, [wires, learners, wizardState, equations, sections])

  // no localStorage persistence for wizardState

  // stepValidity will be set by child step components via onValidityChange

  // Ensure the wizard visible step resets to the first step when the
  // dialog is opened. Also sync this into `wizardState.activeStep` so
  // the two remain consistent when persisted in-memory while the
  // dialog stays mounted.
  React.useEffect(() => {
    if (open) {
      setActiveStep(0)
      setWizardState((w) => ({ ...w, activeStep: 0 }))
    }
  }, [open])

  // Architecture-specific state moved into ArchitectureStep

  const steps = ['Validation', 'Dimensions', 'Architecture', 'Equations', 'Train']

  // stable callbacks passed to child steps to avoid re-creating functions
  // on every render (which caused child effects to rerun and produced
  // update depth / setState-in-render errors).
  const dimsOnChange = React.useCallback((nextWireDims, nextWireSelects, nextWireOneHot) => {
    setWizardState((s) => ({ ...s, wireDims: nextWireDims, wireSelects: nextWireSelects, wireOneHot: nextWireOneHot || {} }))
  }, [])
  const dataOnChange = React.useCallback((nextDataAssignments) => {
    setWizardState((s) => ({ ...s, dataAssignments: nextDataAssignments || {} }))
  }, [])
  const dimsOnValidity = React.useCallback((valid) => setStepValidity((s) => ({ ...s, 1: valid })), [setStepValidity])
  const cfgOnChange = React.useCallback((nextLearnerConfigs) => {
    setWizardState((s) => ({ ...s, learnerConfigs: nextLearnerConfigs }))
  }, [])
  const cfgOnValidity = React.useCallback((valid) => setStepValidity((s) => ({ ...s, 2: valid })), [setStepValidity])
  const eqOnChange = React.useCallback((nextOutputLosses) => setWizardState((s) => ({ ...s, outputLosses: nextOutputLosses || {} })), [])
  const eqLearnersOnChange = React.useCallback((nextOutputLearners) => setWizardState((s) => ({ ...s, outputLearners: nextOutputLearners || {} })), [])
  const eqWeightsOnChange = React.useCallback((nextOutputWeights) => setWizardState((s) => ({ ...s, outputWeights: nextOutputWeights || {} })), [])

  // Validation for equations/diagrams is now handled by the ValidationStep
  // component which computes errors and reports them back via
  // `onValidationChange` so we only keep the `validationErrors` state here.

  const hasErrors = validationErrors.length > 0
  // Generic per-step advancement control. Steps report their own validity
  // via `stepValidity` using onValidityChange callbacks.
  const canAdvance = (step) => {
    // require at least one equation in the palette before allowing any advancement
    if (step === 0) return !hasErrors
    if (step === 1) return stepValidity[1] !== false
    if (step === 2) return stepValidity[2] !== false
    if (step === 3) return equations && equations.length > 0
    if (step === 4) return true
    return true
  }

  const handleNext = () => {
    // double-check before advancing
    if (!canAdvance(activeStep)) return
    // If we're leaving the Equations step, persist any render-time defaults
    // for output losses into wizardState so downstream code sees explicit
    // loss values. We compute defaults only where the user hasn't provided
    // a value yet (so we don't overwrite user choices).
    if (activeStep === 3) {
      const nextStep = Math.min(activeStep + 1, steps.length - 1)
      setWizardState((prev) => {
        const diagramsSection = (sections || []).find((s) => s.key === 'diagrams')
        const boxesSection = (sections || []).find((s) => s.key === 'boxes')
        const nextOutputLosses = { ...(prev.outputLosses || {}) }
        for (const eq of equations) {
          const lhsDiagram = diagramsSection?.items?.find((d) => d.type === eq['lhs-type'])
          const outputNodes = (lhsDiagram?.nodes || []).filter((n) => {
            const boxDef = boxesSection?.items?.find((b) => b.type === n.data?.type)
            return boxDef?.kind === 'output'
          })
          const perNode = { ...(nextOutputLosses[eq.type] || {}) }
          for (const node of outputNodes) {
            const boxDef = boxesSection?.items?.find((b) => b.type === node.data?.type) || {}
            const inputs = boxDef.inputs || []
            const nodeType = boxDef.type || node.data?.type
            const prevEq = prev.outputLosses?.[eq.type] || {}
            const prevNode = prevEq?.[nodeType] || {}
            const nodeMap = { ...(perNode[nodeType] || {}) }
            for (let idx = 0; idx < inputs.length; idx++) {
              const wireType = inputs[idx]
              const indexKey = idx
              if (prevNode && Object.prototype.hasOwnProperty.call(prevNode, indexKey) && prevNode[indexKey] !== undefined && prevNode[indexKey] !== null && prevNode[indexKey] !== '') {
                nodeMap[indexKey] = prevNode[indexKey]
              } else if (!Object.prototype.hasOwnProperty.call(nodeMap, indexKey) || nodeMap[indexKey] === undefined || nodeMap[indexKey] === null || nodeMap[indexKey] === '') {
                nodeMap[indexKey] = (prev.wireOneHot?.[wireType] ? 'CE' : 'L2')
              }
            }
            perNode[nodeType] = nodeMap
          }
          nextOutputLosses[eq.type] = perNode
        }
        return { ...prev, outputLosses: nextOutputLosses, activeStep: nextStep }
      })
      setActiveStep((s) => Math.min(s + 1, steps.length - 1))
      return
    }
    setActiveStep((s) => {
      const next = Math.min(s + 1, steps.length - 1)
      setWizardState((w) => ({ ...w, activeStep: next }))
      return next
    })
  }

  // Steps encapsulate their own change handlers; parent receives onChange
  // and onValidityChange callbacks.

  const handleBack = () => setActiveStep((s) => Math.max(s - 1, 0))

  // Trigger to download the MNIST dataset (demo: fetch a local example
  // Trigger to download the MNIST dataset using the static asset URL
  // imported via Vite. The file is binary Float32 little-endian data.
  // We deserialize it into a Float32Array (respecting little-endian)
  // and persist into IndexedDB.
  const handleDownloadMnist = React.useCallback(async () => {
    try {
      setMnistDownloading(true)
      setMnistProgress(0)

      // Fetch both parts and concat them. We use a simple two-step
      // fetch (first part, then second) and update progress to 50/100
      // to keep the UI responsive. This keeps the code simple and
      // avoids complex streaming merge logic.
      const parts = [mnistUrl1, mnistUrl2]
      const buffers = []

      for (let i = 0; i < parts.length; i++) {
        const resp = await fetch(parts[i])
        if (!resp.ok) throw new Error(`Failed to fetch MNIST part ${i + 1} (${resp.status})`)
        // Read as arrayBuffer (indeterminate progress per-part)
        const ab = await resp.arrayBuffer()
        buffers.push(ab)
        // update progress roughly (50% after first, 100% after second)
        setMnistProgress(Math.round(((i + 1) / parts.length) * 100))
      }

      // Concatenate ArrayBuffers into one Uint8Array
      let total = 0
      for (const b of buffers) total += b.byteLength
      const abAll = new Uint8Array(total)
      let offset = 0
      for (const b of buffers) {
        abAll.set(new Uint8Array(b), offset)
        offset += b.byteLength
      }

      if (abAll.byteLength % 4 !== 0) throw new Error('MNIST binary length is not a multiple of 4')
      const dv = new DataView(abAll.buffer)
      const len = abAll.byteLength / 4
      const floats = new Float32Array(len)
      for (let i = 0; i < len; i++) {
        floats[i] = dv.getFloat32(i * 4, true)
      }

      try {
        await idbSet('patlang:mnist', floats)
      } catch (e) {
        console.error('Failed to write MNIST to IndexedDB', e)
      }
      setMnistAvailable(true)
      setMnistProgress(100)
    } catch (e) {
      console.error('MNIST download failed', e)
      setMnistAvailable(false)
    } finally {
      setMnistDownloading(false)
    }
  }, [])

  return (
  <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md" keepMounted>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <Box component="span" sx={{ fontWeight: 500 }}>Train Live</Box>
        </Box>
        {/* Stepper moved to the dialog actions for bottom placement */}
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
          size="small"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Box sx={{ mt: 2 }}>
            {activeStep === 0 && (
              <ValidationStep
                sections={sections}
                findItemByType={findItemByType}
                open={open}
                onValidationChange={(errs) => setValidationErrors(errs)}
              />
            )}

            {activeStep === 1 && (
              <DimensionsStep
                wires={wires}
                open={open}
                value={wizardState.wireDims}
                selects={wizardState.wireSelects}
                oneHot={wizardState.wireOneHot}
                onChange={dimsOnChange}
                onValidityChange={dimsOnValidity}
                dataBoxes={dataBoxes}
                dataAssignments={wizardState.dataAssignments || {}}
                onDataAssignmentsChange={dataOnChange}
              />
            )}

            {activeStep === 2 && (
              <ArchitectureStep
                learners={learners}
                open={open}
                value={wizardState.learnerConfigs}
                onChange={cfgOnChange}
                onValidityChange={cfgOnValidity}
                validationErrors={validationErrors}
                showTransformer={false}
              />
            )}

            {activeStep === 3 && (
              <EquationsStep
                value={wizardState.outputLosses || {}}
                onChange={eqOnChange}
                oneHot={wizardState.wireOneHot || {}}
                learnersValue={wizardState.outputLearners || {}}
                learnersOnChange={eqLearnersOnChange}
                weightsValue={wizardState.outputWeights || {}}
                weightsOnChange={eqWeightsOnChange}
                allowSSIM={true}
                wireSelects={wizardState.wireSelects || {}}
              />
            )}
            {activeStep === 4 && (
              <TrainStep
                  wizardState={wizardState}
                  sections={sections}
                  mnistReady={mnistAvailable}
                  mnistDownloading={mnistDownloading}
                  onDownloadMnist={handleDownloadMnist}
                  modelsProp={liveModels}
                  onModelsChange={setLiveModels}
                />
            )}
          </Box>
        </Box>
      </DialogContent>
      <Divider sx={{ mt: 1 }} />
      {/* Progress modal while downloading MNIST */}
      <Dialog open={mnistDownloading} maxWidth="xs">
        <DialogTitle>Downloading MNIST</DialogTitle>
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'stretch' }}>
          {mnistProgress > 0 ? (
            <>
              <LinearProgress variant="determinate" value={mnistProgress} sx={{
                "& .MuiLinearProgress-bar": {
                    transition: "none"
                }
              }} />
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Typography variant="caption">{mnistProgress}%</Typography>
              </Box>
            </>
          ) : (
            <LinearProgress />
          )}
        </Box>
      </Dialog>
      <WizardStepper
        steps={steps}
        activeStep={activeStep}
        onBack={handleBack}
        onNext={handleNext}
        canAdvance={canAdvance}
      />
    </Dialog>
  )
}
