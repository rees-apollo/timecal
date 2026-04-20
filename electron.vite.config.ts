import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

export default defineConfig({
  main: {},
  preload: {},
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
