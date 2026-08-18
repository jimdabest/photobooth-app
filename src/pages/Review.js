import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import '../App.css';

function Review() {
  const location = useLocation();
  const navigate = useNavigate();
  const imageUrl = location.state?.imageUrl; 
  
  const [timeLeft, setTimeLeft] = useState(30);
  const [isSettingLoaded, setIsSettingLoaded] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/settings')
      .then(res => res.json())
      .then(data => {
        setTimeLeft(data.review_timeout || 30);
        setIsSettingLoaded(true);
      })
      .catch(err => {
        console.error("Lỗi lấy cài đặt từ Admin:", err);
        setIsSettingLoaded(true); 
      });
  }, []);

  useEffect(() => {
    if (!isSettingLoaded) return; 

    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer);
          navigate('/');
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate, isSettingLoaded]);

  return (
    <div className="kiosk-container" style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', marginBottom: '1.5rem', color: '#0f172a' }}>
        ẢNH CỦA BẠN ĐÃ SẴN SÀNG!
      </h1>
      
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row',
        gap: '4rem', 
        alignItems: 'center', 
        justifyContent: 'center',
        width: '100%',
        height: '72vh'
      }}>
        
        {/* CỘT TRÁI: ẢNH THÀNH PHẨM (Tự động ôm sát theo dáng ảnh thật, không bị kéo mập) */}
        <div style={{ 
          height: '100%', 
          maxHeight: '650px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'white', 
          padding: '0.8rem', 
          borderRadius: '1.5rem', 
          boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
          transform: 'rotate(-1.5deg)'
        }}>
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt="Thành phẩm" 
              style={{ 
                height: '100%', 
                width: 'auto',
                maxWidth: '45vw',
                objectFit: 'contain',
                borderRadius: '0.8rem',
                display: 'block'
              }} 
            />
          ) : (
            <div style={{ padding: '2rem', color: '#64748b', fontSize: '1.5rem' }}>
              Đang tải ảnh...
            </div>
          )}
        </div>

        {/* CỘT PHẢI: KHU VỰC QUÉT MÃ QR */}
        <div style={{ 
          display: 'flex', flexDirection: 'column', alignItems: 'center', 
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px)',
          padding: '2.5rem 3rem', borderRadius: '2rem', border: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.05)'
        }}>
          <p style={{ fontSize: '1.4rem', color: '#334155', marginBottom: '2rem', textAlign: 'center', maxWidth: '320px', fontWeight: '600' }}>
            Dùng Camera điện thoại quét mã QR để tải ảnh chất lượng cao
          </p>
          
          <div style={{ padding: '1.2rem', backgroundColor: 'white', borderRadius: '1.2rem', boxShadow: '0 10px 25px rgba(0,0,0,0.08)' }}>
            <QRCodeCanvas value={imageUrl || "https://google.com"} size={200} level={"H"} />
          </div>

          <button className="btn-primary" onClick={() => navigate('/')} style={{ marginTop: '2.5rem', width: '100%', fontSize: '1.6rem', padding: '1rem 2rem' }}>
            HOÀN TẤT ({timeLeft}s)
          </button>
        </div>

      </div>
    </div>
  );
}

export default Review;