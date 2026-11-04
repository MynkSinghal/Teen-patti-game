import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Private Teen Patti',
    short_name: 'Teen Patti',
    description: 'A private Teen Patti table for friends. Virtual chips only.',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#0a0d0c',
    theme_color: '#0a0d0c',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
