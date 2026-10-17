import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../i18n'
import '../styles/app.css'
import './chart.css'
import { ChartApp } from './ChartApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ChartApp />
  </StrictMode>,
)
