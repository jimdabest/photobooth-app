import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import TemplateSelect from './pages/TemplateSelect';
import Capture from './pages/Capture';
import Review from './pages/Review';
import Admin from './pages/Admin'; // <--- Import trang Admin
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/templates" element={<TemplateSelect />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/review" element={<Review />} />
        
        {/* Tuyến đường ẩn dành cho Admin */}
        <Route path="/admin" element={<Admin />} /> 
      </Routes>
    </Router>
  );
}

export default App;