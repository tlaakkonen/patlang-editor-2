import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, addEdge, Controls, ControlButton, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './CustomNode';
import { usePalette } from '../../state/PaletteContext'
import { isMobile, isIOS } from 'react-device-detect'
import DeleteIcon from '@mui/icons-material/Delete'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ContentPasteIcon from '@mui/icons-material/ContentPaste'

const nodeTypes = { custom: CustomNode };

export default function Canvas() {
    const reactFlowWrapper = useRef(null)
    const reactFlowInstance = useRef(null)
    const idCounter = useRef(10)
    const edgeIdCounter = useRef(1)
    // history of canvas states for undo (nodes/edges)
    const undoStackRef = useRef([])
    const redoStackRef = useRef([])
    const isUndoingRef = useRef(false)
    const lastHistoryPushAtRef = useRef(0)
    const HISTORY_LIMIT = 100
    // in-app clipboard (kept in-memory within the app session)
    const clipboardRef = useRef(null)

    const { findItemByType, nodes, setNodes, edges, setEdges, setSections } = usePalette()
    const [selectedNodes, setSelectedNodes] = useState([])
    const [selectedEdges, setSelectedEdges] = useState([])
    // keep live refs to current nodes/edges so we can snapshot right before changes
    const nodesRef = useRef(nodes)
    const edgesRef = useRef(edges)
    useEffect(() => {
        nodesRef.current = nodes
    }, [nodes])
    useEffect(() => {
        edgesRef.current = edges
    }, [edges])

    // deep snapshot helper
    const snapshotState = useCallback(() => ({
        nodes: JSON.parse(JSON.stringify(nodesRef.current || [])),
        edges: JSON.parse(JSON.stringify(edgesRef.current || [])),
    }), [])

    // push into undo history with basic throttling for drag-move spam
    const pushHistory = useCallback(() => {
        if (isUndoingRef.current) return
        const now = Date.now()
        // throttle very frequent pushes to avoid flooding during drags
        if (now - (lastHistoryPushAtRef.current || 0) < 120) return
        lastHistoryPushAtRef.current = now
        const next = undoStackRef.current.concat([snapshotState()])
        // cap history size
        if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT)
        undoStackRef.current = next
        // any new user action invalidates redo chain
        redoStackRef.current = []
    }, [snapshotState])

    const undo = useCallback(() => {
        const stack = undoStackRef.current
        if (!stack || stack.length === 0) return
        const current = snapshotState()
        const prev = stack[stack.length - 1]
        undoStackRef.current = stack.slice(0, -1)
        isUndoingRef.current = true
        try {
            setNodes(prev.nodes || [])
            setEdges(prev.edges || [])
            // push current state into redo stack
            const rnext = redoStackRef.current.concat([current])
            if (rnext.length > HISTORY_LIMIT) rnext.splice(0, rnext.length - HISTORY_LIMIT)
            redoStackRef.current = rnext
        } finally {
            // small timeout to ensure React state batch completes before allowing history push again
            setTimeout(() => {
                isUndoingRef.current = false
            }, 0)
        }
    }, [setNodes, setEdges, snapshotState])

    const redo = useCallback(() => {
        const rstack = redoStackRef.current
        if (!rstack || rstack.length === 0) return
        const current = snapshotState()
        const nextState = rstack[rstack.length - 1]
        redoStackRef.current = rstack.slice(0, -1)
        // moving forward: push current to undo
        const unext = undoStackRef.current.concat([current])
        if (unext.length > HISTORY_LIMIT) unext.splice(0, unext.length - HISTORY_LIMIT)
        undoStackRef.current = unext
        isUndoingRef.current = true
        try {
            setNodes(nextState.nodes || [])
            setEdges(nextState.edges || [])
        } finally {
            setTimeout(() => {
                isUndoingRef.current = false
            }, 0)
        }
    }, [setNodes, setEdges, snapshotState])

    // keyboard handler added below after copy/paste callbacks

    // helper: compute viewport center in flow coordinates
    const getFlowCenter = useCallback(() => {
        if (!reactFlowWrapper.current || !reactFlowInstance.current) return { x: 0, y: 0 }
        const rect = reactFlowWrapper.current.getBoundingClientRect()
        const screenPt = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        return reactFlowInstance.current.screenToFlowPosition(screenPt)
    }, [])

    // COPY current selection (selected nodes + internal edges)
    const copySelection = useCallback(() => {
        if (!selectedNodes || selectedNodes.length === 0) return
        const selectedIds = new Set(selectedNodes.map((n) => n.id))
        // capture full node objects from current state to ensure positions are up to date
        const nodesToCopy = (nodesRef.current || []).filter((n) => selectedIds.has(n.id))
        if (nodesToCopy.length === 0) return
        // internal edges where both ends are in the selected node set
        const edgesToCopy = (edgesRef.current || []).filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target))
        // compute center of selection
        const cx = nodesToCopy.reduce((acc, n) => acc + (n.position?.x || 0), 0) / nodesToCopy.length
        const cy = nodesToCopy.reduce((acc, n) => acc + (n.position?.y || 0), 0) / nodesToCopy.length
        const payload = {
            v: 1,
            kind: 'patlang/canvas-clipboard',
            center: { x: cx, y: cy },
            nodes: nodesToCopy,
            edges: edgesToCopy,
        }
        clipboardRef.current = payload
    }, [selectedNodes])

    // PASTE from clipboard
    const pasteClipboard = useCallback(() => {
        const data = clipboardRef.current
        if (!data) return
        if (!data || data.kind !== 'patlang/canvas-clipboard' || !Array.isArray(data.nodes)) return

        // anchor at viewport center
        const anchor = getFlowCenter()
        const sourceCenter = data.center || { x: 0, y: 0 }
        const dx = anchor.x - sourceCenter.x
        const dy = anchor.y - sourceCenter.y

        // create id remap for nodes
        const idMap = new Map()
        const existingIds = new Set((nodesRef.current || []).map((n) => n.id))
        function nextNodeId() {
            let nid
            do {
                nid = `n_${idCounter.current++}`
            } while (existingIds.has(nid))
            existingIds.add(nid)
            return nid
        }
        function nextEdgeId() {
            return `e_${edgeIdCounter.current++}`
        }

        const clonedNodes = data.nodes.map((n) => {
            const newId = nextNodeId()
            idMap.set(n.id, newId)
            return {
                ...n,
                id: newId,
                selected: true,
                position: {
                    x: (n.position?.x || 0) + dx,
                    y: (n.position?.y || 0) + dy,
                },
            }
        })

        // rebuild edges only between cloned nodes
        const clonedEdges = (Array.isArray(data.edges) ? data.edges : [])
            .filter((e) => idMap.has(e.source) && idMap.has(e.target))
            .map((e) => ({
                ...e,
                id: nextEdgeId(),
                source: idMap.get(e.source),
                target: idMap.get(e.target),
            }))

        // clear selection on existing nodes
        pushHistory()
        setNodes((prev) => prev.map((n) => ({ ...n, selected: false })).concat(clonedNodes))
        if (clonedEdges.length > 0) {
            setEdges((prev) => prev.concat(clonedEdges))
        }
    }, [getFlowCenter, pushHistory, setNodes, setEdges])
    
    // keyboard handler for undo/redo and copy/paste (placed after copy/paste callbacks)
    useEffect(() => {
        function onKeyDown(e) {
            // ignore input fields to avoid hijacking typing
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : ''
            const isTyping = tag === 'input' || tag === 'textarea' || e.isComposing
            if (isTyping) return
            const key = (e.key || '').toLowerCase()
            // COPY (in-app clipboard only)
            if (key === 'c' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                copySelection()
                return
            }
            // PASTE (from in-app clipboard)
            if (key === 'v' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                pasteClipboard()
                return
            }
            if (key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
                e.preventDefault()
                redo()
                return
            }
            if ((key === 'y' && (e.ctrlKey || e.metaKey)) || (key === 'z' && (e.metaKey || e.ctrlKey))) {
                e.preventDefault()
                if (key === 'y' || e.shiftKey) {
                    redo()
                } else {
                    undo()
                }
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [undo, redo, copySelection, pasteClipboard])
    
    const onNodesChange = useCallback(
        (changes) => {
            // Only record to history for meaningful changes excluding node moves.
            // We explicitly ignore 'position' changes so moving nodes is NOT undoable/redoable.
            const meaningful = (changes || []).some((c) => c.type !== 'select' && c.type !== 'dimensions' && c.type !== 'position')
            if (meaningful) pushHistory()
            setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot))
        },
        [setNodes, pushHistory],
    );
    const onEdgesChange = useCallback(
        (changes) => {
            const meaningful = (changes || []).some((c) => c.type !== 'select')
            if (meaningful) pushHistory()
            setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot))
        },
        [setEdges, pushHistory],
    );
    const onConnect = useCallback(
        (params) => {
            // enforce that the wire type of the source handle and target handle match
            const { source, sourceHandle, target, targetHandle } = params || {}
            if (!source || !target) return

            const srcNode = nodes.find((n) => n.id === source)
            const tgtNode = nodes.find((n) => n.id === target)
            if (!srcNode || !tgtNode) return

            // helper to parse handle id like 'out-0' or 'in-1'
            function parseHandle(h) {
                if (!h) return null
                const m = String(h).match(/(in|out)-(\d+)/)
                if (!m) return null
                return { side: m[1], index: parseInt(m[2], 10) }
            }

            const srcHandle = parseHandle(sourceHandle)
            const tgtHandle = parseHandle(targetHandle)
            if (!srcHandle || !tgtHandle) return

            // lookup palette definitions for each node's type
            const srcPalette = findItemByType ? findItemByType('boxes', srcNode.data?.type) : null
            const tgtPalette = findItemByType ? findItemByType('boxes', tgtNode.data?.type) : null
            if (!srcPalette || !tgtPalette) return

            const srcWire = (srcPalette.outputs || [])[srcHandle.index]
            const tgtWire = (tgtPalette.inputs || [])[tgtHandle.index]

            if (!srcWire || !tgtWire) return
            // require exact match
            if (srcWire !== tgtWire) {
                // reject the connection
                return
            }

            // prevent multiple edges connecting to the same input handle
            // allow only one connection per target input handle (target is always an input)
            const alreadyConnected = (edges || []).some((e) => e.target === target && e.targetHandle === targetHandle)
            if (alreadyConnected) {
                // reject: input handle already has a connection
                return
            }

            // allowed: create the edge and style it using the wire color
            const wireColor = (function () {
                const wire = findItemByType ? findItemByType('wires', srcWire) : null
                return wire?.color || undefined
            })()

            pushHistory()
            setEdges((edgesSnapshot) => addEdge({ ...params, style: { stroke: wireColor, strokeWidth: 3 } }, edgesSnapshot))
        },
        [nodes, findItemByType, edges, setEdges],
    );

    // update connection preview color when a connection is started
    const [connectionLineStyle, setConnectionLineStyle] = useState({})

    const onConnectStart = useCallback(
        (event, { nodeId, handleId, handleType }) => {
            // determine wire type from the source handle
            const srcNode = nodes.find((n) => n.id === nodeId)
            if (!srcNode) return
            const palette = findItemByType ? findItemByType('boxes', srcNode.data?.type) : null
            if (!palette) return

            // handleId expected like 'out-0' or 'in-1'
            const idxMatch = String(handleId).match(/-(\d+)$/)
            if (!idxMatch) return
            const idx = parseInt(idxMatch[1], 10)

            const wireType = handleType === 'source' ? (palette.outputs || [])[idx] : (palette.inputs || [])[idx]
            if (!wireType) return
            const wire = findItemByType ? findItemByType('wires', wireType) : null
            if (!wire) return

            setConnectionLineStyle({ stroke: wire.color, strokeWidth: 3 })
        },
        [nodes, findItemByType],
    )

    const onConnectEnd = useCallback(() => {
        setConnectionLineStyle({})
    }, [])

    function onInit(instance) {
        reactFlowInstance.current = instance
    }

    function onDragOver(event) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
    }

    function onDrop(event) {
        event.preventDefault()
        if (!reactFlowWrapper.current || !reactFlowInstance.current) return

        const type = event.dataTransfer.getData('application/x-node-type')
        if (!type) return

        // only allow drops for items defined in the 'boxes' section
        const def = findItemByType ? findItemByType('boxes', type) : null
        if (!def) return

        // Use the react-flow instance helper to map screen pixels to flow coordinates
        const position = reactFlowInstance.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        const id = `n_${idCounter.current++}`
        // node data only contains the type; other defaults are resolved by the renderer via the palette
        const newNode = {
            id,
            type: 'custom',
            position,
            data: {
                type: type,
            },
        }

        pushHistory()
        setNodes((nds) => nds.concat(newNode))
    }

    // Debounced persist: save nodes/edges into the opened diagram after user stops changing
    // the canvas for a short interval. This reduces frequent updates during drags.
    const saveTimer = useRef(null)
    useEffect(() => {
        // clear any pending timer
        if (saveTimer.current) clearTimeout(saveTimer.current)

        // schedule a save after 500ms of inactivity
        saveTimer.current = setTimeout(() => {
            setSections((prev) => {
                if (!prev) return prev
                const diagSection = prev.find((s) => s.key === 'diagrams')
                if (!diagSection) return prev
                const opened = diagSection.items.find((it) => it.opened)
                if (!opened) return prev

                // Only replace the item if nodes/edges differ (shallow reference compare)
                const updatedItems = diagSection.items.map((it) =>
                    it.type === opened.type
                        ? (it.nodes === nodes && it.edges === edges ? it : { ...it, nodes: nodes, edges: edges })
                        : it,
                )

                return prev.map((s) => (s.key === 'diagrams' ? { ...s, items: updatedItems } : s))
            })
        }, 500)

        return () => {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current)
                saveTimer.current = null
            }
        }
    }, [nodes, edges, setSections])

    return (
        <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%', position: 'relative' }} onDragOver={onDragOver} onDrop={onDrop}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onInit={onInit}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                connectionLineStyle={connectionLineStyle}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onSelectionChange={({ nodes: selNodes, edges: selEdges }) => {
                    setSelectedNodes(selNodes || [])
                    setSelectedEdges(selEdges || [])
                }}
                onConnect={onConnect}
                fitView
                panOnScroll={!isMobile}
                selectionOnDrag={!isMobile}
                panOnDrag={isMobile}
            >
                    <Controls>
                        {(isMobile || isIOS) && (
                            <>
                                <ControlButton onClick={() => undo()} title="Undo">
                                    <UndoIcon />
                                </ControlButton>
                                <ControlButton onClick={() => redo()} title="Redo">
                                    <RedoIcon />
                                </ControlButton>
                                <ControlButton onClick={() => copySelection()} title="Copy selection">
                                    <ContentCopyIcon />
                                </ControlButton>
                                <ControlButton onClick={() => pasteClipboard()} title="Paste">
                                    <ContentPasteIcon />
                                </ControlButton>
                                <ControlButton
                                    onClick={() => {
                                        if (!(selectedNodes.length > 0 || selectedEdges.length > 0)) return
                                        const nodeIds = (selectedNodes || []).map((n) => n.id)
                                        const edgeIds = (selectedEdges || []).map((e) => e.id)
                                        if (nodeIds.length > 0) {
                                            pushHistory()
                                            setNodes((nds) => nds.filter((n) => !nodeIds.includes(n.id)))
                                        }
                                        if (edgeIds.length > 0) {
                                            // ensure we only push once if only edges are removed
                                            if (nodeIds.length === 0) pushHistory()
                                            setEdges((eds) => eds.filter((e) => !edgeIds.includes(e.id)))
                                        }
                                        setSelectedNodes([])
                                        setSelectedEdges([])
                                    }}
                                    title={(selectedNodes.length > 0 || selectedEdges.length > 0) ? 'Delete selected' : 'Select an item to delete'}
                                    disabled={!(selectedNodes.length > 0 || selectedEdges.length > 0)}
                                >
                                    <DeleteIcon className="delete-button"/>
                                </ControlButton>
                            </>
                        )}
                    </Controls>
                <Background />
            </ReactFlow>
        </div>
    )
}
