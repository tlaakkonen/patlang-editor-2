import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [react(), basicSsl()],
  // Ensure .bin files (like src/assets/mnist.bin) are treated as assets
  // and can be imported using the static import syntax (import mnistUrl from '...')
  assetsInclude: ['**/*.bin'],
})
