import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<div>TarmacView — Login</div>} />
        <Route path="/operator-center/*" element={<div>Operator Center</div>} />
        <Route path="/coordinator-center/*" element={<div>Coordinator Center</div>} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
