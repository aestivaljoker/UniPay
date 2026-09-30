/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Tailwind's default opacity scale jumps 10 → 20; the UI leans on the
      // hairline values in between for borders and dividers.
      opacity: { 6: '0.06', 8: '0.08', 12: '0.12', 15: '0.15', 35: '0.35' },
      borderOpacity: { 6: '0.06', 8: '0.08', 12: '0.12', 15: '0.15' },
      colors: {
        // UniPay brand — a deep university indigo with an electric mint accent.
        ink: {
          950: '#070A16',
          900: '#0B1020',
          850: '#101833',
          800: '#141D3D',
          700: '#1D2A55',
          600: '#2A3A70',
          500: '#3B4E8E',
        },
        brand: {
          50: '#EEF2FF',
          100: '#DDE4FF',
          200: '#BCC9FF',
          300: '#94A8FF',
          400: '#6B82FB',
          500: '#4B5FE8',
          600: '#3646C4',
          700: '#2A379B',
          800: '#1F2872',
          900: '#161C52',
        },
        mint: {
          300: '#7DF3C4',
          400: '#3FE3A5',
          500: '#12C98A',
          600: '#0BA372',
        },
        gold: { 400: '#FFC75A', 500: '#F5A623' },
        danger: { 400: '#FF7B7B', 500: '#F04545', 600: '#C92A2A' },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(9,14,32,.08), 0 8px 24px -8px rgba(9,14,32,.12)',
        lift: '0 20px 48px -16px rgba(9,14,32,.35)',
        glow: '0 0 0 1px rgba(75,95,232,.25), 0 12px 40px -12px rgba(75,95,232,.55)',
        mint: '0 12px 36px -10px rgba(18,201,138,.55)',
      },
      backgroundImage: {
        'wallet-card': 'linear-gradient(135deg,#2A379B 0%,#4B5FE8 45%,#3646C4 100%)',
        'mint-grad': 'linear-gradient(135deg,#12C98A 0%,#3FE3A5 100%)',
        'admin-shell': 'radial-gradient(1200px 600px at 12% -8%,rgba(75,95,232,.22),transparent 60%),radial-gradient(900px 500px at 92% 4%,rgba(18,201,138,.14),transparent 55%)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(10px)' }, '100%': { opacity: 1, transform: 'none' } },
        'slide-in': { '0%': { opacity: 0, transform: 'translateX(-14px)' }, '100%': { opacity: 1, transform: 'none' } },
        'pop-in': { '0%': { opacity: 0, transform: 'scale(.92)' }, '60%': { transform: 'scale(1.02)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(18,201,138,.55)' },
          '70%': { boxShadow: '0 0 0 12px rgba(18,201,138,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(18,201,138,0)' },
        },
        'flash-row': {
          '0%': { backgroundColor: 'rgba(18,201,138,.22)' },
          '100%': { backgroundColor: 'transparent' },
        },
        shimmer: { '0%': { backgroundPosition: '-500px 0' }, '100%': { backgroundPosition: '500px 0' } },
        'draw-check': { '0%': { strokeDashoffset: 60 }, '100%': { strokeDashoffset: 0 } },
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%,60%': { transform: 'translateX(-7px)' },
          '40%,80%': { transform: 'translateX(7px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .45s cubic-bezier(.22,1,.36,1) both',
        'slide-in': 'slide-in .35s cubic-bezier(.22,1,.36,1) both',
        'pop-in': 'pop-in .4s cubic-bezier(.22,1,.36,1) both',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        'flash-row': 'flash-row 2.4s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
        'draw-check': 'draw-check .5s ease-out .15s both',
        shake: 'shake .42s cubic-bezier(.36,.07,.19,.97) both',
      },
    },
  },
  plugins: [],
};
