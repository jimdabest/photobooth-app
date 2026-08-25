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
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '170vh',
        width: '100vw'
      }}
    >
      <button 
        className="btn-primary animate-pulse-btn" 
        onClick={(e) => {
          e.stopPropagation(); // Tránh bị xung đột sự kiện click vào nút
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