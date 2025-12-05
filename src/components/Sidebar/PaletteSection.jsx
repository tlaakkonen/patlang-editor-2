import React from 'react'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Collapse from '@mui/material/Collapse'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import IconButton from '@mui/material/IconButton'
import AddIcon from '@mui/icons-material/Add'
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder'
import FolderIcon from '@mui/icons-material/Folder'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
// Divider removed between folders and root per request
import Box from '@mui/material/Box'
import { usePalette } from '../../state/PaletteContext'
import PaletteItem from './PaletteItem'
import AddBoxDialog from './AddBoxDialog'
import AddWireDialog from './AddWireDialog'
import AddDiagramDialog from './AddDiagramDialog'
import AddEquationDialog from './AddEquationDialog'
import AddFolderDialog from './AddFolderDialog'

export default function PaletteSection({ title, items = [], folders = [], sectionKey }) {
  const [open, setOpen] = React.useState(true)
  const { setSections, nodes, setEdges, findItemByType } = usePalette()
  // dialog open state (local to this section)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingItem, setEditingItem] = React.useState(null)
  // folder dialog state
  const [folderDialogOpen, setFolderDialogOpen] = React.useState(false)
  const [editingFolder, setEditingFolder] = React.useState(null)
  const [folderHoverIndex, setFolderHoverIndex] = React.useState(null)
  const [folderOpenMap, setFolderOpenMap] = React.useState({})
  const [headerDragOver, setHeaderDragOver] = React.useState(false)

  function toggle() {
    setOpen((v) => !v)
  }

  function onAdd(e) {
    // prevent the add click from toggling the section
    e.stopPropagation()
    if (!sectionKey) return
    // open dialog for creating a new item (no editingItem)
    setEditingItem(null)
    setDialogOpen(true)
  }

  function openEdit(item, e) {
    // open dialog to edit an existing palette item
    if (e && e.stopPropagation) e.stopPropagation()
    setEditingItem(item)
    setDialogOpen(true)
  }
  function onAddFolder(e) {
    e.stopPropagation()
    setEditingFolder(null)
    setFolderDialogOpen(true)
  }
  function openEditFolder(folder, e) {
    if (e && e.stopPropagation) e.stopPropagation()
    setEditingFolder(folder)
    setFolderDialogOpen(true)
  }
  function handleDialogClose(item) {
    setDialogOpen(false)
    if (!item) return
    if (editingItem) {
      // update existing item (preserve type)
      setSections((prev) =>
        prev.map((s) =>
          s.key === sectionKey
            ? { ...s, items: (s.items || []).map((it) => (it.type === editingItem.type ? { ...it, ...item, type: editingItem.type } : it)) }
            : s,
        ),
      )
      // If a wire's color changed, update any existing edges that use that wire type
      if (sectionKey === 'wires') {
        const newColor = item.color
        const wireType = editingItem.type
        if (newColor && wireType) {
          setEdges((prev) => {
            return (prev || []).map((e) => {
              try {
                // determine wire type from the source node's output handle
                const srcNode = (nodes || []).find((n) => n.id === e.source)
                if (!srcNode) return e
                const boxDef = findItemByType ? findItemByType('boxes', srcNode.data?.type) : null
                if (!boxDef) return e
                const m = String(e.sourceHandle || '').match(/out-(\d+)$/)
                if (!m) return e
                const idx = parseInt(m[1], 10)
                const wType = (boxDef.outputs || [])[idx]
                if (wType !== wireType) return e
                return { ...e, style: { ...(e.style || {}), stroke: newColor } }
              } catch (err) {
                return e
              }
            })
          })
          // also update stored edges inside diagrams in the sections payload
          setSections((prev) =>
            (prev || []).map((s) => {
              if (s.key !== 'diagrams') return s
              const items = (s.items || []).map((diag) => {
                const edges = (diag.edges || []).map((e) => {
                  try {
                    const srcNode = (diag.nodes || []).find((n) => n.id === e.source)
                    if (!srcNode) return e
                    const boxDef = findItemByType ? findItemByType('boxes', srcNode.data?.type) : null
                    if (!boxDef) return e
                    const m = String(e.sourceHandle || '').match(/out-(\d+)$/)
                    if (!m) return e
                    const idx = parseInt(m[1], 10)
                    const wType = (boxDef.outputs || [])[idx]
                    if (wType !== wireType) return e
                    return { ...e, style: { ...(e.style || {}), stroke: newColor } }
                  } catch (err) {
                    return e
                  }
                })
                return { ...diag, edges }
              })
              return { ...s, items }
            }),
          )
        }
      }
    } else {
      // append new item
      setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, items: [...(s.items || []), item] } : s)))
    }
  }

  function handleFolderDialogClose(folder) {
    setFolderDialogOpen(false)
    if (!sectionKey) return
    if (!folder) return
    if (editingFolder) {
      // rename existing folder
      setSections((prev) =>
        prev.map((s) =>
          s.key === sectionKey
            ? { ...s, folders: (s.folders || []).map((f) => (f.id === editingFolder.id ? { ...f, name: folder.name } : f)) }
            : s,
        ),
      )
    } else {
      // add new folder at end
      setSections((prev) =>
        prev.map((s) => (s.key === sectionKey ? { ...s, folders: [ ...(s.folders || []), folder ] } : s)),
      )
      setFolderOpenMap((m) => ({ ...m, [folder.id]: true }))
    }
  }

  // group items by folderId (unknown or falsy -> root)
  const folderList = Array.isArray(folders) ? folders : []
  const folderIdSet = new Set(folderList.map((f) => f.id))
  const itemsByFolder = React.useMemo(() => {
    const map = new Map()
    for (const f of folderList) map.set(f.id, [])
    const root = []
    for (const it of items || []) {
      const fid = it.folderId && folderIdSet.has(it.folderId) ? it.folderId : undefined
      if (fid) map.get(fid).push(it)
      else root.push({ ...it, folderId: undefined })
    }
    return { map, root }
  }, [items, folderIdSet, folderList])

  // initialize open state for unknown folders to true
  React.useEffect(() => {
    const next = { ...folderOpenMap }
    let changed = false
    for (const f of folderList) {
      if (!(f.id in next)) {
        next[f.id] = true
        changed = true
      }
    }
    if (changed) setFolderOpenMap(next)
  }, [folderList])

  function moveOrReorderItemInSection(section, fromFolderId, fromIndex, toFolderId, toIndex) {
    // Safely compute moving inside flat s.items while respecting group order
    const all = Array.isArray(section.items) ? [...section.items] : []
    const validFolderIds = new Set((section.folders || []).map((f) => f.id))
    const norm = (fid) => (fid && validFolderIds.has(fid) ? fid : undefined)
    const fromF = norm(fromFolderId)
    const toF = norm(toFolderId)

    const grouped = all.map((it, idx) => ({ it, idx, gid: norm(it.folderId) }))
    const fromGroup = grouped.filter((e) => e.gid === fromF)
    if (fromIndex < 0 || fromIndex >= fromGroup.length) return section
    const moving = fromGroup[fromIndex]

    // remove moving item from array
    const without = all.filter((_, i) => i !== moving.idx)

    // recompute grouped view after removal
    const regroup = without.map((it, idx) => ({ it, idx, gid: norm(it.folderId) }))
    const destGroup = regroup.filter((e) => e.gid === toF)

    // clamp toIndex
    const tIndex = Math.max(0, Math.min(toIndex ?? destGroup.length, destGroup.length))

    // compute insertion absolute index
    let insertAt
    if (destGroup.length === 0) {
      insertAt = without.length // append to end when group empty
    } else if (tIndex >= destGroup.length) {
      insertAt = destGroup[destGroup.length - 1].idx + 1
    } else {
      insertAt = destGroup[tIndex].idx
    }

    const movedItem = { ...moving.it, folderId: toF }
    const result = [...without.slice(0, insertAt), movedItem, ...without.slice(insertAt)]
    return { ...section, items: result }
  }

  function handleDeleteFolder(folder, e) {
    if (e && e.stopPropagation) e.stopPropagation()
    setSections((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s
        const fid = folder.id
        const nextFolders = (s.folders || []).filter((f) => f.id !== fid)
        const nextItems = (s.items || []).map((it) => (it.folderId === fid ? { ...it, folderId: undefined } : it))
        return { ...s, folders: nextFolders, items: nextItems }
      }),
    )
  }

  function onFolderDragStart(e, folderIndex) {
    try {
      e.dataTransfer.setData('application/x-palette-item', JSON.stringify({ sectionKey, index: folderIndex, itemType: 'folder' }))
    } catch {}
    e.dataTransfer.effectAllowed = 'move'
  }
  function onFolderDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  function onFolderDrop(e, folderIndex, folder) {
    e.preventDefault()
    setFolderHoverIndex(null)
    const raw = e.dataTransfer.getData('application/x-palette-item')
    if (!raw) return
    let payload
    try { payload = JSON.parse(raw) } catch { return }
    if (!payload || payload.sectionKey !== sectionKey) return
    if (payload.itemType === 'folder') {
      const from = payload.index
      const to = folderIndex
      if (from === undefined || to === undefined || from === to) return
      setSections((prev) =>
        prev.map((s) => {
          if (s.key !== sectionKey) return s
          const fl = Array.isArray(s.folders) ? [...s.folders] : []
          if (from < 0 || from >= fl.length || to < 0 || to > fl.length) return s
          const [mv] = fl.splice(from, 1)
          fl.splice(to, 0, mv)
          return { ...s, folders: fl }
        }),
      )
    } else if (payload.itemType === 'item') {
      // move item into this folder, append to end of this folder group
      const fromFolderId = payload.fromFolderId
      const fromIndex = payload.index
      const toFolderId = folder?.id
      setSections((prev) =>
        prev.map((s) => {
          if (s.key !== sectionKey) return s
          const grouped = (s.items || []).filter(() => true)
          // determine current length of this folder group to append
          const validFolderIds = new Set((s.folders || []).map((f) => f.id))
          const toCount = grouped.filter((it) => (it.folderId && validFolderIds.has(it.folderId) ? it.folderId : undefined) === toFolderId).length
          return moveOrReorderItemInSection(s, fromFolderId, fromIndex, toFolderId, toCount)
        }),
      )
    }
  }

  return (
    <List
      component="nav"
      dense
      disablePadding
    >
      <ListItemButton
        onClick={toggle}
        sx={{ pl: 1, bgcolor: headerDragOver ? 'action.hover' : undefined }}
        onDragOver={(e) => {
          // Allow dropping items onto the section header to move to root
          e.preventDefault()
          setHeaderDragOver(true)
          e.dataTransfer.dropEffect = 'move'
        }}
        onDragLeave={() => setHeaderDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setHeaderDragOver(false)
          const raw = e.dataTransfer.getData('application/x-palette-item')
          if (!raw) return
          let payload
          try { payload = JSON.parse(raw) } catch { return }
          if (!payload || payload.sectionKey !== sectionKey) return
          if (payload.itemType !== 'item') return
          const fromFolderId = payload.fromFolderId
          const fromIndex = payload.index
          setSections((prev) => prev.map((s) => {
            if (s.key !== sectionKey) return s
            const rootCount = (s.items || []).filter((it) => !it.folderId || !(s.folders || []).some((f) => f.id === it.folderId)).length
            return moveOrReorderItemInSection(s, fromFolderId, fromIndex, undefined, rootCount)
          }))
        }}
      >
        <ListItemText primary={title} />
        <IconButton edge="end" aria-label={`add-folder-${sectionKey}`} onClick={onAddFolder} size="small" sx={{ mr: 1 }}>
          <CreateNewFolderIcon fontSize="small" />
        </IconButton>
        <IconButton edge="end" aria-label={`add-${sectionKey}`} onClick={onAdd} size="small" sx={{ mr: 1 }}>
          <AddIcon fontSize="small" />
        </IconButton>
        {open ? <ExpandLess /> : <ExpandMore />}
      </ListItemButton>

      <Collapse in={open} timeout="auto" unmountOnExit>
        <List disablePadding>
          {/* Root group (items without folder) first */}
          {(itemsByFolder.root || []).map((it, idx) => (
            <PaletteItem
              key={it.type}
              item={it}
              index={idx}
              folderId={undefined}
              sectionKey={sectionKey}
              onEdit={(e) => openEdit(it, e)}
            />
          ))}

          {/* Folders below the root items */}
          {folderList.map((folder, fIdx) => (
            <Box key={folder.id} sx={{ mt: 1, mb: 1, borderRadius: 1, overflow: 'hidden' }}>
              <ListItem
                draggable
                onDragStart={(e) => onFolderDragStart(e, fIdx)}
                onDragOver={(e) => { onFolderDragOver(e); setFolderHoverIndex(fIdx) }}
                onDragLeave={() => setFolderHoverIndex(null)}
                onDrop={(e) => onFolderDrop(e, fIdx, folder)}
                sx={{
                  borderRadius: 1,
                  bgcolor: folderHoverIndex === fIdx ? 'action.hover' : 'action.selectedOpacity',
                }}
                secondaryAction={
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      bgcolor: 'background.paper',
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 1,
                    }}
                  >
                    <IconButton edge="end" aria-label="edit-folder" onClick={(e) => openEditFolder(folder, e)} sx={{ mr: 1 }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton edge="end" aria-label="delete-folder" onClick={(e) => handleDeleteFolder(folder, e)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }} onClick={() => setFolderOpenMap((m) => ({ ...m, [folder.id]: !m[folder.id] }))}>
                  {folderOpenMap[folder.id] ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                  <FolderIcon fontSize="small" />
                  <ListItemText primary={folder.name} />
                </Box>
              </ListItem>
              <Collapse in={!!folderOpenMap[folder.id]} timeout="auto" unmountOnExit>
                <List disablePadding sx={{ pl: 2 }}>
                  {(itemsByFolder.map.get(folder.id) || []).map((it, idx) => (
                    <PaletteItem
                      key={it.type}
                      item={it}
                      index={idx}
                      folderId={folder.id}
                      sectionKey={sectionKey}
                      onEdit={(e) => openEdit(it, e)}
                    />
                  ))}
                </List>
              </Collapse>
            </Box>
          ))}
        </List>
      </Collapse>
      {/* Dialogs for creating new items in this section */}
      {sectionKey === 'boxes' && (
        <AddBoxDialog open={dialogOpen} onClose={handleDialogClose} sectionKey={sectionKey} initialItem={editingItem} />
      )}
      {sectionKey === 'wires' && (
        <AddWireDialog open={dialogOpen} onClose={handleDialogClose} sectionKey={sectionKey} initialItem={editingItem} />
      )}
      {sectionKey === 'diagrams' && (
        <AddDiagramDialog open={dialogOpen} onClose={handleDialogClose} sectionKey={sectionKey} initialItem={editingItem} />
      )}
      {sectionKey === 'equations' && (
        <AddEquationDialog open={dialogOpen} onClose={handleDialogClose} sectionKey={sectionKey} initialItem={editingItem} />
      )}
      {/* Add/Rename Folder dialog */}
      <AddFolderDialog open={folderDialogOpen} onClose={handleFolderDialogClose} initialFolder={editingFolder} />
    </List>
  )
}
