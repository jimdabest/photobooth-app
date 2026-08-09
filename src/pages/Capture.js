import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function Capture() {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const ws = useRef(null);
  
  // Đổi trạng thái mặc định thành CONNECTING
  const [step, setStep] = useState('CONNECTING'); 
  const [poseIndex, setPoseIndex] = useState(1);
  const [count, setCount] = useState(3);
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 } })
      .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(err => console.error("Lỗi Camera: ", err));

    ws.current = new WebSocket('ws://127.0.0.1:8000/ws');
    
    // Chỉ đếm ngược khi Backend đã kết nối thành công
    ws.current.onopen = () => {
      console.log("Đã kết nối Backend!");
      runCountdown(1);
    };

    // Bắt lỗi nếu Backend bị sập
    ws.current.onerror = (error) => {
      console.error("Không thể kết nối đến Backend!", error);
      // Bạn có thể giữ trạng thái CONNECTING để màn hình báo lỗi
    };

    ws.current.onmessage = (event) => {
      const response = JSON.parse(event.data);
      if (response.status === 'success') {
        if (response.pose === 3 && response.final_image_url) {
          navigate('/review', { state: { imageUrl: response.final_image_url } });
        } else {
          setTimeout(() => {
            setPoseIndex(response.pose + 1);
            runCountdown(response.pose + 1);
          }, 1000);
        }
      }
    };

    return () => { if (ws.current) ws.current.close(); };
    // Thêm dòng chú thích này để tắt cảnh báo của React
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const runCountdown = (currentPose) => {
    setStep('COUNTING');
    setCount(3);
    let c = 3;
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
      ws.current.send(JSON.stringify({ action: "capture", pose: currentPose }));
    }
    setTimeout(() => setIsFlashing(false), 500);
  };

  return (
    <div className="kiosk-container">
      {isFlashing && <div className="flash-overlay"></div>}
      
      <div className="text-instruction">
        <h1>
          {step === 'CONNECTING' ? "ĐANG KẾT NỐI MÁY ẢNH..." : `ĐANG CHỤP: KIỂU ${poseIndex} / 3`}
        </h1>
        <p>Hãy nhìn vào ống kính và tạo dáng nhé!</p>
      </div>

      <div className="photobooth-area">
        <div className="live-view-mask">
          <video ref={videoRef} autoPlay playsInline muted></video>
          
          {step === 'COUNTING' && !isFlashing && (
            <div className="countdown-overlay">{count}</div>
          )}
        </div>
        <div className="template-overlay"></div>
      </div>
    </div>
  );
}

export default Capture;