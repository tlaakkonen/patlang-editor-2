import React from 'react'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'

export default function WizardStepper({ steps, activeStep, onBack, onNext, onClose, canAdvance }) {
  return (
    <>
      <DialogActions sx={{ alignItems: 'center' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Box sx={{ flex: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', ml: 2, mr: 2 }}>
          <Stepper activeStep={activeStep} sx={{ minWidth: 220 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Box sx={{ flex: 1 }} />
        <Button onClick={onBack} disabled={activeStep === 0}>Back</Button>
        <Button
          onClick={onNext}
          variant="contained"
          disabled={activeStep === steps.length - 1 || !canAdvance(activeStep)}
        >
          Next
        </Button>
      </DialogActions>
    </>
  )
}
