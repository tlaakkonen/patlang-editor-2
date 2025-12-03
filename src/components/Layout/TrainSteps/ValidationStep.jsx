import React from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { analyzeOutputNodes, collectAllNodeInstances, nodesHaveMissingInputConnections } from '../../../utils/validation'

// This component now owns equation/diagram validation. It accepts
// `sections`, `findItemByType` and `open` and reports the computed
// errors back to the parent via `onValidationChange` so the dialog can
// enable/disable advancing.
export default function ValidationStep({ sections = [], findItemByType, open, onValidationChange }) {
  const [errors, setErrors] = React.useState([])

  React.useEffect(() => {
    if (!open) return

    const errs = []

    const diagrams = (sections || []).find((s) => s.key === 'diagrams')?.items || []
    const equations = (sections || []).find((s) => s.key === 'equations')?.items || []

    for (const eq of equations) {
      const lhsType = eq?.['lhs-type']
      const rhsType = eq?.['rhs-type']
      if (!lhsType || !rhsType) {
        errs.push(`Equation "${eq?.label || eq?.type}" missing LHS or RHS diagram`)
        continue
      }

      const lhs = diagrams.find((d) => d.type === lhsType)
      const rhs = diagrams.find((d) => d.type === rhsType)
      if (!lhs) {
        errs.push(`Equation "${eq?.label || eq?.type}": LHS diagram not found or has no saved state.`)
        continue
      }
      if (!rhs) {
        errs.push(`Equation "${eq?.label || eq?.type}": RHS diagram not found or has no saved state.`)
        continue
      }

      const lhsNodes = lhs.nodes || []
      const rhsNodes = rhs.nodes || []
      const lhsEdges = lhs.edges || []
      const rhsEdges = rhs.edges || []

      const lhsAnalysis = analyzeOutputNodes(lhsNodes, findItemByType)
      const rhsAnalysis = analyzeOutputNodes(rhsNodes, findItemByType)

      const lhsHasDuplicates = Object.values(lhsAnalysis.outputTypeCounts).some((c) => c > 1)
      const rhsHasDuplicates = Object.values(rhsAnalysis.outputTypeCounts).some((c) => c > 1)
      if (lhsHasDuplicates || rhsHasDuplicates) {
        errs.push(`Equation "${eq?.label || eq?.type}": diagrams contain more than one of the same output box`)
      }

      // Ensure each diagram contains at most one copy of each input-kind box
      const countInputTypes = (nodesArr = []) => {
        const inputTypeCounts = {}
        for (const node of nodesArr || []) {
          const t = node.data?.type
          const box = findItemByType ? findItemByType('boxes', t) : null
          if (box?.kind === 'input') {
            inputTypeCounts[t] = (inputTypeCounts[t] || 0) + 1
          }
        }
        return inputTypeCounts
      }

      const lhsInputCounts = countInputTypes(lhsNodes)
      const rhsInputCounts = countInputTypes(rhsNodes)
      const lhsInputHasDuplicates = Object.values(lhsInputCounts).some((c) => c > 1)
      const rhsInputHasDuplicates = Object.values(rhsInputCounts).some((c) => c > 1)
      if (lhsInputHasDuplicates || rhsInputHasDuplicates) {
        errs.push(`Equation "${eq?.label || eq?.type}": diagrams contain more than one of the same input box`)
      }

      // Ensure diagrams referenced by an equation do not contain boxes with kind === 'fixed'
      const diagramContainsFixedKind = (nodesArr = []) => {
        for (const node of nodesArr || []) {
          const t = node.data?.type
          const box = findItemByType ? findItemByType('boxes', t) : null
          if (box?.kind === 'fixed') return true
        }
        return false
      }

      const lhsHasFixed = diagramContainsFixedKind(lhsNodes)
      const rhsHasFixed = diagramContainsFixedKind(rhsNodes)
      if (lhsHasFixed || rhsHasFixed) {
        errs.push(`Equation "${eq?.label || eq?.type}": diagrams referenced by an equation must not contain fixed-function boxes`)
      }

      const lhsSet = lhsAnalysis.outputTypes
      const rhsSet = rhsAnalysis.outputTypes
      // ensure each diagram contains at least one output type
      if ((!lhsSet || lhsSet.size === 0) || (!rhsSet || rhsSet.size === 0)) {
        if (!lhsSet || lhsSet.size === 0) errs.push(`Equation "${eq?.label || eq?.type}": LHS diagram contains no output boxes`)
        if (!rhsSet || rhsSet.size === 0) errs.push(`Equation "${eq?.label || eq?.type}": RHS diagram contains no output boxes`)
        // skip further checks for this equation since outputs are required
        continue
      }
      const onlyInLhs = [...lhsSet].filter((x) => !rhsSet.has(x))
      const onlyInRhs = [...rhsSet].filter((x) => !lhsSet.has(x))
      if (onlyInLhs.length || onlyInRhs.length) {
        errs.push(`Equation "${eq?.label || eq?.type}": diagrams don't contain the same outputs`)
      }

      const lhsAllInstances = collectAllNodeInstances(lhsNodes, findItemByType)
      const rhsAllInstances = collectAllNodeInstances(rhsNodes, findItemByType)

      const lhsMissing = nodesHaveMissingInputConnections(lhsAllInstances, lhsEdges)
      const rhsMissing = nodesHaveMissingInputConnections(rhsAllInstances, rhsEdges)
      if (lhsMissing || rhsMissing) errs.push(`Equation "${eq?.label || eq?.type}": a node is missing a connection to its input`)
    }

    setErrors(errs)
    onValidationChange?.(errs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sections, findItemByType])

  const hasErrors = Boolean(errors && errors.length)

  return (
    <Box>
      {hasErrors ? (
        <Alert severity="error">
          <Box sx={{ mb: 1 }}>
            <Typography variant="body2">Validation errors found — please fix these before generating code:</Typography>
          </Box>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert severity="success">All equation and diagrams referenced by equations look valid.</Alert>
      )}
    </Box>
  )
}
