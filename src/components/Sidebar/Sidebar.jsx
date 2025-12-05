import React from 'react'
import Box from '@mui/material/Box'
import List from '@mui/material/List'
import Divider from '@mui/material/Divider'
import PaletteSection from './PaletteSection'
import { usePalette } from '../../state/PaletteContext'

export default function Sidebar({ sections: propSections }) {
  const { sections: ctxSections } = usePalette()
  const sections = propSections || ctxSections

  return (
    <Box sx={{ p: 1 }}>
      <List disablePadding>
        {sections.map((s, idx) => (
          <Box key={s.title} sx={{ pb: idx === sections.length - 1 ? 0 : 2 }}>
            <PaletteSection title={s.title} items={s.items} folders={s.folders} sectionKey={s.key} />
            {idx < sections.length - 1 && <Divider sx={{ mt: 2 }} />}
          </Box>
        ))}
      </List>
    </Box>
  )
}
