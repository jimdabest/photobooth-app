import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

function Capture() {
  const navigate = useNavigate();
  const location = useLocation();
  const videoRef = useRef(null);
  const ws = useRef(null);

  const [step, setStep] = useState('CONNECTING');
  const [poseIndex, setPoseIndex] = useState(1);
  const [count, setCount] = useState(3);
  const [isFlashing, setIsFlashing] = useState(false);

  const [countdownTime, setCountdownTime] = useState(null);

  // Lấy ID và Link ảnh khung từ trang trước truyền sang
  const templateId = location.state?.templateId || 'tpl_default';
  const templateUrl = location.state?.templateUrl || null;

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/settings')
      .then(res => res.json())
      .then(data => setCountdownTime(data.countdown_capture || 3))
      .catch(err => setCountdownTime(3));
  }, []);

  useEffect(() => {
    if (countdownTime === null) return;

    // Bật Camera
    navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 } })
      .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(err => console.error("Lỗi Camera: ", err));

    ws.current = new WebSocket('ws://127.0.0.1:8000/ws');

    ws.current.onopen = () => {
      runCountdown(1, countdownTime);
    };

    ws.current.onmessage = (event) => {
      const response = JSON.parse(event.data);
      if (response.status === 'success') {
        if (response.pose === 3 && response.final_image_url) {
          navigate('/review', { state: { imageUrl: response.final_image_url } });
        } else {
          setTimeout(() => {
            setPoseIndex(response.pose + 1);
            runCountdown(response.pose + 1, countdownTime);
          }, 1000);
        }
      }
    };

    return () => { if (ws.current) ws.current.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, countdownTime]);

  const runCountdown = (currentPose, timeConfig) => {
    setStep('COUNTING');
    setCount(timeConfig);
    let c = timeConfig;
    const timer = setInterval(() => {
      c -= 1;
      if (c > 0) {
        setCount(c);
      } else {
        clearInterval(timer);
        triggerFlashAndCapture(currentPose);
      }
    }, 1000);
  };

  const triggerFlashAndCapture = (currentPose) => {
    setIsFlashing(true);
    setStep('CAPTURING');
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        action: "capture",
        pose: currentPose,
        template_id: templateId
      }));
    }
    setTimeout(() => setIsFlashing(false), 500);
  };

  return (
    <div className="kiosk-container">
      {isFlashing && <div className="flash-overlay"></div>}

      <div className="text-instruction" style={{ zIndex: 10 }}>
        <h1>
          {step === 'CONNECTING' ? "ĐANG LẤY CẤU HÌNH..." : `ĐANG CHỤP: KIỂU ${poseIndex} / 3`}
        </h1>
        <p>Hãy nhìn vào ống kính và tạo dáng nhé!</p>
      </div>

      {/* KHU VỰC LIVE VIEW CÓ KHUNG ĐÈ LÊN */}
      <div className="photobooth-area" style={{ position: 'relative', overflow: 'hidden' }}>

        {/* LỚP DƯỚI CÙNG: Camera thực tế */}
        <img
          src="http://127.0.0.1:8000/api/liveview"
          alt="Canon Live View"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)"
          }}
        />

        {/* LỚP GIỮA: Số đếm ngược */}
        {step === 'COUNTING' && !isFlashing && (
          <div className="countdown-overlay" style={{ zIndex: 5 }}>{count}</div>
        )}

        {/* LỚP TRÊN CÙNG: Khung ảnh PNG đục lỗ */}
        {templateUrl && (
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, width: '100%', height: '100%',
              backgroundImage: `url(${templateUrl})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              zIndex: 8,
              pointerEvents: 'none' // Cực kỳ quan trọng: Giúp khung không chặn các thao tác click (nếu có)
            }}
          ></div>
        )}

      </div>
    </div>
  );
}

export default Capture;