// Generation helper stubs
// Each function accepts the `wizardState` and a snapshot of `sections`
// and returns an object: { content: string, mimeType: string, filename: string }
// The actual generation logic is intentionally left as a placeholder.

export function generatePython(wizardState, sections) {
  // TODO: implement Python code generation based on wizardState and sections
  // sections is a snapshot (array) of the palette sections at the time of download
  const content = "" // placeholder: generated python source as string
  return {
    content,
    mimeType: 'text/x-python',
    filename: 'generated.py'
  }
}

export function generateNotebook(wizardState, sections) {
  // TODO: implement notebook generation (ipynb JSON) based on wizardState and sections
  // Minimal placeholder: an empty notebook structure
  const nb = {
    cells: [],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  }
  return {
    content: JSON.stringify(nb, null, 2),
    mimeType: 'application/x-ipynb+json',
    filename: 'generated.ipynb'
  }
}

export default { generatePython, generateNotebook }
