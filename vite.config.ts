import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // Supabase publishable keys are intentionally exposed to the client. The
  // project secret key is never included in this allow-list.
  envPrefix: ['VITE_', 'TAURI_', 'NEXT_PUBLIC_'],
  build: { target: ['es2022', 'chrome105', 'safari13'] },
})
