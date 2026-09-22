import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function Home() {
  const navigate = useNavigate();

  const handleStart = () => {
    navigate('/templates');
  };

  return (
    <div 
      className="kiosk-container" 
      onClick={handleStart}
      style={{ 
        cursor: 'pointer', 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'flex-end',   // 👈 Đẩy nội dung xuống dưới
        height: '100vh',
        width: '100vw',
        paddingBottom: '15vh'         // 👈 Cách mép dưới 15% màn hình
      }}
    >
      <button 
        className="btn-primary animate-pulse-btn" 
        onClick={(e) => {
          e.stopPropagation();
          handleStart();
        }}
        style={{
          fontSize: 'clamp(1.5rem, 3vw, 2.5rem)',
          padding: '20px 50px'
        }}
      >
        BẮT ĐẦU NGAY
      </button>
    </div>
  );
}

export default Home;