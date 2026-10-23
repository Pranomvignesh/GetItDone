import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Fill maskable and Apple icons with the brand green rather than white padding.
    maskable: { ...minimal2023Preset.maskable, padding: 0.15, resizeOptions: { background: '#218355' } },
    apple: { ...minimal2023Preset.apple, padding: 0.05, resizeOptions: { background: '#218355' } },
  },
  images: ['public/icon.svg'],
})
