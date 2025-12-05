import React, { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import ButtonGroup from '@mui/material/ButtonGroup'
import TimelineIcon from '@mui/icons-material/Timeline'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import Stack from '@mui/material/Stack'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import ReplayIcon from '@mui/icons-material/Replay'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import { LineChart } from '@mui/x-charts'
import { get as idbGet } from 'idb-keyval'

// Chart from @mui/x-charts will be used directly

import * as tf from '@tensorflow/tfjs'
import { createModelsForLearners, trainOneEpoch, evaluateTestLoss, loadMnistIndexedDB, buildDiagramExecutor } from '../../../utils/trainingHelpers'
import { nodesHaveMissingInputConnections } from '../../../utils/validation'

export default function TrainStep({ wizardState, sections, mnistReady = false, mnistDownloading = false, onDownloadMnist = () => {}, modelsProp = null, onModelsChange = null }) {
  const [running, setRunning] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [lossHistory, setLossHistory] = useState([])
  const [trainLossHistory, setTrainLossHistory] = useState([])
  // per-equation histories (keyed by equation.type)
  const [eqHistories, setEqHistories] = useState(() => {
    const init = {}
    const eqSection = (sections || []).find((s) => s.key === 'equations')
    const items = eqSection?.items || []
    items.forEach((it) => { init[it.type] = [] })
    return init
  })
  const [trainEqHistories, setTrainEqHistories] = useState(() => {
    const init = {}
    const eqSection = (sections || []).find((s) => s.key === 'equations')
    const items = eqSection?.items || []
    items.forEach((it) => { init[it.type] = [] })
    return init
  })
  const [selectedDiagram, setSelectedDiagram] = useState(() => '')

  // Helper: pick a deterministic color from a palette using a simple hash.
  // This ensures colors are consistent and chosen from a set of
  // visually-distinct, qualitative colors (colorblind-friendly-ish).
  const colorForString = (str) => {
    // slightly more saturated / vivid palette for better distinction
    const PALETTE = [
      '#1565C0', // vivid blue
      '#FF6D00', // vivid orange
      '#00C853', // vivid green
      '#D50000', // vivid red
      '#9C27B0', // vivid purple
      '#FF4081', // vivid pink
      '#FFC107', // bright amber
      '#00ACC1', // bright teal
      '#7C4DFF', // bright indigo
      '#E91E63', // strong magenta
      '#00B0FF', // bright sky blue
      '#43A047', // rich green
    ]
    let h = 5381
    const s = str || ''
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) + s.charCodeAt(i)
    }
    const idx = Math.abs(h) % PALETTE.length
    return PALETTE[idx]
  }

  // no dynamic import needed - Chart is imported directly
  const [models, setModels] = useState({})
  const optimizerRef = useRef(null)
  const runningRef = useRef(false)
  const [epochBatch, setEpochBatch] = useState(0)
  const [epochTotalBatches, setEpochTotalBatches] = useState(0)
  const [epochProgress, setEpochProgress] = useState(0)
  const [batchSize, setBatchSize] = useState(128)
  const [learningRate, setLearningRate] = useState(0.001)
  const initialEvalDoneRef = useRef(false)
  const pendingDisposeRef = useRef(false)
  const trainingLoopActiveRef = useRef(false)
  const latestConfigRef = useRef({ sections, wizardState, equations: [] })
  const batchSizeRef = useRef(batchSize)
  const learningRateRef = useRef(learningRate)

  // Sync external models into local state when provided (persist across steps)
  useEffect(() => {
    if (modelsProp && Object.keys(modelsProp || {}).length > 0) {
      // if local is empty or different keys, sync from prop
      const localKeys = Object.keys(models || {})
      const propKeys = Object.keys(modelsProp || {})
      const same = localKeys.length === propKeys.length && localKeys.every((k) => propKeys.includes(k))
      if (!same) setModels(modelsProp)
    }
  }, [modelsProp])

  // ---------------- Visualization state ----------------
  const [vizRefreshing, setVizRefreshing] = useState(false)
  const [vizError, setVizError] = useState(null)
  const [vizInputs, setVizInputs] = useState({ labelled: null, random: null, randomVector: false })
  const [vizOutputs, setVizOutputs] = useState({}) // { [outputNodeType]: { [inputIdx]: { kind:'image'|'labels'|'unsupported', samples: Float32Array[] } } }
  const refreshVizRef = useRef(null)
  const vizRunningRef = useRef(false)
  const vizBatchCounterRef = useRef(0)
  const epochRunIdRef = useRef(0)
  const vizEnabledStateRef = useRef(false)
  const vizRefreshingStateRef = useRef(false)

  // Helpers used by eligibility checks and executor
  const boxesSection = React.useMemo(() => (sections || []).find((s) => s.key === 'boxes'), [sections])
  const diagramsSection = React.useMemo(() => (sections || []).find((s) => s.key === 'diagrams'), [sections])
  const boxByType = React.useMemo(() => new Map((boxesSection?.items || []).map((b) => [b.type, b])), [boxesSection])

  // Parse handle index from id like 'in-0' / 'out-1'
  const parseHandleIndex = (handle) => {
    if (!handle) return -1
    const m = /-(\d+)$/.exec(handle)
    return m ? parseInt(m[1], 10) : -1
  }

  const parseDim = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
  }

  // Determine if a given diagram satisfies visualization rules
  const isDiagramEligible = React.useCallback((diagram) => {
    if (!diagram) return false
    const nodes = diagram?.nodes || []
    const edges = diagram?.edges || []

    // Rule 1: all inputs connected
    const instances = nodes.map((n) => ({ node: n, box: boxByType.get(n.data?.type) }))
    if (nodesHaveMissingInputConnections(instances, edges)) return false

    // Rule 2: output nodes only accept MNIST image/label wires (no custom)
    const outputNodes = instances.filter((inst) => (inst.box?.kind === 'output'))
    for (const inst of outputNodes) {
      const inputsTypes = inst.box?.inputs || []
      for (let i = 0; i < inputsTypes.length; i++) {
        const wireType = inputsTypes[i]
        const sel = wizardState?.wireSelects?.[wireType]
        const dim = parseDim(wizardState?.wireDims?.[wireType])
        if (sel === 'mnist-images') {
          if (dim !== 784) return false
        } else if (sel === 'mnist-labels') {
          if (dim !== 10) return false
        } else {
          // '', undefined or 'custom' are not allowed on outputs
          return false
        }
      }
    }

    // Rule 3: at most one data box assigned 'labelled' and at most one 'random'
    const dataBoxesInDiagram = instances.filter((inst) => (inst.box?.kind === 'data'))
    let labelledCount = 0
    let randomCount = 0
    for (const inst of dataBoxesInDiagram) {
      const t = inst.box?.type
      const assign = wizardState?.dataAssignments?.[t]
      if (assign === 'labelled') labelledCount += 1
      if (assign === 'random') randomCount += 1
      if (labelledCount > 1 || randomCount > 1) return false
    }

    return true
  }, [boxByType, wizardState])

  // Eligible diagrams list and selection syncing
  const eligibleDiagrams = React.useMemo(() => {
    const all = diagramsSection?.items || []
    return all.filter((d) => isDiagramEligible(d))
  }, [diagramsSection, isDiagramEligible])

  // Keep selected diagram within eligible set
  useEffect(() => {
    // If the current selection becomes ineligible, switch to None ('').
    // Do not auto-select the first eligible diagram; let the user choose.
    if (selectedDiagram && !eligibleDiagrams.find((d) => d.type === selectedDiagram)) {
      setSelectedDiagram('')
    }
  }, [eligibleDiagrams, selectedDiagram])

  const hasModels = !!models && Object.keys(models).length > 0
  const vizEnabled = mnistReady && hasModels && !!selectedDiagram && !!eligibleDiagrams.find((d) => d.type === selectedDiagram)

  const disposeModelsNow = React.useCallback(() => {
    // dispose models if any
    if (models) {
      for (const k of Object.keys(models)) {
        try { models[k].dispose && models[k].dispose() } catch { /* ignore */ }
      }
    }
    setModels({})
    try { onModelsChange && onModelsChange(null) } catch {}
    optimizerRef.current = null
    initialEvalDoneRef.current = false
  }, [models])

  // no dynamic import required since the package is installed

  // Simple training simulation: loss decreases with noise
  const equations = React.useMemo(() => {
    const eqSection = (sections || []).find((s) => s.key === 'equations')
    return eqSection?.items || []
  }, [sections])

  // note: eqHistories keys are created on-demand by the interval updater
  // and the chart reads `eqHistories[eq.type] || []`, so no sync effect is
  // required (avoids setState-in-effect lint rule).

  // Keep latest config in a ref so the training loop doesn't restart on config/UI changes
  useEffect(() => {
    latestConfigRef.current = { sections, wizardState, equations }
  }, [sections, wizardState, equations])

  // Keep refs in sync so long-running training loop reads latest values
  useEffect(() => { batchSizeRef.current = batchSize }, [batchSize])
  useEffect(() => { learningRateRef.current = learningRate }, [learningRate])
  // If the learning rate changes while an optimizer exists, recreate it so the new LR takes effect.
  useEffect(() => {
    if (!optimizerRef.current) return
    try {
      // dispose if available
      if (typeof optimizerRef.current.dispose === 'function') optimizerRef.current.dispose()
    } catch (e) { /* ignore */ }
    optimizerRef.current = tf.train.adam(learningRateRef.current || 0.001)
  }, [learningRate])

  // Training loop effect: when running, call trainOneEpoch repeatedly and update charts.
  useEffect(() => {
    runningRef.current = running
    if (!running) return
    if (!models || Object.keys(models).length === 0) return
    if (trainingLoopActiveRef.current) return

    let cancelled = false
    const runLoop = async () => {
      trainingLoopActiveRef.current = true
      try {
  if (!optimizerRef.current) optimizerRef.current = tf.train.adam(learningRateRef.current || 0.001)
        if (!initialEvalDoneRef.current) {
            try {
            const { sections: sec0, wizardState: wiz0, equations: eq0 } = latestConfigRef.current
            const { testLoss, perEquationTestLoss } = await evaluateTestLoss({ models, sections: sec0, wizardState: wiz0, batchSize: batchSizeRef.current || 128 })
            setLossHistory((h) => [...h, Number.isFinite(testLoss) ? testLoss : 0].slice(-200))
            setEqHistories((prev) => {
              const next = { ...prev }
              const eqArr = Array.isArray(eq0) ? eq0 : []
              eqArr.forEach((eq) => {
                const arr = next[eq.type] || []
                const v = perEquationTestLoss?.[eq.type]
                next[eq.type] = [...arr, Number.isFinite(v) ? v : (Number.isFinite(testLoss) ? testLoss : 0)].slice(-200)
              })
              return next
            })
          } catch (e) {
            console.error('Initial evaluation failed', e)
            // If models may have been disposed, recreate once and retry
            const msg = String(e?.message || e)
                if (/disposed/i.test(msg)) {
              try {
                const created = await createModelsForLearners(sections, wizardState)
                setModels(created)
                try { onModelsChange && onModelsChange(created) } catch {}
                    const { sections: sec0b, wizardState: wiz0b, equations: eq0b } = latestConfigRef.current
                    const { testLoss, perEquationTestLoss } = await evaluateTestLoss({ models: created, sections: sec0b, wizardState: wiz0b, batchSize: batchSizeRef.current || 128 })
                setLossHistory((h) => [...h, Number.isFinite(testLoss) ? testLoss : 0].slice(-200))
                setEqHistories((prev) => {
                  const next = { ...prev }
                  const eqArr = Array.isArray(eq0b) ? eq0b : []
                  eqArr.forEach((eq) => {
                    const arr = next[eq.type] || []
                    const v = perEquationTestLoss?.[eq.type]
                    next[eq.type] = [...arr, Number.isFinite(v) ? v : (Number.isFinite(testLoss) ? testLoss : 0)].slice(-200)
                  })
                  return next
                })
              } catch (e2) {
                console.error('Initial evaluation retry failed', e2)
              }
            }
          }
          initialEvalDoneRef.current = true
        }
        while (runningRef.current && !cancelled) {
          const myEpochId = ++epochRunIdRef.current
          setEpochBatch(0)
          setEpochTotalBatches(0)
          setEpochProgress(0)
          const { sections: sec, wizardState: wiz } = latestConfigRef.current
          let testLoss, perEquationTestLoss
          const runEpoch = async (useModels) => trainOneEpoch({
            models,
            sections: sec,
            wizardState: wiz,
            optimizer: optimizerRef.current,
            batchSize: batchSizeRef.current || 128,
            shuffle: true,
            onBatchEnd: ({ trainLoss, perEquationTrainLoss, batch, totalBatches }) => {
              if (!runningRef.current) return
              if (myEpochId !== epochRunIdRef.current) return
              if (Number.isFinite(batch) && Number.isFinite(totalBatches) && totalBatches > 0) {
                setEpochBatch(batch)
                setEpochTotalBatches(totalBatches)
                const pct = Math.max(0, Math.min(100, Math.round((batch / totalBatches) * 100)))
                setEpochProgress(pct)
              }
              if (Number.isFinite(batch) && Number.isFinite(totalBatches)) {
                const isEpochEnd = batch === totalBatches
                const shouldSample = (batch % 10 === 0) || isEpochEnd
                if (shouldSample) {
                  setTrainLossHistory((h) => [...h, Number.isFinite(trainLoss) ? trainLoss : 0].slice(-200))
                  setTrainEqHistories((prev) => {
                    const next = { ...prev }
                    const eqArr2 = Array.isArray(latestConfigRef.current.equations) ? latestConfigRef.current.equations : []
                    eqArr2.forEach((eq) => {
                      const arr = next[eq.type] || []
                      const v = perEquationTrainLoss?.[eq.type]
                      next[eq.type] = [...arr, Number.isFinite(v) ? v : (Number.isFinite(trainLoss) ? trainLoss : 0)].slice(-200)
                    })
                    return next
                  })
                }
                vizBatchCounterRef.current = (vizBatchCounterRef.current + 1) % 10
                if (vizEnabledStateRef.current && !vizRefreshingStateRef.current && (vizBatchCounterRef.current === 0 || isEpochEnd)) {
                  try { refreshVizRef.current && refreshVizRef.current() } catch {}
                }
              }
            },
          })
          try {
                const r = await runEpoch(models)
            testLoss = r.testLoss; perEquationTestLoss = r.perEquationTestLoss
          } catch (e) {
            const msg = String(e?.message || e)
            if (/disposed/i.test(msg)) {
              try {
                const created = await createModelsForLearners(sections, wizardState)
                setModels(created)
                try { onModelsChange && onModelsChange(created) } catch {}
                const r2 = await trainOneEpoch({
                  models: created,
                  sections: sec,
                  wizardState: wiz,
                  optimizer: optimizerRef.current,
                  batchSize: batchSizeRef.current || 128,
                  shuffle: true,
                  onBatchEnd: ({ trainLoss, perEquationTrainLoss, batch, totalBatches }) => {
                    if (!runningRef.current) return
                    if (myEpochId !== epochRunIdRef.current) return
                    if (Number.isFinite(batch) && Number.isFinite(totalBatches) && totalBatches > 0) {
                      setEpochBatch(batch)
                      setEpochTotalBatches(totalBatches)
                      const pct = Math.max(0, Math.min(100, Math.round((batch / totalBatches) * 100)))
                      setEpochProgress(pct)
                    }
                    if (Number.isFinite(batch) && Number.isFinite(totalBatches)) {
                      const isEpochEnd = batch === totalBatches
                      const shouldSample = (batch % 10 === 0) || isEpochEnd
                      if (shouldSample) {
                        setTrainLossHistory((h) => [...h, Number.isFinite(trainLoss) ? trainLoss : 0].slice(-200))
                        setTrainEqHistories((prev) => {
                          const next = { ...prev }
                          const eqArr2 = Array.isArray(latestConfigRef.current.equations) ? latestConfigRef.current.equations : []
                          eqArr2.forEach((eq) => {
                            const arr = next[eq.type] || []
                            const v = perEquationTrainLoss?.[eq.type]
                            next[eq.type] = [...arr, Number.isFinite(v) ? v : (Number.isFinite(trainLoss) ? trainLoss : 0)].slice(-200)
                          })
                          return next
                        })
                      }
                      vizBatchCounterRef.current = (vizBatchCounterRef.current + 1) % 10
                      if (vizEnabled && !vizRefreshing && (vizBatchCounterRef.current === 0 || isEpochEnd)) {
                        try { refreshVizRef.current && refreshVizRef.current() } catch {}
                      }
                    }
                  },
                })
                testLoss = r2.testLoss; perEquationTestLoss = r2.perEquationTestLoss
              } catch (e2) {
                console.error('Epoch retry failed', e2)
                throw e
              }
            } else {
              throw e
            }
          }
          if (!runningRef.current) break
          setEpoch((e) => e + 1)
          setLossHistory((h) => [...h, Number.isFinite(testLoss) ? testLoss : 0].slice(-200))
          setEqHistories((prev) => {
            const next = { ...prev }
            const eqArr3 = Array.isArray(latestConfigRef.current.equations) ? latestConfigRef.current.equations : []
            eqArr3.forEach((eq) => {
              const arr = next[eq.type] || []
              const v = perEquationTestLoss?.[eq.type]
              next[eq.type] = [...arr, Number.isFinite(v) ? v : (Number.isFinite(testLoss) ? testLoss : 0)].slice(-200)
            })
            return next
          })
          setEpochProgress(100)
          await tf.nextFrame()
        }
        if (pendingDisposeRef.current) {
          pendingDisposeRef.current = false
          disposeModelsNow()
        }
      } catch (e) {
        console.error('Training loop error', e)
      } finally {
        trainingLoopActiveRef.current = false
      }
    }

    runLoop()
    return () => { cancelled = true }
  }, [running, models])

  const diagrams = React.useMemo(() => {
    const diagSection = (sections || []).find((s) => s.key === 'diagrams')
    return diagSection?.items || []
  }, [sections])

  const totalWeight = React.useMemo(() => {
    try {
      return (equations || []).reduce((acc, eq) => acc + (Number(wizardState?.outputWeights?.[eq.type]) || 0), 0) || 1
    } catch { return 1 }
  }, [equations, wizardState])
  const normalizedLossHistory = React.useMemo(() => {
    const tw = totalWeight > 0 ? totalWeight : 1
    return (lossHistory || []).map((v) => (Number.isFinite(v) ? v / tw : v))
  }, [lossHistory, totalWeight])

  const normalizedTrainLossHistory = React.useMemo(() => {
    const tw = totalWeight > 0 ? totalWeight : 1
    return (trainLossHistory || []).map((v) => (Number.isFinite(v) ? v / tw : v))
  }, [trainLossHistory, totalWeight])

  const chartSeries = React.useMemo(() => {
    const base = [{ type: 'line', id: 'loss', data: normalizedLossHistory, showMark: true, label: 'Loss', color: 'rgba(25,118,210,0.9)' }]
    const eqSeries = equations.map((eq) => {
      const wRaw = Number(wizardState?.outputWeights?.[eq.type])
      const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1
      const raw = eqHistories[eq.type] || []
      const data = raw.map((v) => (Number.isFinite(v) ? v / w : v))
      return {
        type: 'line',
        id: `eq:${eq.type}`,
        data,
        showMark: true,
        label: eq.label || eq.type,
        color: colorForString(eq.type || eq.label || ''),
      }
    })
    return [...base, ...eqSeries]
  }, [normalizedLossHistory, eqHistories, equations, wizardState])

  const trainChartSeries = React.useMemo(() => {
    const base = [{ type: 'line', id: 'train:loss', data: normalizedTrainLossHistory, showMark: false, label: 'Loss', color: 'rgba(25,118,210,0.9)' }]
    const eqSeries = equations.map((eq) => {
      const wRaw = Number(wizardState?.outputWeights?.[eq.type])
      const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1
      const raw = trainEqHistories[eq.type] || []
      const data = raw.map((v) => (Number.isFinite(v) ? v / w : v))
      return {
        type: 'line',
        id: `train-eq:${eq.type}`,
        data,
        showMark: false,
        label: eq.label || eq.type,
        color: colorForString(eq.type || eq.label || ''),
      }
    })
    return [...base, ...eqSeries]
  }, [normalizedTrainLossHistory, trainEqHistories, equations, wizardState])

  const startPressed = async () => {
    // create models if not present
    if (!models || Object.keys(models).length === 0) {
      try {
        const created = await createModelsForLearners(sections, wizardState)
        setModels(created)
        try { onModelsChange && onModelsChange(created) } catch {}
      } catch (e) {
        console.error('Failed to create models', e)
      }
    }
    if (!optimizerRef.current) optimizerRef.current = tf.train.adam(learningRateRef.current || learningRate || 0.001)
    setRunning(true)
  }
  const stop = () => setRunning(false)
  const reset = () => {
    setRunning(false)
    setEpoch(0)
    setLossHistory([])
    setTrainLossHistory([])
    setEpochBatch(0)
    setEpochTotalBatches(0)
    setEpochProgress(0)
    vizBatchCounterRef.current = 0
    epochRunIdRef.current += 1
    // clear per-equation histories as well (preserve keys for existing equations)
    setEqHistories(() => {
      const next = {}
      equations.forEach((eq) => { next[eq.type] = [] })
      return next
    })
    setTrainEqHistories(() => {
      const next = {}
      equations.forEach((eq) => { next[eq.type] = [] })
      return next
    })
    // If training is still unwinding, postpone disposal to after the loop exits.
    if (runningRef.current) {
      pendingDisposeRef.current = true
    } else {
      disposeModelsNow()
    }
  }

  const latestLoss = lossHistory.length ? lossHistory[lossHistory.length - 1] : null
  const normalizedLatest = latestLoss !== null && totalWeight > 0 ? (latestLoss / totalWeight) : latestLoss

  // ------------- Visualization rendering helpers -------------
  const tanh = (x) => Math.tanh(x)
  const clamp01 = (t) => Math.max(0, Math.min(1, t))
  // A tiny viridis-like interpolation using a few control points
  const viridis = (t) => {
    const stops = [
      [0.267, 0.005, 0.329],
      [0.283, 0.141, 0.458],
      [0.254, 0.265, 0.530],
      [0.207, 0.372, 0.553],
      [0.164, 0.471, 0.558],
      [0.128, 0.567, 0.551],
      [0.135, 0.659, 0.518],
      [0.267, 0.749, 0.441],
      [0.478, 0.821, 0.318],
      [0.741, 0.873, 0.150],
    ]
    const x = clamp01(t) * (stops.length - 1)
    const i = Math.floor(x)
    const f = x - i
    const a = stops[i]
    const b = stops[Math.min(i + 1, stops.length - 1)]
    const r = Math.round(255 * (a[0] + (b[0] - a[0]) * f))
    const g = Math.round(255 * (a[1] + (b[1] - a[1]) * f))
    const bl = Math.round(255 * (a[2] + (b[2] - a[2]) * f))
    return `rgb(${r},${g},${bl})`
  }

  // Convert a 28x28 grayscale Float32Array to a PNG data URL (scaled via nearest-neighbor)
  const imageArrayToDataUrl = (data, scale = 3) => {
    if (!data || data.length !== 784) return ''
    const w = 28, h = 28
    const src = document.createElement('canvas')
    src.width = w; src.height = h
    const sctx = src.getContext('2d')
    const img = sctx.createImageData(w, h)
    // Min-max normalize defensively
    let min = Infinity, max = -Infinity
    for (let i = 0; i < 784; i++) { const v = data[i]; if (v < min) min = v; if (v > max) max = v }
    const denom = max > min ? (max - min) : 1
    for (let i = 0; i < 784; i++) {
      const v = (data[i] - min) / denom
      const c = Math.round(v * 255)
      const idx = i * 4
      img.data[idx] = c
      img.data[idx + 1] = c
      img.data[idx + 2] = c
      img.data[idx + 3] = 255
    }
    sctx.putImageData(img, 0, 0)
    const dst = document.createElement('canvas')
    dst.width = w * scale; dst.height = h * scale
    const dctx = dst.getContext('2d')
    dctx.imageSmoothingEnabled = false
    dctx.drawImage(src, 0, 0, dst.width, dst.height)
    return dst.toDataURL('image/png')
  }

  const LabelBars = ({ vec, widthPx = 120, gap = 2 }) => {
    const arr = Array.from({ length: 10 }, (_, i) => vec?.[i] ?? 0)
    let maxIdx = 0
    let maxVal = -Infinity
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > maxVal) { maxVal = arr[i]; maxIdx = i }
    }
    return (
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1px 1fr',
        alignItems: 'center',
        columnGap: `${gap}px`,
        width: `${widthPx}px`,
        boxSizing: 'border-box',
        p: 0.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        backgroundColor: 'background.paper',
      }}>
        <Box sx={{
          minWidth: 14,
          px: 0.5,
          fontSize: '10px',
          lineHeight: 1.2,
          color: 'text.secondary',
          textAlign: 'center',
          userSelect: 'none',
        }}>
          {maxIdx}
        </Box>
        <Box sx={{ width: '1px', height: '100%', bgcolor: 'divider' }} />
        <Box sx={{
          px: 0.5,
          display: 'grid',
          gridTemplateColumns: 'repeat(10, 1fr)',
          gap: `${gap}px`,
          width: '100%',
        }}>
          {arr.map((v, i) => {
            const t = (tanh(v) + 1) / 2
            return <Box key={i} sx={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 2, backgroundColor: viridis(t) }} />
          })}
        </Box>
      </Box>
    )
  }


  // Run a single viz forward pass and populate inputs/outputs
  const runVizOnce = React.useCallback(async () => {
    if (!vizEnabled) return
    if (vizRunningRef.current) return
    const diagram = (diagramsSection?.items || []).find((d) => d.type === selectedDiagram)
    if (!diagram) return
    // If models aren't available, do not attempt visualization
    if (!hasModels) return
    vizRunningRef.current = true
    setVizRefreshing(true)
    setVizError(null)
    try {
      // Build tiny 4-sample batches directly from IndexedDB floats to avoid loading full tensors
      const floats = await idbGet('patlang:mnist')
      if (!floats || !(floats instanceof Float32Array)) throw new Error('MNIST dataset not found in IndexedDB.')
      const NUM_ROWS = 60000, FEAT = 784, LAB = 10, TOTAL = FEAT + LAB
      const TEST_OFFSET = 50000
      const imgRows = new Float32Array(4 * FEAT)
      const lblRows = new Float32Array(4 * LAB)
      for (let i = 0; i < 4; i++) {
        const r = TEST_OFFSET + Math.floor(Math.random() * (NUM_ROWS - TEST_OFFSET))
        const base = r * TOTAL
        imgRows.set(floats.subarray(base, base + FEAT), i * FEAT)
        lblRows.set(floats.subarray(base + FEAT, base + FEAT + LAB), i * LAB)
      }
      const bx = tf.tensor2d(imgRows, [4, FEAT])
      const by = tf.tensor2d(lblRows, [4, LAB])

      // Determine which inputs we need to show, based on assignments present in the diagram
      const nodeTypesInDiagram = new Set((diagram?.nodes || []).map((n) => n.data?.type))
      let hasLabelled = false
      let hasRandom = false
      let hasRandomVector = false
      for (const t of nodeTypesInDiagram) {
        const def = boxByType.get(t)
        if (def?.kind === 'data') {
          const a = wizardState?.dataAssignments?.[t]
          if (a === 'labelled') hasLabelled = true
          if (a === 'random') hasRandom = true
          if (a === 'random-vector') hasRandomVector = true
        }
      }

      // Prepare random labels if needed
      let randomLabelsTensor = null
      let randomLabelsArray = null
      if (hasRandom) {
        const rIdx = new Int32Array(4)
        for (let i = 0; i < 4; i++) rIdx[i] = Math.floor(Math.random() * 10)
        randomLabelsArray = Array.from({ length: 4 }, (_, i) => {
          const arr = new Float32Array(10); arr[rIdx[i]] = 1; return arr
        })
        randomLabelsTensor = tf.tensor2d(randomLabelsArray.flat(), [4, 10])
      }

  const exec = buildDiagramExecutor(diagram, sections, wizardState?.wireDims || {}, models)
  exec.__dataAssign = wizardState?.dataAssignments || {}
  exec.__useProvidedRandom = true

      // For labelled view inputs
      const labelledInputs = hasLabelled ? {
        imagesUrls: await (async () => {
          const data = await bx.data()
          const arrays = [0, 1, 2, 3].map((i) => new Float32Array(data.slice(i * 784, (i + 1) * 784)))
          return arrays.map((arr) => imageArrayToDataUrl(arr, 3))
        })(),
        labels: await (async () => {
          const data = await by.data()
          return [0, 1, 2, 3].map((i) => new Float32Array(data.slice(i * 10, (i + 1) * 10)))
        })(),
      } : null

  const randomInputs = hasRandom ? { labels: randomLabelsArray } : null

      // Run forward. For simplicity, pass batchY according to assignment:
      // - labelled paths will use 'by'; random paths will use 'randomLabelsTensor'
      const usedY = randomLabelsTensor || by
      // Run forward inside a tidy and keep only the tensors we need
      const outMap = tf.tidy(() => {
        const raw = exec(bx, usedY, new Set())
        const kept = {}
        for (const nodeType of Object.keys(raw)) {
          kept[nodeType] = {}
          for (const idx of Object.keys(raw[nodeType])) {
            kept[nodeType][idx] = tf.keep(raw[nodeType][idx])
          }
        }
        return kept
      })

      // Convert outputs to JS arrays grouped by node type / input index
      const result = {}
      for (const nodeType of Object.keys(outMap)) {
        const boxDef = boxByType.get(nodeType) || {}
        const inputsTypes = boxDef?.inputs || []
        result[nodeType] = {}
        for (let i = 0; i < inputsTypes.length; i++) {
          const t = outMap[nodeType][i]
          if (!t) continue
          const dim = t.shape[t.shape.length - 1]
          if (dim === 784) {
            const data = await t.data()
            const arrays = [0, 1, 2, 3].map((k) => new Float32Array(data.slice(k * 784, (k + 1) * 784)))
            const urls = arrays.map((arr) => imageArrayToDataUrl(arr, 3))
            result[nodeType][i] = { kind: 'image', urls }
          } else if (dim === 10) {
            const data = await t.data()
            result[nodeType][i] = { kind: 'labels', samples: [0, 1, 2, 3].map((k) => new Float32Array(data.slice(k * 10, (k + 1) * 10))) }
          } else {
            result[nodeType][i] = { kind: 'unsupported', samples: [] }
          }
        }
      }

  setVizInputs({ labelled: labelledInputs, random: randomInputs, randomVector: hasRandomVector })
      setVizOutputs(result)

  // Dispose tensors
  tf.dispose([bx, by, randomLabelsTensor, ...Object.values(outMap).flatMap((m) => Object.values(m))])
    } catch (e) {
      console.error('Visualization error', e)
      setVizError(e?.message || String(e))
    } finally {
      setVizRefreshing(false)
      vizRunningRef.current = false
    }
  }, [vizEnabled, diagramsSection, selectedDiagram, models, sections, wizardState, boxByType])

  // Keep a ref to the latest viz runner for use inside training callbacks
  useEffect(() => { refreshVizRef.current = runVizOnce }, [runVizOnce])
  useEffect(() => { vizEnabledStateRef.current = vizEnabled }, [vizEnabled])
  useEffect(() => { vizRefreshingStateRef.current = vizRefreshing }, [vizRefreshing])

  // Auto-generate visualization on relevant changes
  useEffect(() => {
    if (!vizEnabled) return
    // Trigger on selection or config changes
    if (!vizRefreshing) {
      runVizOnce()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vizEnabled, selectedDiagram, models, wizardState?.wireDims, wizardState?.wireSelects, wizardState?.dataAssignments])

  return (
    <Box sx={{ p: 2 }}>
      {/* Controls row: MNIST download button (left) and diagram selector to its right */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button
            size="medium"
            color="secondary"
            variant={mnistReady ? 'outlined' : 'contained'}
            onClick={onDownloadMnist}
            disabled={mnistDownloading || mnistReady}
          >
            {mnistReady ? 'MNIST downloaded' : (mnistDownloading ? 'Downloading…' : 'Download MNIST')}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', flex: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ ml: 2, mr: 2, color: 'text.primary' }}>Visualization:</Typography>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="train-diagram-select-label">Visualize</InputLabel>
            <Select
              labelId="train-diagram-select-label"
              id="train-diagram-select"
              value={selectedDiagram}
              label="Visualize"
              onChange={(e) => setSelectedDiagram(e.target.value)}
              disabled={false}
            >
              <MenuItem value="">None</MenuItem>
              {eligibleDiagrams.map((d) => (
                <MenuItem key={d.type} value={d.type}>{d.label || d.type}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}/>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
          <TextField
            label="Batch"
            size="small"
            type="number"
            inputProps={{ min: 1, step: 1 }}
            sx={{ width: 110 }}
            value={batchSize}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v > 0) setBatchSize(Math.max(1, Math.floor(v)))
            }}
          />
          <TextField
            label="LR"
            size="small"
            type="number"
            inputProps={{ min: 1e-8, step: '0.0001' }}
            sx={{ width: 120 }}
            value={learningRate}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v > 0) setLearningRate(v)
            }}
          />
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: 'flex', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ ml: 0.5 }}>Test losses</Typography>
          <LineChart skipAnimation series={chartSeries} sx={{ height: '300px' }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ ml: 0.5 }}>Train losses</Typography>
          <LineChart skipAnimation series={trainChartSeries} sx={{ height: '300px' }} />
        </Box>
      </Box>

      {/* Controls and epoch progress */}
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <ButtonGroup variant="contained" aria-label="train-controls">
            <Tooltip title={mnistReady ? 'Start' : 'Download MNIST to enable'}>
              <span>
                <Button
                  color="primary"
                  onClick={startPressed}
                  disabled={!mnistReady || running}
                  aria-label="start"
                >
                  <PlayArrowIcon />
                  Start
                </Button>
              </span>
            </Tooltip>

            <Tooltip title="Stop">
              <span>
                <Button
                  color="primary"
                  onClick={stop}
                  disabled={!running}
                  aria-label="stop"
                >
                  <StopIcon />
                  Stop
                </Button>
              </span>
            </Tooltip>

            <Tooltip title="Reset">
              <span>
                <Button
                  color="error"
                  onClick={reset}
                  aria-label="reset"
                  disabled={!mnistReady}
                >
                  <ReplayIcon />
                  Reset
                </Button>
              </span>
            </Tooltip>
          </ButtonGroup>

          <Box sx={{ ml: 3 }}>
            <ButtonGroup
              variant="outlined"
              aria-label="epoch-loss-group"
              component="div"
              sx={{ display: 'inline-flex' }}
            >
              <Button
                component="div"
                startIcon={<TimelineIcon />}
                size="medium"
                sx={{ textTransform: 'none', pointerEvents: 'none' }}
              >
                Epoch {epoch}
              </Button>

              <Button
                component="div"
                startIcon={<TrendingDownIcon />}
                size="medium"
                sx={{ textTransform: 'none', pointerEvents: 'none' }}
              >
                {normalizedLatest !== null ? `Loss ${normalizedLatest.toFixed(4)}` : 'Loss —'}
              </Button>
            </ButtonGroup>
          </Box>
        </Stack>
  <Box sx={{ flex: 1 }} />
  <Box sx={{ width: 180 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Epoch progress</Typography>
            <Typography variant="caption" color="text.secondary">
              {epochTotalBatches > 0 ? `${epochBatch}/${epochTotalBatches}` : '—'}
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={epochProgress} sx={{ height: 4 }} />
        </Box>
      </Box>

      {/* Visualization section */}
      {vizEnabled && (
        <>
        <Divider sx={{ my: 2 }} />
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>Visualization</Typography>
            <Button size="small" variant="outlined" onClick={() => refreshVizRef.current && refreshVizRef.current()} disabled={mnistDownloading || !mnistReady || vizRefreshing}>
              {vizRefreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          </Box>
          {vizError && (
            <Alert severity="warning" sx={{ mb: 1 }}>{vizError}</Alert>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            {/* Inputs column */}
            <Box>
              {vizInputs.labelled && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>Inputs (labelled)</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 84px)', gap: 1 }}>
                    {[0,1,2,3].map((i) => (
                      <Box key={i} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                        {vizInputs.labelled.imagesUrls?.[i] && (
                          <img src={vizInputs.labelled.imagesUrls[i]} alt={`mnist-${i}`} width={84} height={84} style={{ borderRadius: 4, background: '#0001', imageRendering: 'pixelated' }} />
                        )}
                        {vizInputs.labelled.labels?.[i] && <LabelBars vec={vizInputs.labelled.labels[i]} widthPx={84} />}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
              {vizInputs.random && vizInputs.random.labels && (
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>Inputs (random labels)</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 84px)', gap: 1 }}>
                    {vizInputs.random.labels.map((vec, i) => (
                      <LabelBars key={i} vec={vec} widthPx={84} />
                    ))}
                  </Box>
                </Box>
              )}
              {vizInputs.randomVector && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Random vector input present (not displayed).
                </Typography>
              )}
              {!vizInputs.labelled && !vizInputs.random && !vizInputs.randomVector && (
                <Typography variant="caption" color="text.secondary">No data inputs for this diagram.</Typography>
              )}
            </Box>

            {/* Outputs column */}
            <Box>
              {Object.keys(vizOutputs || {}).length === 0 && (
                <Typography variant="caption" color="text.secondary">No outputs available.</Typography>
              )}
              <Stack spacing={1}>
                {Object.keys(vizOutputs || {}).sort().map((nodeType) => (
                  <Box key={nodeType} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>{boxByType.get(nodeType)?.label || nodeType}</Typography>
                    <Stack spacing={1}>
                      {Object.keys(vizOutputs[nodeType]).map((idx) => {
                        const entry = vizOutputs[nodeType][idx]
                        return (
                          <Box key={idx}>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Wire {idx}</Typography>
                            {entry.kind === 'image' && (
                              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 84px)', gap: 1 }}>
                                {entry.urls.map((u, i) => (
                                  <img key={i} src={u} alt={`out-${nodeType}-${idx}-${i}`} width={84} height={84} style={{ borderRadius: 4, background: '#0001', imageRendering: 'pixelated' }} />
                                ))}
                              </Box>
                            )}
                            {entry.kind === 'labels' && (
                              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 84px)', gap: 1 }}>
                                {entry.samples.map((vec, i) => <LabelBars key={i} vec={vec} widthPx={84} />)}
                              </Box>
                            )}
                            {entry.kind === 'unsupported' && (
                              <Typography variant="caption" color="error.main">Unsupported dim</Typography>
                            )}
                          </Box>
                        )
                      })}
                    </Stack>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>
        </Box>
        </>
      )}
    </Box>
  )
}
