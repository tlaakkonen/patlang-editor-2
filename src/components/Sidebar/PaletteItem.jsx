import React from 'react'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { usePalette } from '../../state/PaletteContext'

export default function PaletteItem({ item, sectionKey, index, onEdit }) {
  const { setSections, nodes, edges, setNodes, setEdges } = usePalette()
  const [isDragOver, setIsDragOver] = React.useState(false)
  const isOpened = sectionKey === 'diagrams' && !!item.opened

  function onDelete(e) {
    // prevent the delete click from starting a drag or selecting the item
    e.stopPropagation()
    if (!sectionKey) return
    // Prevent deleting a diagram that is currently opened (button should be disabled)
    if (isOpened) return
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, items: s.items.filter((it) => it.type !== item.type) } : s)),
    )
  }
  function handleEdit(e) {
    // prevent edit click from starting a drag or selecting the item
    e.stopPropagation()
    if (onEdit) onEdit(e)
  }
  
  function onDragStart(e) {
    // set a custom mime type so Canvas can read the node type
    // used by Canvas when dragging a Box onto the canvas
    e.dataTransfer.setData('application/x-node-type', item.type)
    // used for reordering items inside the palette: include section key and index
    try {
      e.dataTransfer.setData('application/x-palette-item', JSON.stringify({ sectionKey, index }))
    } catch (err) {
      // some browsers may throw when setting non-standard types, ignore
    }
    e.dataTransfer.effectAllowed = 'copyMove'
  }
  function onDragOver(e) {
    // allow drop within the palette
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }
  function onDragLeave() {
    setIsDragOver(false)
  }
  function onDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    // attempt to parse the palette-item payload
    const raw = e.dataTransfer.getData('application/x-palette-item')
    if (!raw) return
    let payload = null
    try {
      payload = JSON.parse(raw)
    } catch (err) {
      return
    }
    // only allow reordering within the same section
    if (!payload || payload.sectionKey !== sectionKey) return
    const from = payload.index
    const to = index
    if (from === undefined || to === undefined || from === to) return
    setSections((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s
        const items = Array.isArray(s.items) ? [...s.items] : []
        if (from < 0 || from >= items.length || to < 0 || to > items.length) return s
        const [moved] = items.splice(from, 1)
        items.splice(to, 0, moved)
        return { ...s, items }
      }),
    )
  }
  function handleDoubleClick(e) {
    // prevent double-click from starting a drag or selecting the item
    e.stopPropagation()
    if (sectionKey !== 'diagrams') return
    // first persist the current canvas into whichever diagram is currently opened
    setSections((prev) =>
      prev.map((s) =>
        s.key === 'diagrams'
          ? { ...s, items: s.items.map((it) => (it.opened ? { ...it, nodes: nodes, edges: edges } : it)) }
          : s,
      ),
    )
    // set the clicked diagram to opened and clear opened on all other diagrams
    setSections((prev) =>
      prev.map((s) =>
        s.key === 'diagrams'
          ? { ...s, items: s.items.map((it) => ({ ...it, opened: it.type === item.type })) }
          : s,
      ),
    )
    // load the diagram's stored canvas state (if any) into the shared canvas state
    // if the diagram has no stored nodes/edges, clear the canvas
    setNodes(item.nodes || [])
    setEdges(item.edges || [])
  }

  return (
    <ListItem
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDoubleClick={handleDoubleClick}
      sx={{
        borderRadius: 1,
        bgcolor: isDragOver ? 'action.hover' : isOpened ? 'action.selected' : 'inherit',
        border: isOpened ? '1px solid rgba(25,118,210,0.24)' : 'none',
      }}
      secondaryAction={
      <>
        <IconButton edge="end" aria-label="edit" onClick={handleEdit} sx={{ mr: 1 }}>
          <EditIcon fontSize="small" />
        </IconButton>
        {isOpened ? (
          <Tooltip title="Cannot delete the open diagram">
            <span>
              <IconButton edge="end" aria-label="delete" disabled>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        ) : (
          <IconButton edge="end" aria-label="delete" onClick={onDelete}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </>
    }>
      {/* color swatch on the left; only for wires or boxes */}
      {(sectionKey === 'wires' || sectionKey === 'boxes') && (
        <Box
          sx={{
            width: 14,
            height: 14,
            borderRadius: 1,
            backgroundColor: item.color || 'transparent',
            mr: 1,
            border: item.color ? '1px solid rgba(0,0,0,0.12)' : 'none',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* for diagrams that are opened in the canvas, show a small icon swatch on the left (same size as wire/box swatches) */}
      {isOpened && (
        <Box
          sx={{
            width: 14,
            height: 14,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mr: 1,
            pointerEvents: 'none',
          }}
        >
          <VisibilityIcon sx={{ width: 12, height: 12, color: 'primary.main' }} />
        </Box>
      )}
      <ListItemText primary={item.label} />
      {/* No snackbar: deletion is disabled and tooltip explains why when a diagram is opened */}
    </ListItem>
  )
}
