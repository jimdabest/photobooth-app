import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import '../App.css';

function Review() {
  const location = useLocation();
  const navigate = useNavigate();
  const imageUrl = location.state?.imageUrl; 
  
  // Thêm biến trạng thái để lưu thời gian đếm ngược (30 giây)
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    // Thiết lập bộ đếm lùi mỗi 1 giây (1000ms)
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => {
        if (prevTime <= 1) {
          clearInterval(timer);
          navigate('/'); // Chuyển về trang chủ khi hết giờ
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    // Dọn dẹp bộ đếm khi component bị hủy (khách tự bấm nút Hoàn tất sớm)
    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="kiosk-container" style={{ flexDirection: 'row', gap: '5vw' }}>
      
      {/* Cột Trái: Hiển thị ảnh thành phẩm */}
      <div style={{ 
        height: '80vh', aspectRatio: '2/3', 
        backgroundColor: 'white', padding: '1vh', 
        borderRadius: '2vh', boxShadow: '0 1vh 2vh rgba(0,0,0,0.2)' 
      }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Thành phẩm" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '1vh' }} />
        ) : (
          <p style={{ textAlign: 'center', marginTop: '40vh' }}>Đang xử lý ảnh...</p>
        )}
      </div>

      {/* Cột Phải: Lời cảm ơn và Mã QR */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1 style={{ fontSize: '5vh', color: '#333', marginBottom: '2vh' }}>ẢNH CỦA BẠN ĐÃ SẴN SÀNG!</h1>
        <p style={{ fontSize: '3vh', color: '#666', marginBottom: '5vh', textAlign: 'center' }}>
          Dùng ứng dụng Camera trên điện thoại<br/>quét mã QR bên dưới để tải ảnh về nhé.
        </p>
        
        <div style={{ padding: '2vh', backgroundColor: 'white', borderRadius: '2vh', boxShadow: '0 1vh 2vh rgba(0,0,0,0.1)' }}>
          <QRCodeCanvas value={imageUrl || "https://google.com"} size={250} />
        </div>

        {/* Nút bấm hiển thị kèm số đếm ngược động */}
        <button className="start-btn" onClick={() => navigate('/')} style={{ marginTop: '8vh', backgroundColor: '#555' }}>
          HOÀN TẤT ({timeLeft}s)
        </button>
      </div>
    </div>
  );
}

export default Review;