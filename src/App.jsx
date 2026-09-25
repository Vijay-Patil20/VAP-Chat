import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import CreateChat from './pages/CreateChat'
import JoinChat from './pages/JoinChat'
import ChatRoom from './pages/ChatRoom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateChat />} />
        <Route path="/join" element={<JoinChat />} />
        <Route path="/chat" element={<ChatRoom />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App