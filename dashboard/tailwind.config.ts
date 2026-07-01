import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Upwork-inspired green palette
        upwork: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#14A800', // Primary Upwork green
          600: '#108A00',
          700: '#0d7a00',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Override emerald with Upwork green
        emerald: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#22c55e',
          500: '#14A800',
          600: '#108A00',
          700: '#0d7a00',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(20, 168, 0, 0.3)',
        'glow-lg': '0 0 40px rgba(20, 168, 0, 0.4)',
      },
    },
  },
  plugins: [],
}

export default config
