import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const frontendDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(frontendDir, '..')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '')
  const frontendPort = Number(env.FRONTEND_PORT || 8889)

  return {
    envDir: projectRoot,
    plugins: [react()],
    server: {
      port: frontendPort,
      host: true,
      watch: {
        ignored: ['**/src/assets/builtin-avatars/**']
      }
    },
  }
})
