import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { I18nProvider } from './i18n.jsx'
import DemoBanner from './demo/DemoBanner.jsx'
import './index.css'

// Demo entry point for the static GitHub Pages build (see
// vite.pages.config.js). It renders the *same* <App /> as the real
// frontend; only the module `./api` resolves to differs. That is the whole
// trick: the deployed demo can't drift from the product because it is the
// product, wired to sample data.
//
// Theme detection happens in an inline <script> in index-pages.html, before
// first paint, to avoid a flash of light background.

const initialTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <DemoBanner />
      <App initialTheme={initialTheme} />
    </I18nProvider>
  </React.StrictMode>,
)
