// Training helper utilities
// Add training-related helper functions here (data loaders, loss computation,
// batching utilities, metrics, etc.).

// Placeholder file created so the project has a dedicated place for training
// helpers. Implementation will be added as the training code is developed.

import * as tf from '@tensorflow/tfjs'
import { get as idbGet } from 'idb-keyval'

// Create TF.js models for learner boxes found in the palette `sections`.
// The `wizardState` is used to determine wire dimensions and per-learner
// configuration. Returns a map { [learnerType]: tf.Model }.
export async function createModelsForLearners(sections, wizardState) {
	const boxesSection = (sections || []).find((s) => s.key === 'boxes')
	const boxes = boxesSection?.items || []
	const learners = boxes.filter((b) => b.kind === 'learner')

	const wireDims = wizardState?.wireDims || {}

	const models = {}

	const parseDim = (v) => {
		const n = Number(v)
		return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
	}

	// Fallback stopGradient for environments where tf.stopGradient is unavailable.
	// Creates a new constant tensor with the same value, breaking backprop links.
	function stopGradientFallback(x) {
		// Using dataSync() to materialize the value; acceptable here since it's
		// only used when gradient gating is needed and tensors are small.
		return tf.tidy(() => tf.tensor(x.dataSync(), x.shape, x.dtype))
	}

	for (const l of learners) {
		const inputs = l.inputs || []
		const outputs = l.outputs || []
		// Sum declared input wire dimensions; if there are no inputs, allow a bias-only
		// pathway by forcing an effective input dimension of 1. This lets zero-input
		// learners operate with a constant input vector at execution time.
		const rawInputDim = inputs.reduce((acc, t) => acc + parseDim(wireDims[t]), 0)
		const inputDim = Math.max(1, rawInputDim)
		const outputDim = outputs.reduce((acc, t) => acc + parseDim(wireDims[t]), 0)

		const cfg = (wizardState?.learnerConfigs || {})[l.type] || {}
		const arch = (cfg.arch || 'Linear')

		// Build a simple sequential model
		const model = tf.sequential()
		if (arch === 'Linear') {
			model.add(tf.layers.dense({ inputShape: [inputDim], units: outputDim }))
		} else if (arch === 'MLP' || arch === 'mlp') {
			const hidden = cfg.hiddenUnits || [64, 32]
			// first hidden layer needs inputShape
			model.add(tf.layers.dense({ inputShape: [inputDim], units: hidden[0], activation: 'relu' }))
			for (let i = 1; i < hidden.length; i++) model.add(tf.layers.dense({ units: hidden[i], activation: 'relu' }))
			model.add(tf.layers.dense({ units: outputDim }))
		} else {
			// fallback to simple linear mapping
			model.add(tf.layers.dense({ inputShape: [inputDim], units: outputDim }))
		}

		// Do not compile here — compilation/optimizer/loss will be configured
		// when the training loop starts. Returning uncompiled models gives
		// the caller flexibility and avoids accidental optimizer state resets.

		models[l.type] = model
	}

	return models
}

// ---------- Helpers for training ----------

// Load MNIST packed Float32Array from IndexedDB and expose as tensors.
// Storage layout: [60000, 794] where 0..783 = image, 784..793 = one-hot label.
// Train rows: [0..49999], Test rows: [50000..59999]
export async function loadMnistIndexedDB() {
	const floats = await idbGet('patlang:mnist')
	if (!floats || !(floats instanceof Float32Array)) {
		throw new Error('MNIST dataset not found in IndexedDB. Download it first.')
	}
	const NUM_ROWS = 60000
	const FEAT = 784
	const LAB = 10
	const TOTAL = FEAT + LAB
	if (floats.length !== NUM_ROWS * TOTAL) {
		throw new Error(`Unexpected MNIST length: ${floats.length}`)
	}
	// Create a base tensor view [60000, 794]
	const base = tf.tensor2d(floats, [NUM_ROWS, TOTAL])
	const trainRows = 50000
	const testRows = NUM_ROWS - trainRows
	const trainBase = base.slice([0, 0], [trainRows, TOTAL])
	const testBase = base.slice([trainRows, 0], [testRows, TOTAL])
	const trainX = trainBase.slice([0, 0], [trainRows, FEAT])
	const trainY = trainBase.slice([0, FEAT], [trainRows, LAB])
	const testX = testBase.slice([0, 0], [testRows, FEAT])
	const testY = testBase.slice([0, FEAT], [testRows, LAB])
	// Keep only the useful tensors; dispose large base views
	base.dispose()
	trainBase.dispose()
	testBase.dispose()
	return { trainX, trainY, testX, testY }
}

