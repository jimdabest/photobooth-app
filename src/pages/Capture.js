import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

function Capture() {
  const navigate = useNavigate();
  const location = useLocation();
  const ws = useRef(null);

  // Các Trạng thái giao diện
  const [step, setStep] = useState('CONNECTING'); // CONNECTING, COUNTING, CAPTURING, PROCESSING
  const [poseIndex, setPoseIndex] = useState(1);
  const [totalPoses, setTotalPoses] = useState(0);
  const [count, setCount] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const liveViewUrl = useRef(`http://127.0.0.1:8000/api/liveview?t=${Date.now()}`);

  // Lấy ID và Link ảnh khung từ màn hình trước
  const templateId = location.state?.templateId || 'tpl_default';
  const templateUrl = location.state?.templateUrl || null;

  useEffect(() => {
    // 1. Kết nối tới WebSocket MỚI của Backend
    ws.current = new WebSocket('ws://127.0.0.1:8000/ws/session');

    ws.current.onopen = () => {
      // 2. Ngay khi kết nối, báo Backend bắt đầu phiên chụp với template đã chọn
      const sessionId = `session_${Date.now()}`;
      ws.current.send(JSON.stringify({
        action: "START_SESSION",
        template_id: templateId,
        session_id: sessionId
      }));
    };

    // 3. Lắng nghe các chỉ thị điều phối từ Backend gửi sang
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.event === 'START_COUNTDOWN') {
        // Backend bảo đếm ngược -> Bật UI đếm ngược
        setPoseIndex(data.current_pose);
        setTotalPoses(data.total_poses);
        setCount(data.countdown);
        setStep('COUNTING');
      } 
      else if (data.event === 'TRIGGER_FLASH') {
        // Backend báo máy ảnh đang chụp -> Chớp nháy màn hình
        setStep('CAPTURING');
        setIsFlashing(true);
        setTimeout(() => setIsFlashing(false), 500);
      } 
      else if (data.event === 'PROCESSING') {
        // Backend báo đã chụp đủ ảnh, đang ghép khung
        setStep('PROCESSING');
      } 
      else if (data.event === 'COMPLETED') {
        // Backend ghép xong, trả link ảnh hoàn chỉnh -> Chuyển sang trang QR
        navigate('/review', { state: { imageUrl: data.final_image_url } });
      }
    };

    return () => {
      if (ws.current) ws.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, templateId]);

  // 4. Hiệu ứng UI: Tự động trừ lùi số đếm ngược trên màn hình
  useEffect(() => {
    let timer;
    if (step === 'COUNTING' && count > 0) {
      timer = setInterval(() => {
        setCount((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, count]);

  return (
    <div className="kiosk-container">
      {/* Hiệu ứng chớp trắng toàn màn hình khi chụp */}
      {isFlashing && <div className="flash-overlay"></div>}

      {/* Thông báo trạng thái */}
      <div className="text-instruction" style={{ zIndex: 10 }}>
        <h1>
          {step === 'CONNECTING' && "ĐANG KHỞI ĐỘNG MÁY ẢNH..."}
          {step === 'COUNTING' && `ĐANG CHỤP: KIỂU ${poseIndex} / ${totalPoses || '...'}`}
          {step === 'CAPTURING' && "GIỮ NGUYÊN..."}
          {step === 'PROCESSING' && "ĐANG XỬ LÝ VÀ GHÉP ẢNH..."}
        </h1>
        {step !== 'PROCESSING' && <p>Hãy nhìn vào ống kính và tạo dáng nhé!</p>}
      </div>

      {/* KHU VỰC LIVE VIEW (SO CẢ KHI CÓ KHUNG ĐÈ LÊN) */}
      <div className="photobooth-area" style={{ position: 'relative', overflow: 'hidden' }}>

        {/* LỚP DƯỚI CÙNG: Live View thực tế từ Canon */}
        <img
          src={liveViewUrl.current}
          alt="Canon Live View"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)"
          }}
        />

        {/* LỚP GIỮA: Số đếm ngược khổng lồ */}
        {step === 'COUNTING' && count > 0 && !isFlashing && (
          <div className="countdown-overlay" style={{ zIndex: 5 }}>{count}</div>
        )}

        {/* LỚP TRÊN CÙNG: Khung ảnh PNG đục lỗ */}
        {templateUrl && step !== 'PROCESSING' && (
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, width: '100%', height: '100%',
              backgroundImage: `url(${templateUrl})`,
              backgroundSize: '100% 100%',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              zIndex: 8,
              pointerEvents: 'none' // Giúp không cản trở thao tác chạm
            }}
          ></div>
        )}

        {/* Màn hình mờ lúc xử lý */}
        {step === 'PROCESSING' && (
            <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9, 
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white'
            }}>
                <h2>Đang xử lý hình ảnh...</h2>
            </div>
        )}

      </div>
    </div>
  );
}

export default Capture;