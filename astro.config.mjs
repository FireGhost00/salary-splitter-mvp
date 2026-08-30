// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

import vercel from '@astrojs/vercel';

// https://astro.build/config
export default defineConfig({
  // Toda la app es dinámica (sesión por request): renderizado en servidor por
  // defecto. Evita el 404 nativo de Vercel en rutas sin archivo estático.
  output: 'server',

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [react()],

  // Adaptador serverless de Vercel para SSR.
  adapter: vercel(),
});
