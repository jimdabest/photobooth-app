import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

function Capture() {
  const navigate = useNavigate();
  const location = useLocation();
  const ws = useRef(null);

  // ============================================================
  // LẤY THÔNG TIN TEMPLATE TỪ TRANG TRƯỚC
  // ============================================================
  const templateId = location.state?.templateId || 'tpl_default';
  const template = location.state?.template;

  const CAMERA_ASPECT_RATIO = 16 / 9;

  // ============================================================
  // STATE
  // ============================================================
  const [step, setStep] = useState('CONNECTING');
  const [poseIndex, setPoseIndex] = useState(1);
  const [totalPoses, setTotalPoses] = useState(1);
  const [count, setCount] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [streamKey, setStreamKey] = useState(Date.now());
  const hasStartedSession = useRef(false);

  const liveViewUrl = `http://127.0.0.1:8000/api/liveview?t=${streamKey}`;

  // ============================================================
  // TÍNH TOÁN SLOT HIỆN TẠI
  // ============================================================
  const currentSlot = template?.slots?.[poseIndex - 1] || template?.slots?.[0];

  // Tỷ lệ của slot (VD: 4:3 = 1.333, 16:9 = 1.778)
  const targetRatio = (currentSlot?.width && currentSlot?.height)
    ? (currentSlot.width / currentSlot.height)
    : CAMERA_ASPECT_RATIO;

  // Vùng sáng (vùng không bị mask) trong khung live view
  const safeWidthPercent = Math.min(100, Math.max(20, (targetRatio / CAMERA_ASPECT_RATIO) * 100));
  const sideMaskPercent = (100 - safeWidthPercent) / 2;

  // ============================================================
  // TÍNH TOÁN POSE GUIDE (dùng useMemo để tránh tính lại)
  // ============================================================
  //
  // Nguyên lý:
  // - Container của pose guide = vùng sáng (giữa 2 đường đứt nét)
  // - Vùng sáng có tỷ lệ = targetRatio (đúng bằng slot)
  // - Template được scale sao cho SLOT của nó vừa khít container
  //
  // Công thức:
  //   width  = (canvas.width  / slot.width)  * 100%
  //   height = (canvas.height / slot.height) * 100%
  //   left   = -(slot.x / slot.width)  * 100%
  //   top    = -(slot.y / slot.height) * 100%
  //
  const poseGuideTransform = useMemo(() => {
    if (!template?.image_url) return null;

    const canvas = template.canvas_size || { width: 1080, height: 1920 };
    const slot = currentSlot || {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height
    };

    return {
      width: `${(canvas.width / slot.width) * 100}%`,
      height: `${(canvas.height / slot.height) * 100}%`,
      left: `${-(slot.x / slot.width) * 100}%`,
      top: `${-(slot.y / slot.height) * 100}%`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    template?.image_url,
    template?.canvas_size?.width,
    template?.canvas_size?.height,
    currentSlot?.x,
    currentSlot?.y,
    currentSlot?.width,
    currentSlot?.height,
  ]);

  // ============================================================
  // WEBSOCKET
  // ============================================================
  useEffect(() => {
    ws.current = new WebSocket('ws://127.0.0.1:8000/ws/session');

    ws.current.onopen = () => {
      console.log('Đã kết nối WebSocket chụp ảnh!');
      setIsWsConnected(true);
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

  // ============================================================
  // BẮT ĐẦU PHIÊN CHỤP KHI CẢ WS VÀ CAMERA SẴN SÀNG
  // ============================================================
  useEffect(() => {
    if (isWsConnected && isCameraReady && !hasStartedSession.current) {
      console.log('Hệ thống sẵn sàng. Bắt đầu phiên chụp!');
      hasStartedSession.current = true;
      ws.current.send(JSON.stringify({
        action: "START_SESSION",
        template_id: templateId,
        session_id: `session_${Date.now()}`
      }));
    }
  }, [isWsConnected, isCameraReady, templateId]);

  // ============================================================
  // CƠ CHẾ CHỐNG KẸT KHẨN CẤP
  // ============================================================
  useEffect(() => {
    let emergencyTimer;
    if (step === 'CAPTURING') {
      emergencyTimer = setTimeout(() => {
        console.log("Phát hiện kẹt tiến trình! Khởi động lại...");
        setIsCameraReady(false);
        setStreamKey(Date.now());
        setStep('CONNECTING');
        hasStartedSession.current = false;
      }, 8000);
    }
    return () => clearTimeout(emergencyTimer);
  }, [step]);

  // ============================================================
  // XỬ LÝ LỖI LIVE VIEW
  // ============================================================
  const handleImageError = () => {
    console.log("Lỗi tải Live View, đang thử lại...");
    setIsCameraReady(false);

    if (step !== 'COMPLETED' && step !== 'PROCESSING') {
      setStep('CONNECTING');
      hasStartedSession.current = false;
    }

    setTimeout(() => {
      setStreamKey(Date.now());
    }, 3000);
  };

  // ============================================================
  // ĐẾM NGƯỢC
  // ============================================================
  useEffect(() => {
    let timer;
    if (step === 'COUNTING' && count !== null && count > 0) {
      timer = setInterval(() => {
        setCount((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, count]);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="kiosk-container" style={{ justifyContent: 'center' }}>

      {/* Flash trắng */}
      {isFlashing && <div className="flash-overlay"></div>}

      {/* Tiêu đề hướng dẫn */}
      <div className="text-instruction" style={{ marginTop: '-2vh', marginBottom: '1vh', textAlign: 'center', width: '100%' }}>
        <h1 style={{ fontSize: 'clamp(2rem, 4.5vh, 3.5rem)', color: '#0f172a', fontWeight: '800', margin: '0 0 0.5rem 0' }}>
          {!isCameraReady && "ĐANG KẾT NỐI CAMERA..."}
          {isCameraReady && step === 'CONNECTING' && "CHUẨN BỊ..."}
          {isCameraReady && step === 'COUNTING' && `ĐANG CHỤP: KIỂU ${poseIndex} / ${totalPoses}`}
          {isCameraReady && step === 'CAPTURING' && "CƯỜI LÊN NÀO!"}
          {isCameraReady && step === 'PROCESSING' && "ĐANG XỬ LÝ VÀ RỬA ẢNH..."}
        </h1>
      </div>

      {/* KHUNG LIVE VIEW */}
      <div
        style={{
          position: 'relative',
          height: '62vh',
          aspectRatio: '16 / 9',
          borderRadius: '1.5rem',
          overflow: 'hidden',
          backgroundColor: '#000',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '6px solid white'
        }}
      >
        {/* Luồng Camera 16:9 */}
        <img
          src={liveViewUrl}
          alt="Live View"
          onLoad={() => {
            if (!isCameraReady) {
              console.log('Đã nhận được luồng hình ảnh từ Camera!');
              setIsCameraReady(true);
            }
          }}
          onError={handleImageError}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scaleX(-1)"
          }}
        />

        {/* ============================================================ */}
        {/* POSE GUIDE — Đặt vào VÙNG SÁNG (giữa 2 đường mask)          */}
        {/* ============================================================ */}
        {template?.guide_config?.enabled && poseGuideTransform && (
          <div
            style={{
              position: 'absolute',
              left: `${sideMaskPercent}%`,
              top: '0%',
              width: `${safeWidthPercent}%`,
              height: '100%',
              overflow: 'hidden',
              pointerEvents: 'none',
              opacity: template.guide_config.opacity || 0.4,
              zIndex: 4
            }}
          >
            <img
              src={template.image_url}
              alt="Pose Guide"
              style={{
                position: 'absolute',
                width: poseGuideTransform.width,
                height: poseGuideTransform.height,
                left: poseGuideTransform.left,
                top: poseGuideTransform.top,
                transform: 'scaleX(-1)',
                transformOrigin: 'center center',
              }}
            />
          </div>
        )}

        {/* ============================================================ */}
        {/* LỚP MASK LÀM MỜ 2 BÊN RÌA THỪA                              */}
        {/* ============================================================ */}
        {sideMaskPercent > 0.5 && (
          <>
            <div style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: `${sideMaskPercent}%`,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(2px)',
              borderRight: '2px dashed rgba(255, 255, 255, 0.6)',
              pointerEvents: 'none',
              zIndex: 5
            }} />

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

        {/* Số đếm ngược khổng lồ */}
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

        {/* Màn hình chờ rửa ảnh */}
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