// Create batches of indices for iteration.
export function* createBatchIndices(n, batchSize = 128, shuffle = true) {
	if (shuffle) {
		// tf.util.createShuffledIndices returns Uint32Array
		const idx = tf.util.createShuffledIndices(n)
		for (let start = 0; start < n; start += batchSize) {
			const end = Math.min(n, start + batchSize)
			const arr = new Int32Array(end - start)
			for (let i = start; i < end; i++) arr[i - start] = idx[i]
			yield arr
		}
	} else {
		for (let start = 0; start < n; start += batchSize) {
			const end = Math.min(n, start + batchSize)
			const arr = new Int32Array(end - start)
			for (let i = start; i < end; i++) arr[i - start] = i
			yield arr
		}
	}
}

const parseHandleIndex = (handle) => {
	if (!handle) return -1
	const m = /-(\d+)$/.exec(handle)
	return m ? parseInt(m[1], 10) : -1
}

const parseDim = (v) => {
	const n = Number(v)
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

// Split a single tensor by output wire types using wireDims mapping.
function splitByWireDims(tensor, wireTypes, wireDims) {
	if ((wireTypes?.length || 0) <= 1) return [tensor]
	const sizes = wireTypes.map((t) => parseDim(wireDims?.[t]))
	const total = sizes.reduce((a, b) => a + b, 0)
	const lastDim = tensor.shape[tensor.shape.length - 1]
	if (total !== lastDim) {
		throw new Error(`Output dimension mismatch: expected ${total}, got ${lastDim}`)
	}
	return tf.split(tensor, sizes, -1)
}

// Concatenate in handle order along the last dimension.
function concatInputs(inputs) {
	if (!inputs || inputs.length === 0) throw new Error('Missing inputs')
	if (inputs.length === 1) return inputs[0]
	return tf.concat(inputs, -1)
}

// Resolve data tensors for a data node given current batch and wizard assignments.
// Supports two assignments per data box:
//  - 'labelled': for a data box with two outputs (image 784 and label 10)
//  - 'random': for a data box with one output (label 10)
function resolveDataTensorsForNode(boxDef, batchX, batchY, wireDims, assignment, useProvidedRandom = false) {
	const outputs = boxDef?.outputs || []
	const out = []
	if (assignment === 'labelled') {
		for (let i = 0; i < outputs.length; i++) {
			const dim = parseDim(wireDims?.[outputs[i]])
			if (dim === 784) out.push(batchX)
			else if (dim === 10) out.push(batchY)
			else throw new Error(`Data node output dim ${dim} not supported for 'labelled' assignment`)
		}
		return out
	}
	if (assignment === 'random') {
		if (outputs.length !== 1) throw new Error('Random assignment requires a single-output data box')
		const dim = parseDim(wireDims?.[outputs[0]])
		if (dim !== 10) throw new Error('Random assignment supported only for label dimension 10')
		if (useProvidedRandom && batchY) {
			// Use provided labels tensor when requested (e.g., visualization)
			out.push(batchY)
		} else {
			const bsz = batchY ? batchY.shape[0] : batchX.shape[0]
			const labels = tf.tidy(() => tf.oneHot(tf.randomUniform([bsz], 0, 10, 'int32'), 10).toFloat())
			out.push(labels)
		}
		return out
	}
	if (assignment === 'random-vector') {
		if (outputs.length < 1) throw new Error('Random Vector assignment requires at least one output')
		const bsz = batchY ? batchY.shape[0] : batchX.shape[0]
		for (let i = 0; i < outputs.length; i++) {
			const dim = parseDim(wireDims?.[outputs[i]])
			const vec = tf.tidy(() => tf.randomNormal([bsz, dim]))
			out.push(vec)
		}
		return out
	}
	throw new Error(`Unsupported data assignment '${assignment}' for data box ${boxDef?.type}`)
}

// Build an executor for a given diagram that produces tensors arriving to
// each output node's input handles, keyed by output node type and input index.
export function buildDiagramExecutor(diagram, sections, wireDims, models) {
	const boxesSection = (sections || []).find((s) => s.key === 'boxes')
	const boxDefs = boxesSection?.items || []
	const boxByType = new Map(boxDefs.map((b) => [b.type, b]))

	const nodes = diagram?.nodes || []
	const edges = diagram?.edges || []

	const nodeById = new Map(nodes.map((n) => [n.id, n]))
	const incoming = new Map()
	const outgoing = new Map()
	for (const n of nodes) { incoming.set(n.id, []); outgoing.set(n.id, []) }
	for (const e of edges) {
		if (!incoming.has(e.target)) incoming.set(e.target, [])
		if (!outgoing.has(e.source)) outgoing.set(e.source, [])
		incoming.get(e.target).push(e)
		outgoing.get(e.source).push(e)
	}

	// Topological order (Kahn)
	const indeg = new Map(nodes.map((n) => [n.id, 0]))
	for (const e of edges) indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
	const q = []
	for (const n of nodes) if ((indeg.get(n.id) || 0) === 0) q.push(n.id)
	const topo = []
	while (q.length) {
		const id = q.shift()
		topo.push(id)
		for (const e of outgoing.get(id) || []) {
			const t = e.target
			const v = (indeg.get(t) || 0) - 1
			indeg.set(t, v)
			if (v === 0) q.push(t)
		}
	}
	if (topo.length !== nodes.length) throw new Error('Diagram has cycles or disconnected nodes')

	// Precompute for each output node input: whether source is data, and its upstream box type
	const outputsIsDataSource = {}
	const outputsUpstreamBoxType = {}
	for (const n of nodes) {
		const node = n
		const boxType = node?.data?.type
		const boxDef = boxByType.get(boxType) || {}
		if (boxDef?.kind === 'output') {
			const inEdges = incoming.get(node.id) || []
			for (const e of inEdges) {
				const idx = parseHandleIndex(e.targetHandle)
				const srcNode = nodeById.get(e.source)
				const srcType = srcNode?.data?.type
				const srcDef = boxByType.get(srcType) || {}
				if (!outputsIsDataSource[boxType]) outputsIsDataSource[boxType] = {}
				outputsIsDataSource[boxType][idx] = (srcDef?.kind === 'data')
				if (!outputsUpstreamBoxType[boxType]) outputsUpstreamBoxType[boxType] = {}
				outputsUpstreamBoxType[boxType][idx] = srcType
			}
		}
	}

	// Executor function uses per-equation learner gating
	return function execute(batchX, batchY, learnersAllowedSet) {
		// For each node, compute its outputs as array per output handle index
		const produced = new Map() // nodeId -> Tensor[]
		// Collect values that flow into output nodes per their input index
		const outputsForLoss = {} // { [outputNodeType]: { [inputIndex]: Tensor } }

		for (const id of topo) {
			const node = nodeById.get(id)
			const boxType = node?.data?.type
			const boxDef = boxByType.get(boxType) || {}
			const kind = boxDef?.kind
			const inputsTypes = boxDef?.inputs || []
			const outputsTypes = boxDef?.outputs || []

			// Gather ordered inputs for this node
			const inEdges = (incoming.get(id) || [])
			const byInputIndex = new Map()
			for (const e of inEdges) {
				const tgtIdx = parseHandleIndex(e.targetHandle)
				const srcIdx = parseHandleIndex(e.sourceHandle)
				const srcOuts = produced.get(e.source)
				if (!srcOuts) throw new Error('Source outputs not available')
				byInputIndex.set(tgtIdx, srcOuts[srcIdx])
			}
			const orderedInputs = []
			for (let i = 0; i < inputsTypes.length; i++) {
				if (!byInputIndex.has(i)) throw new Error(`Missing input connection for node ${boxType} input ${i}`)
				orderedInputs.push(byInputIndex.get(i))
			}

			if (kind === 'data') {
				const assignment = execute.__dataAssign?.[boxType]
				const outs = resolveDataTensorsForNode(boxDef, batchX, batchY, wireDims, assignment, !!execute.__useProvidedRandom)
				produced.set(id, outs)
					} else if (kind === 'learner') {
				// Allow zero-input learners by feeding a constant bias input of shape [B,1]
				let x
				if (!orderedInputs || orderedInputs.length === 0) {
					const bsz = batchX ? batchX.shape[0] : (batchY ? batchY.shape[0] : 1)
					x = tf.ones([bsz, 1])
				} else {
					x = concatInputs(orderedInputs)
				}
				const model = models[boxType]
				if (!model) throw new Error(`Model not found for learner ${boxType}`)
						let y = model.apply(x, { training: true })
						const allowed = !learnersAllowedSet || (learnersAllowedSet.size === 0) || learnersAllowedSet.has(boxType)
						if (!allowed) {
							// gradient gating for this equation: detach y from the graph
							// Prefer tf.stopGradient if available; otherwise fall back to a constant tensor
							const hasStop = typeof tf.stopGradient === 'function'
							y = hasStop ? tf.stopGradient(y) : tf.tidy(() => tf.tensor(y.dataSync(), y.shape, y.dtype))
						}
				const outs = splitByWireDims(y, outputsTypes, wireDims)
				produced.set(id, outs)
			} else if (kind === 'output') {
				// For outputs, capture the input tensors (pass-through/aggregate)
				// and also forward as produced outputs if needed by downstream nodes
				// though typically outputs have no outgoing edges.
				const outs = orderedInputs.length > 0 ? orderedInputs : []
				produced.set(id, outs)
				const nodeType = boxType
				if (!outputsForLoss[nodeType]) outputsForLoss[nodeType] = {}
				for (let i = 0; i < inputsTypes.length; i++) {
					outputsForLoss[nodeType][i] = orderedInputs[i]
				}
			} else {
				// Non-data/learner/output kinds are treated as passthrough concat/split if ever added
				if (inputsTypes.length === 0 && outputsTypes.length > 0) {
					// produce zeros if no inputs? Not supported; enforce via validation
					throw new Error(`Unsupported node kind '${kind}' for ${boxType}`)
				}
				produced.set(id, orderedInputs)
			}
		}

		return outputsForLoss
	}

	// Expose the precomputed data-source map for loss selection logic
	execute.__outputsIsDataSource = outputsIsDataSource
	execute.__outputsUpstreamBoxType = outputsUpstreamBoxType
}

// Compute one equation’s weighted loss and return { total, perIndex } where
// perIndex is a map of nodeType->index->scalar tensor.
function computeEquationLoss(lhsMap, rhsMap, rhsIsProbMap, eqLossSpec, weight) {
	let eqLoss = tf.scalar(0)
	const perParts = {}
	const w = Number(weight ?? 1)
	for (const nodeType of Object.keys(eqLossSpec || {})) {
		const idxMap = eqLossSpec[nodeType] || {}
		for (const k of Object.keys(idxMap)) {
			const idx = Number(k)
			const lossType = idxMap[k]
			const lhs = lhsMap?.[nodeType]?.[idx]
			const rhs = rhsMap?.[nodeType]?.[idx]
			if (!lhs || !rhs) throw new Error(`Missing tensors for ${nodeType}[${idx}] in equation loss`)
			let term
			if (lossType === 'CE') {
				// Cross-entropy: lhs are logits. For RHS, use probabilities if the
				// signal flows directly from a data node; otherwise treat RHS as logits.
				term = tf.tidy(() => {
					const rhsIsProb = !!(rhsIsProbMap?.[nodeType]?.[idx])
					const labels = rhsIsProb ? rhs : tf.softmax(rhs)
					const per = tf.losses.softmaxCrossEntropy(labels, lhs)
					return tf.mean(per)
				})
			} else if (lossType === 'BCE') {
				// Binary cross-entropy: lhs are logits. Use probabilities for RHS
				// only when flowing directly from a data node; otherwise treat as logits.
				term = tf.tidy(() => {
					const rhsIsProb = !!(rhsIsProbMap?.[nodeType]?.[idx])
					const labels = rhsIsProb ? rhs : tf.sigmoid(rhs)
					const per = tf.losses.sigmoidCrossEntropy(labels, lhs)
					return tf.mean(per)
				})
			} else if (lossType === 'SSIM') {
				// Structural Similarity for images (approximation using avgPool):
				// reshape to [B,28,28,1], map preds to [0,1], then compute SSIM and return 1-mean(SSIM)
				term = tf.tidy(() => {
					const b = lhs.shape[0]
					const x = tf.sigmoid(tf.reshape(lhs, [b, 28, 28, 1]))
					const y = tf.reshape(rhs, [b, 28, 28, 1])
					const k = 3
					const ksize = [1, k, k, 1]
					const strides = [1, 1, 1, 1]
					const pad = 'same'
					const muX = tf.avgPool(x, ksize, strides, pad)
					const muY = tf.avgPool(y, ksize, strides, pad)
					const x2 = tf.mul(x, x)
					const y2 = tf.mul(y, y)
					const xy = tf.mul(x, y)
					const muX2 = tf.mul(muX, muX)
					const muY2 = tf.mul(muY, muY)
					const sigmaX2 = tf.sub(tf.avgPool(x2, ksize, strides, pad), muX2)
					const sigmaY2 = tf.sub(tf.avgPool(y2, ksize, strides, pad), muY2)
					const sigmaXY = tf.sub(tf.avgPool(xy, ksize, strides, pad), tf.mul(muX, muY))
					const L = 1.0
					const C1 = (0.01 * L) * (0.01 * L)
					const C2 = (0.03 * L) * (0.03 * L)
					const num1 = tf.add(tf.mul(2, tf.mul(muX, muY)), C1)
					const num2 = tf.add(tf.mul(2, sigmaXY), C2)
					const den1 = tf.add(tf.add(muX2, muY2), C1)
					const den2 = tf.add(tf.add(sigmaX2, sigmaY2), C2)
					const ssimMap = tf.div(tf.mul(num1, num2), tf.mul(den1, den2))
					const perImage = tf.mean(ssimMap, [1, 2, 3])
					return tf.sub(1, tf.mean(perImage))
				})
			} else if (lossType === 'L1') {
				term = tf.mean(tf.abs(tf.sub(lhs, rhs)))
			} else { // default L2
				const per = tf.losses.meanSquaredError(rhs, lhs)
				term = tf.mean(per)
			}
			perParts[`${nodeType}:${idx}`] = term
			eqLoss = tf.add(eqLoss, term)
		}
	}
	// weight the equation
	if (w !== 1) eqLoss = tf.mul(eqLoss, tf.scalar(w))
	return { eqLoss, perParts }
}

// Main exported training function: one epoch train + test evaluation
export async function trainOneEpoch({
	models,
	sections,
	wizardState,
	optimizer,
	batchSize = 128,
	shuffle = true,
	onBatchEnd,
}) {
	if (!optimizer) throw new Error('optimizer is required')
	// Prepare data
	const { trainX, trainY, testX, testY } = await loadMnistIndexedDB()

	// Cache executors per diagram
	const diagramsSection = (sections || []).find((s) => s.key === 'diagrams')
	const diagramByType = new Map((diagramsSection?.items || []).map((d) => [d.type, d]))
	const executorCache = new Map()
	const getExecutor = (diagramType) => {
		if (!executorCache.has(diagramType)) {
			const d = diagramByType.get(diagramType)
			if (!d) throw new Error(`Diagram not found: ${diagramType}`)
			const exec = buildDiagramExecutor(d, sections, wizardState?.wireDims || {}, models)
			// Attach data assignment mapping so data nodes know what to output
			exec.__dataAssign = wizardState?.dataAssignments || {}
			executorCache.set(diagramType, exec)
		}
		return executorCache.get(diagramType)
	}

	// Collect equations and their loss/gating configs
	const equationsSection = (sections || []).find((s) => s.key === 'equations')
	const equations = equationsSection?.items || []

	// Trainable variables across all models
	const variables = []
	for (const key of Object.keys(models || {})) {
		const m = models[key]
		for (const w of m.trainableWeights || []) {
			if (w?.val) variables.push(w.val)
		}
	}

	// Helper that builds total and per-equation losses for a given batch
	const buildLosses = (batchX, batchY) => tf.tidy(() => {
		let totalLoss = tf.scalar(0)
		const perEqScalars = {}
		for (const eq of equations) {
			const lhsExec = getExecutor(eq['lhs-type'])
			const rhsExec = getExecutor(eq['rhs-type'])
			const allowed = new Set((wizardState?.outputLearners?.[eq.type]) || [])
			const lhsMap = lhsExec(batchX, batchY, allowed)
			const rhsMap = rhsExec(batchX, batchY, allowed)
			// Determine probability nature of RHS based on upstream data box assignments
			const rhsIsProbMap = {}
			const upstream = rhsExec.__outputsUpstreamBoxType || {}
			for (const nodeType of Object.keys(upstream)) {
				rhsIsProbMap[nodeType] = {}
				for (const idx of Object.keys(upstream[nodeType])) {
					const srcBoxType = upstream[nodeType][idx]
					const assign = (wizardState?.dataAssignments || {})[srcBoxType]
					// Probabilities only when labels are provided by data: 'labelled' or 'random'
					rhsIsProbMap[nodeType][idx] = (assign === 'labelled' || assign === 'random')
				}
			}
			const eqLossSpec = (wizardState?.outputLosses?.[eq.type]) || {}
			const weight = (wizardState?.outputWeights?.[eq.type]) ?? 1
			// translate lhs/rhs maps and compute using rhs source information
			const { eqLoss } = computeEquationLoss(lhsMap, rhsMap, rhsIsProbMap, eqLossSpec, weight)
			totalLoss = tf.add(totalLoss, eqLoss)
			perEqScalars[eq.type] = eqLoss
		}
		return { totalLoss, perEqScalars }
	})

	// Training loop over train split
	const nTrain = trainX.shape[0]
	let batchNum = 0
	const totalBatches = Math.ceil(nTrain / batchSize)
	for (const indices of createBatchIndices(nTrain, batchSize, shuffle)) {
		const bx = tf.gather(trainX, indices)
		const by = tf.gather(trainY, indices)
		let lossTensor
		// Custom differentiable loop using optimizer.computeGradients (no compile/fit)
		await tf.nextFrame()
		const f = () => {
			const { totalLoss } = buildLosses(bx, by)
			return totalLoss
		}
		const { value, grads } = optimizer.computeGradients(f, variables)
		lossTensor = value
		optimizer.applyGradients(grads)
		// Dispose gradient tensors to free memory
		try { Object.values(grads).forEach((g) => g && g.dispose && g.dispose()) } catch {}

		// Read overall train loss (scalar)
		const trainLoss = (await lossTensor.data())[0]
		// Compute per-equation losses separately (forward-only) for logging
		const { perEqScalars } = buildLosses(bx, by)
		const perEq = {}
		for (const eq of equations) {
			const t = perEqScalars[eq.type]
			perEq[eq.type] = t ? (await t.data())[0] : 0
		}
		// Cleanup batch tensors and loss tensors
		tf.dispose([bx, by, lossTensor, ...Object.values(perEqScalars)])
		// Give TFJS a chance to release GL textures between batches
		await tf.nextFrame()

		batchNum += 1
		try { onBatchEnd && onBatchEnd({ batch: batchNum, totalBatches, trainLoss, perEquationTrainLoss: perEq }) } catch {}
	}

	// Evaluation on test split
	const nTest = testX.shape[0]
	let totalCount = 0
	let totalLossSum = 0
	const perEqSum = {}
	for (const eq of equations) perEqSum[eq.type] = 0

	for (const indices of createBatchIndices(nTest, batchSize, false)) {
		const bx = tf.gather(testX, indices)
		const by = tf.gather(testY, indices)
		const { totalLoss, perEqScalars } = buildLosses(bx, by)
		const bsz = bx.shape[0]
		totalCount += bsz
		totalLossSum += (await totalLoss.data())[0] * bsz
		for (const eq of equations) {
			const t = perEqScalars[eq.type]
			perEqSum[eq.type] += (t ? (await t.data())[0] : 0) * bsz
		}
		tf.dispose([bx, by, totalLoss, ...Object.values(perEqScalars)])
		await tf.nextFrame()
	}

	const testLoss = totalLossSum / Math.max(1, totalCount)
	const perEquationTestLoss = {}
	for (const eq of equations) perEquationTestLoss[eq.type] = perEqSum[eq.type] / Math.max(1, totalCount)

	// Dispose dataset tensors to avoid leaks across epochs (we reload per epoch).
	tf.dispose([trainX, trainY, testX, testY])
	await tf.nextFrame()
	return { testLoss, perEquationTestLoss }
}

// Evaluate test losses without training; returns same shape as trainOneEpoch
export async function evaluateTestLoss({
	models,
	sections,
	wizardState,
	batchSize = 128,
}) {
	const { testX, testY } = await loadMnistIndexedDB()

	// Cache executors per diagram
	const diagramsSection = (sections || []).find((s) => s.key === 'diagrams')
	const diagramByType = new Map((diagramsSection?.items || []).map((d) => [d.type, d]))
	const executorCache = new Map()
	const getExecutor = (diagramType) => {
		if (!executorCache.has(diagramType)) {
			const d = diagramByType.get(diagramType)
			if (!d) throw new Error(`Diagram not found: ${diagramType}`)
			const exec = buildDiagramExecutor(d, sections, wizardState?.wireDims || {}, models)
			exec.__dataAssign = wizardState?.dataAssignments || {}
			executorCache.set(diagramType, exec)
		}
		return executorCache.get(diagramType)
	}

	const equationsSection = (sections || []).find((s) => s.key === 'equations')
	const equations = equationsSection?.items || []

	const buildLosses = (batchX, batchY) => tf.tidy(() => {
		let totalLoss = tf.scalar(0)
		const perEqScalars = {}
		for (const eq of equations) {
			const lhsExec = getExecutor(eq['lhs-type'])
			const rhsExec = getExecutor(eq['rhs-type'])
			const allowed = new Set((wizardState?.outputLearners?.[eq.type]) || [])
			const lhsMap = lhsExec(batchX, batchY, allowed)
			const rhsMap = rhsExec(batchX, batchY, allowed)
			// Determine probability nature of RHS based on upstream data box assignments
			const rhsIsProbMap = {}
			const upstream = rhsExec.__outputsUpstreamBoxType || {}
			for (const nodeType of Object.keys(upstream)) {
				rhsIsProbMap[nodeType] = {}
				for (const idx of Object.keys(upstream[nodeType])) {
					const srcBoxType = upstream[nodeType][idx]
					const assign = (wizardState?.dataAssignments || {})[srcBoxType]
					rhsIsProbMap[nodeType][idx] = (assign === 'labelled' || assign === 'random')
				}
			}
			const eqLossSpec = (wizardState?.outputLosses?.[eq.type]) || {}
			const weight = (wizardState?.outputWeights?.[eq.type]) ?? 1
			const { eqLoss } = computeEquationLoss(lhsMap, rhsMap, rhsIsProbMap, eqLossSpec, weight)
			totalLoss = tf.add(totalLoss, eqLoss)
			perEqScalars[eq.type] = eqLoss
		}
		return { totalLoss, perEqScalars }
	})

	const nTest = testX.shape[0]
	let totalCount = 0
	let totalLossSum = 0
	const perEqSum = {}
	for (const eq of equations) perEqSum[eq.type] = 0

	for (const indices of createBatchIndices(nTest, batchSize, false)) {
		const bx = tf.gather(testX, indices)
		const by = tf.gather(testY, indices)
		const { totalLoss, perEqScalars } = buildLosses(bx, by)
		const bsz = bx.shape[0]
		totalCount += bsz
		totalLossSum += (await totalLoss.data())[0] * bsz
		for (const eq of equations) {
			const t = perEqScalars[eq.type]
			perEqSum[eq.type] += (t ? (await t.data())[0] : 0) * bsz
		}
		tf.dispose([bx, by, totalLoss, ...Object.values(perEqScalars)])
	}

	const testLoss = totalLossSum / Math.max(1, totalCount)
	const perEquationTestLoss = {}
	for (const eq of equations) perEquationTestLoss[eq.type] = perEqSum[eq.type] / Math.max(1, totalCount)

	tf.dispose([testX, testY])
	await tf.nextFrame()
	return { testLoss, perEquationTestLoss }
}
