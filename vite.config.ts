import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * `virtual:media-list`: every file under public/nasa with its size in bytes. The game fetches
 * them in the background once the title is up (src/ui/preload.ts), so the rover part does not
 * wait for its map, photos and films. Read from the folder, so it cannot go out of date.
 */
function mediaList(): Plugin {
  const id = 'virtual:media-list', resolved = `\0${id}`
  const walk = (dir: string, base: string): { file: string; bytes: number }[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
      ? walk(join(dir, e.name), `${base}${e.name}/`)
      : [{ file: `${base}${e.name}`, bytes: statSync(join(dir, e.name)).size }])
  return {
    name: 'spacer-media-list',
    resolveId: source => (source === id ? resolved : null),
    load: source => (source === resolved ? `export default ${JSON.stringify(walk('public/nasa', 'nasa/'))}` : null),
  }
}

export default defineConfig({
  base: './',
  plugins: [mediaList()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
})
