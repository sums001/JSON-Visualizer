import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite build --mode extension` builds the same app as an unpacked Chrome extension in dist-extension/.
export default defineConfig(({ mode }) => {
  const extension = mode === 'extension';
  return {
    plugins: [react(), extension && extensionFiles()],
    // the extension adds its settings page (options.html) as a second page
    build: extension ? { outDir: 'dist-extension', rollupOptions: { input: { index: 'index.html', options: 'options.html' } } } : {},
  };
});

// Adds the manifest, content script and service worker from extension/ next to the built app,
// with the manifest's version taken from package.json.
function extensionFiles() {
  return {
    name: 'prism-extension',
    generateBundle() {
      const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
      for (const fileName of readdirSync('extension')) {
        let source = readFileSync(`extension/${fileName}`, 'utf8');
        if (fileName === 'manifest.json') source = JSON.stringify({ ...JSON.parse(source), version }, null, 2) + '\n';
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
  };
}
