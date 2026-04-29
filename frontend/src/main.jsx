import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthInteractionProvider } from './context/AuthInteractionContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthInteractionProvider>
      <App />
    </AuthInteractionProvider>
  </StrictMode>,
)
