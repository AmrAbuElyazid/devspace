import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/index.css'

function App(): React.JSX.Element {
  return (
    <div className="flex items-center justify-center h-screen bg-[var(--background)] text-[var(--foreground)]">
      <h1 className="text-4xl font-bold tracking-tight text-[var(--primary)]">DevSpace</h1>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
