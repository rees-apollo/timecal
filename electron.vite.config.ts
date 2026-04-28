import { defineConfig } from 'electron-vite'
import { externalizeDepsPlugin } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron'],
        input: {
          index: path.resolve('./src/main/index.ts'),
          'outlook-worker': path.resolve('./src/main/managers/api-clients/outlook-worker.ts')
        },
        output: {
          format: 'es',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    optimizeDeps: {
      exclude: ['bits-ui', '@lucide/svelte']
    },
    plugins: [svelte({ compilerOptions: { css: 'injected' } })],
    resolve: {
      alias: {
        $lib: path.resolve('./src/renderer/src/lib')
      }
    }
  }
})
