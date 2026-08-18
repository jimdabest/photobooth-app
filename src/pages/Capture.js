import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

function Capture() {
  const navigate = useNavigate();
  const location = useLocation();
  const ws = useRef(null);

  // 1. Lấy thông tin template từ trang trước
  const templateId = location.state?.templateId || 'tpl_default';
  const template = location.state?.template;

  // 2. Tính toán tỷ lệ Crop Mask cho Liveview
  // Tỷ lệ gốc của Camera là 16:9
  const CAMERA_ASPECT_RATIO = 16 / 9;
  
  // Lấy kích thước slot đầu tiên để tính tỷ lệ crop in ấn
  const firstSlot = template?.slots?.[0];
  const targetRatio = (firstSlot?.width && firstSlot?.height) 
    ? (firstSlot.width / firstSlot.height) 
    : CAMERA_ASPECT_RATIO;

  // Tính % chiều rộng vùng in thực tế (Giới hạn tối đa 100%)
  const safeWidthPercent = Math.min(100, Math.max(20, (targetRatio / CAMERA_ASPECT_RATIO) * 100));
  // Phần trăm độ rộng của mỗi bên viền mờ
  const sideMaskPercent = (100 - safeWidthPercent) / 2;

  // 3. Các State điều khiển luồng chụp
  const [step, setStep] = useState('CONNECTING');
  const [poseIndex, setPoseIndex] = useState(1);
  const [totalPoses, setTotalPoses] = useState(1);
  const [count, setCount] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const liveViewUrl = useRef(`http://127.0.0.1:8000/api/liveview?t=${Date.now()}`);

  useEffect(() => {
    ws.current = new WebSocket('ws://127.0.0.1:8000/ws/session');

    ws.current.onopen = () => {
      console.log('✅ Đã kết nối WebSocket chụp ảnh!');
      ws.current.send(JSON.stringify({
        action: "START_SESSION",
        template_id: templateId,
        session_id: `session_${Date.now()}`
      }));
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'START_COUNTDOWN') {
          setPoseIndex(data.current_pose);
          setTotalPoses(data.total_poses);
          setCount(data.countdown);
          setStep('COUNTING');
        } 
        else if (data.event === 'TRIGGER_FLASH') {
          setStep('CAPTURING');
          setIsFlashing(true);
          setTimeout(() => setIsFlashing(false), 400);
        } 
        else if (data.event === 'PROCESSING') {
          setStep('PROCESSING');
        } 
        else if (data.event === 'COMPLETED') {
          navigate('/review', { state: { imageUrl: data.final_image_url } });
        }
      } catch (err) {
        console.error("Lỗi parse WS:", err);
      }
    };

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [navigate, templateId]);

  useEffect(() => {
    let timer;
    if (step === 'COUNTING' && count !== null && count > 0) {
      timer = setInterval(() => {
        setCount((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, count]);

  return (
    <div className="kiosk-container" style={{ justifyContent: 'center' }}>
      
      {/* Flash trắng */}
      {isFlashing && <div className="flash-overlay"></div>}

      {/* Tiêu đề hướng dẫn */}
      <div className="text-instruction" style={{ marginBottom: '2vh' }}>
        <h1 style={{ fontSize: 'clamp(2rem, 4.5vh, 3.5rem)', color: '#0f172a', fontWeight: '800' }}>
          {step === 'CONNECTING' && "ĐANG KHỞI ĐỘNG CAMERA..."}
          {step === 'COUNTING' && `ĐANG CHỤP: KIỂU ${poseIndex} / ${totalPoses}`}
          {step === 'CAPTURING' && "CƯỜI LÊN NÀO !"}
          {step === 'PROCESSING' && "ĐANG XỬ LÝ VÀ RỬA ẢNH..."}
        </h1>
        {step !== 'PROCESSING' && (
          <p style={{ fontSize: '1.4rem', color: '#475569', margin: 0 }}>
            Hãy đứng bên trong khung sáng để ảnh in ra chuẩn đẹp nhất nhé!
          </p>
        )}
      </div>

      {/* KHUNG LIVE VIEW NGANG 16:9 */}
      <div 
        style={{
          position: 'relative',
          height: '62vh',
          aspectRatio: '16 / 9', /* Chuẩn màn hình ngang 16:9 của máy ảnh */
          borderRadius: '1.5rem',
          overflow: 'hidden',
          backgroundColor: '#000',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '6px solid white'
        }}
      >
        {/* 1. Luồng Camera 16:9 */}
        <img
          src={liveViewUrl.current}
          alt="Live View"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)"
          }}
        />

        {/* 2. LỚP MASK LÀM MỜ 2 BÊN RÌA THỪA */}
        {sideMaskPercent > 0 && (
          <>
            {/* Viền mờ bên trái */}
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${sideMaskPercent}%`,
              backgroundColor: 'rgba(15, 23, 42, 0.65)', // Làm mờ vùng không in
              backdropFilter: 'blur(2px)',
              borderRight: '2px dashed rgba(255, 255, 255, 0.6)', // Vạch nét đứt ranh giới
              pointerEvents: 'none',
              zIndex: 5
            }} />

            {/* Viền mờ bên phải */}
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: `${sideMaskPercent}%`,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(2px)',
              borderLeft: '2px dashed rgba(255, 255, 255, 0.6)',
              pointerEvents: 'none',
              zIndex: 5
            }} />
          </>
        )}

        {/* 3. Số đếm ngược khổng lồ nằm ở vùng sáng an toàn */}
        {step === 'COUNTING' && count !== null && !isFlashing && (
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: count > 0 ? 'clamp(7rem, 18vh, 12rem)' : 'clamp(4rem, 10vh, 6rem)',
              fontWeight: '900',
              color: '#ffffff',
              textShadow: '0 10px 30px rgba(0,0,0,0.9), 0 0 25px rgba(236, 72, 153, 0.8)',
              zIndex: 15,
              pointerEvents: 'none'
            }}
          >
            {count > 0 ? count : "SMILE!"}
          </div>
        )}

        {/* 4. Màn hình chờ rửa ảnh */}
        {step === 'PROCESSING' && (
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(8px)',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white'
            }}
          >
            <div style={{
              width: '65px',
              height: '65px',
              border: '6px solid #334155',
              borderTop: '6px solid #ec4899',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <h2 style={{ marginTop: '1.5rem', fontSize: '1.8rem', fontWeight: 'bold' }}>
              Đang rửa ảnh...
            </h2>
          </div>
        )}
      </div>

    </div>
  );
}

export default Capture;