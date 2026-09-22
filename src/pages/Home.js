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
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        height: '100vh',
        width: '100vw',
        paddingBottom: '15vh'
      }}
    >
      <button
        className="btn-primary animate-pulse-btn"
        onClick={handleStart}
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