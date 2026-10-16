import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function Home() {
  const navigate = useNavigate();

  const handleStart = () => {
    navigate('/templates');
  };

  return (
    <main className="kiosk-container home-screen">
      <button
        className="btn-primary touch-btn home-start-button"
        onClick={handleStart}
      >
        BẮT ĐẦU NGAY
      </button>
    </main>
  );
}

export default Home;
