import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { I18nProvider } from './i18n.jsx'
import './index.css'

// Theme detection happens in an inline <script> in index.html, before first
// paint, to avoid a flash of light background. Here we only read back what it
// decided and hand the value to React as initial state.
const initialTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App initialTheme={initialTheme} />
    </I18nProvider>
  </React.StrictMode>,
)
