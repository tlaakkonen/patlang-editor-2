import React from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import CloseIcon from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import ValidationStep from './GenerateSteps/ValidationStep'
import DimensionsStep from './GenerateSteps/DimensionsStep'
import ArchitectureStep from './GenerateSteps/ArchitectureStep'
import EquationsStep from './GenerateSteps/EquationsStep'
import FinishStep from './GenerateSteps/FinishStep'
import WizardStepper from './GenerateSteps/WizardStepper'
// step components contain their own UI imports
import { usePalette } from '../../state/PaletteContext'
// validation logic moved into ValidationStep; helpers are imported there

export default function GenerateCodeDialog({ open, onClose }) {
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

  // Controlled wizard state (no localStorage persistence)
  const DEFAULT_WIZARD = { 
    activeStep: 0,
    wireDims: {},
    wireSelects: {},
    wireOneHot: {},
    learnerConfigs: {},
    outputLosses: {},
    outputLearners: {},
    outputWeights: {},
  };

  const [wizardState, setWizardState] = React.useState(DEFAULT_WIZARD)

  // reconcile wizardState when wire types or learners change between open/close
  React.useEffect(() => {
    // build next-wire dims/selects preserving existing values where possible
    const nextWireDims = {}
    const nextWireSelects = {}
    const nextWireOneHot = {}
    for (const w of wires) {
      const existing = wizardState.wireDims?.[w.type]
      nextWireDims[w.type] = existing !== undefined ? existing : '1'
      const sel = wizardState.wireSelects?.[w.type]
      if (sel !== undefined) nextWireSelects[w.type] = sel
      else nextWireSelects[w.type] = (['1','2','4','8','16','32','64','128','256','512'].includes(String(nextWireDims[w.type])) ? String(nextWireDims[w.type]) : (nextWireDims[w.type] === '' ? '' : 'custom'))
      const existingOne = wizardState.wireOneHot?.[w.type]
      nextWireOneHot[w.type] = existingOne !== undefined ? existingOne : false
    }

    // learner configs: keep existing keys, add defaults for new learners
    const nextLearnerConfigs = { ...(wizardState.learnerConfigs || {}) }
    for (const b of learners) {
      if (!nextLearnerConfigs[b.type]) nextLearnerConfigs[b.type] = { arch: 'Linear' }
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

    // if changed, update
    const changed = JSON.stringify(nextWireDims) !== JSON.stringify(wizardState.wireDims) ||
      JSON.stringify(nextWireSelects) !== JSON.stringify(wizardState.wireSelects) ||
      JSON.stringify(nextWireOneHot) !== JSON.stringify(wizardState.wireOneHot) ||
      JSON.stringify(nextLearnerConfigs) !== JSON.stringify(wizardState.learnerConfigs)
    if (changed) {
      setWizardState((s) => ({ ...s, wireDims: nextWireDims, wireSelects: nextWireSelects, wireOneHot: nextWireOneHot, learnerConfigs: nextLearnerConfigs }))
    }
  }, [wires, learners, wizardState])

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

  const steps = ['Validation', 'Dimensions', 'Architecture', 'Equations', 'Finish']

  // stable callbacks passed to child steps to avoid re-creating functions
  // on every render (which caused child effects to rerun and produced
  // update depth / setState-in-render errors).
  const dimsOnChange = React.useCallback((nextWireDims, nextWireSelects, nextWireOneHot) => {
    setWizardState((s) => ({ ...s, wireDims: nextWireDims, wireSelects: nextWireSelects, wireOneHot: nextWireOneHot || {} }))
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
    setActiveStep((s) => {
      const next = Math.min(s + 1, steps.length - 1)
      setWizardState((w) => ({ ...w, activeStep: next }))
      return next
    })
  }

  // Steps encapsulate their own change handlers; parent receives onChange
  // and onValidityChange callbacks.

  const handleBack = () => setActiveStep((s) => Math.max(s - 1, 0))

  return (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" keepMounted>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <Box component="span" sx={{ fontWeight: 500 }}>Generate Code</Box>
        </Box>
        {/* Stepper moved to the dialog actions for bottom placement */}
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
              />
            )}
            {activeStep === 4 && (
              <FinishStep
                wizardState={wizardState}
              />
            )}
          </Box>
        </Box>
      </DialogContent>
      <Divider sx={{ mt: 1 }} />
      <WizardStepper
        steps={steps}
        activeStep={activeStep}
        onBack={handleBack}
        onNext={handleNext}
        onClose={onClose}
        canAdvance={canAdvance}
      />
    </Dialog>
  )
}
