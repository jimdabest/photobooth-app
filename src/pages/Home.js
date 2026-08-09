import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="kiosk-container" style={{ justifyContent: 'center' }}>
      <div className="text-instruction">
        <h1 style={{ fontSize: '80px', marginBottom: '20px' }}>PHOTOBOOTH XIN CHÀO</h1>
        <p style={{ fontSize: '30px' }}>Chạm vào màn hình để bắt đầu</p>
      </div>
      <button className="start-btn" onClick={() => navigate('/templates')}>
        BẮT ĐẦU NGAY
      </button>
    </div>
  );
}

export default Home;