import { defineConfig, configDefaults } from 'vitest/config';
export default defineConfig(({command}) => ({
  // Private local credentials may be used by dev; never bake them into a build artifact.
  // A hosted build opts in with WITNESS_HOSTED_BUILD=1 and may carry only the public Firebase web
  // configuration (API key, project ID, app ID, App Check site key). The debug token is refused
  // outside dev by src/models/firebase.ts.
  envPrefix: command === 'serve' || process.env.WITNESS_HOSTED_BUILD === '1' ? 'VITE_' : 'WITNESS_PUBLIC_',
  test: {exclude: [...configDefaults.exclude, 'backup*/**']},
  server: {host: '127.0.0.1', strictPort: true}
}));
