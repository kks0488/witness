import { defineConfig, configDefaults } from 'vitest/config';
export default defineConfig(({command}) => ({
  // Private local credentials may be used by dev; never bake them into a build artifact.
  envPrefix: command === 'serve' ? 'VITE_' : 'WITNESS_PUBLIC_',
  test: {exclude: [...configDefaults.exclude, 'backup*/**']},
  server: {host: '127.0.0.1', strictPort: true}
}));
