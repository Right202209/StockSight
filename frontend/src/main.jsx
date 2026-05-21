import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

const initialTheme = (() => {
  try {
    const stored = localStorage.getItem('stocksight-theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
})()
document.body.classList.toggle('dark', initialTheme === 'dark')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App initialTheme={initialTheme} />
  </React.StrictMode>,
)
