import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Proxy des CDN d'images de cartes : ils n'envoient pas d'en-têtes CORS,
// donc pour l'export du plan en image (html2canvas) on les sert en même origine.
const proxyImagesCartes = {
  '/img-lorcast': {
    target: 'https://cards.lorcast.io',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/img-lorcast/, ''),
  },
  '/img-dreamborn': {
    target: 'https://cdn.dreamborn.ink',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/img-dreamborn/, ''),
  },
  '/img-ravensburger': {
    target: 'https://api.lorcana.ravensburger.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/img-ravensburger/, ''),
  },
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: proxyImagesCartes,
  },
  preview: {
    proxy: proxyImagesCartes,
  },
})
