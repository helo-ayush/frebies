import React from 'react'
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import MixMaker from './pages/MixMaker'
import Transcribe from './pages/Transcribe'
import Layout from './pages/Layout'
import Dashboard from './pages/Dashboard'
import ProtectedRoute from "./components/ProtectedRoute";

const App = () => {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Layout/>}>
          <Route index element={<Home/>} />

          <Route path='dashboard'>
            <Route index element={<ProtectedRoute> <Dashboard/> </ProtectedRoute>} />
            <Route path='mix-maker' element={<ProtectedRoute> <MixMaker/> </ProtectedRoute>} />
            <Route path='transcribe' element={<ProtectedRoute> <Transcribe/>  </ProtectedRoute>} />
          </Route>
        </Route>
      </Routes>
    </div>
  )
}

export default App