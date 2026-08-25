import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import TemplateSelect from './pages/TemplateSelect';
import Capture from './pages/Capture';
import Review from './pages/Review';
import Admin from './pages/Admin'; 
import './App.css';

// =========================================================
// TÍNH NĂNG MỚI: QUẢN LÝ HÌNH NỀN THÔNG MINH (XUYÊN THỦNG CSS)
// =========================================================
function BackgroundManager() {
  const location = useLocation();

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/settings")
      .then(res => res.json())
      .then(data => {
        
        // Tạo một thẻ <style> động để ép các container trong suốt
        let dynamicStyle = document.getElementById('dynamic-bg-style');
        if (!dynamicStyle) {
            dynamicStyle = document.createElement('style');
            dynamicStyle.id = 'dynamic-bg-style';
            document.head.appendChild(dynamicStyle);
        }

        // 1. TRANG ADMIN: Ép nền trắng tinh, gỡ bỏ độ trong suốt
        if (location.pathname.includes('/admin')) {
          document.body.style.backgroundImage = "none";
          document.body.style.backgroundColor = "#ffffff";
          dynamicStyle.innerHTML = ``; // Không can thiệp CSS ở Admin
        } 
        
        // 2. TRANG KIOSK: Áp dụng hình nền và ép trong suốt các thẻ đè lên nó
        else {
          if (data.bg_url) {
            document.body.style.backgroundImage = `url('${data.bg_url}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundPosition = "center";
            document.body.style.backgroundRepeat = "no-repeat";
            document.body.style.backgroundAttachment = "fixed";
            
            // ĐÂY LÀ ĐOẠN QUYẾT ĐỊNH: Ép Root và Kiosk Container phải trong suốt
            dynamicStyle.innerHTML = `
                #root, .kiosk-container {
                    background: transparent !important;
                    background-color: transparent !important;
                }
            `;
          } else {
            // Nếu không có hình nền, trả lại màu mặc định
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = "#f1f5f9";
            dynamicStyle.innerHTML = ``; 
          }
        }
      })
      .catch(err => console.error("Lỗi lấy cài đặt nền:", err));
  }, [location.pathname]); 

  return null; 
}

function App() {
  return (
    <Router>
      <BackgroundManager />
      
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/templates" element={<TemplateSelect />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/review" element={<Review />} />
        
        <Route path="/admin" element={<Admin />} /> 
      </Routes>
    </Router>
  );
}

export default App;