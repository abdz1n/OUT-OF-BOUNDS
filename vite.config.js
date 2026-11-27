import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' keeps every URL relative, so the build works on GitHub Pages under /OUT-OF-BOUNDS/ and from any folder.
// The design kit lives in public/assets as plain files, so the app's own bundle goes to app/ instead of assets/.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { assetsDir: 'app', target: 'es2022' },
});
