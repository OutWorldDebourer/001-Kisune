// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL || 'https://kitsunemakis.pages.dev',
  base: process.env.BASE_PATH || '/',
  // CSS en línea: el CSS son ~34 KB crudos / ~7 KB gzip y bloquea el render.
  // Lighthouse (render-blocking-insight) estima -700 ms en FCP por quitarlo de
  // la cadena crítica. Al incrustarlo en el HTML se elimina una ida y vuelta.
  build: {
    inlineStylesheets: 'always',
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
