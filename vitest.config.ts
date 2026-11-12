import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Local integration checkouts are external projects with their own runners.
    exclude: [...configDefaults.exclude, '.local/**', 'tools/workbuddy/**'],
    testTimeout: 30000,
  },
}))
