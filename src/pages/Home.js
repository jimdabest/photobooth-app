import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function Home() {
  const navigate = useNavigate();

  return (
    <div className="kiosk-container">
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <h1 style={{ fontSize: 'clamp(4rem, 8vw, 8rem)', fontWeight: '900', letterSpacing: '2px', color: '#0f172a', textShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
          PHOTOBOOTH
        </h1>
        <p style={{ fontSize: 'clamp(1.5rem, 3vw, 3rem)', color: '#475569', marginTop: '1rem' }}>
          Chạm vào màn hình để bắt đầu trải nghiệm
        </p>
      </div>
      
      <button 
        className="btn-primary animate-pulse-btn" 
        onClick={() => navigate('/templates')}
      >
        BẮT ĐẦU NGAY
      </button>
    </div>
  );
}

export default Home;