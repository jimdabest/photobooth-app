import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';

const CAMERA_ASPECT_RATIO = 16 / 9;

function Capture() {
  const navigate = useNavigate();
  const location = useLocation();

  // Refs quản lý WebSocket và auto-reconnect
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const hasStartedSession = useRef(false);

  const templateId = location.state?.templateId || 'tpl_default';
  const template = location.state?.template;

  // State
  const [step, setStep] = useState('CONNECTING');
  const [poseIndex, setPoseIndex] = useState(1);
  const [totalPoses, setTotalPoses] = useState(1);
  const [count, setCount] = useState(null);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [streamKey, setStreamKey] = useState(Date.now());
  const [criticalError, setCriticalError] = useState(null);

  const liveViewUrl = `http://127.0.0.1:8000/api/liveview?t=${streamKey}`;

  // Slot hiện tại và tỷ lệ vùng sáng
  const currentSlot = template?.slots?.[poseIndex - 1] || template?.slots?.[0];

  const targetRatio = (currentSlot?.width && currentSlot?.height)
    ? (currentSlot.width / currentSlot.height)
    : CAMERA_ASPECT_RATIO;

  const safeWidthPercent = Math.min(100, Math.max(20, (targetRatio / CAMERA_ASPECT_RATIO) * 100));
  const sideMaskPercent = (100 - safeWidthPercent) / 2;

  // Tính toán vị trí pose guide khớp với vùng sáng
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

  // WebSocket với auto-reconnect
  useEffect(() => {
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;

      const ws = new WebSocket('ws://127.0.0.1:8000/ws/session');
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        console.log('Đã kết nối WebSocket');
        setIsWsConnected(true);
        reconnectAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
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
            navigate('/review', {
              state: {
                imageUrl: data.final_image_url,
                sessionId: data.session_id,
                cloudUrl: data.cloud_url || '',
                cloudPoses: data.cloud_poses || []
              }
            });
          }
          else if (data.event === 'CRITICAL_ERROR') {
            setCriticalError(data.message);
          }
        } catch (err) {
          console.error('Lỗi parse WebSocket:', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setIsWsConnected(false);

        // Exponential backoff: 1s, 2s, 4s, tối đa 5s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 5000);
        reconnectAttemptRef.current += 1;

        console.log(`WebSocket đóng, thử lại sau ${delay}ms`);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // Lỗi sẽ trigger onclose, không cần xử lý riêng
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [navigate]);

  // Bắt đầu phiên chụp khi cả WS và camera sẵn sàng
  useEffect(() => {
    if (isWsConnected && isCameraReady && !hasStartedSession.current && !criticalError) {
      console.log('Bắt đầu phiên chụp');
      hasStartedSession.current = true;
      wsRef.current.send(JSON.stringify({
        action: "START_SESSION",
        template_id: templateId,
        session_id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      }));
    }
  }, [isWsConnected, isCameraReady, templateId, criticalError]);

  // Cơ chế chống kẹt
  useEffect(() => {
    let emergencyTimer;
    if (step === 'CAPTURING') {
      emergencyTimer = setTimeout(() => {
        console.log('Phát hiện kẹt tiến trình, khởi động lại');
        setIsCameraReady(false);
        setStreamKey(Date.now());
        setStep('CONNECTING');
        hasStartedSession.current = false;
      }, 8000);
    }
    return () => clearTimeout(emergencyTimer);
  }, [step]);

  // Xử lý lỗi live view
  const handleImageError = () => {
    console.log('Lỗi tải live view, thử lại sau 3 giây');
    setIsCameraReady(false);

    if (step !== 'COMPLETED' && step !== 'PROCESSING') {
      setStep('CONNECTING');
      hasStartedSession.current = false;
    }

    setTimeout(() => {
      setStreamKey(Date.now());
    }, 3000);
  };

  // Đếm ngược
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

      {isFlashing && <div className="flash-overlay"></div>}

      {criticalError && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(220, 38, 38, 0.95)',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '2rem',
          textAlign: 'center'
        }}>
          <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>Lỗi Camera</h1>
          <p style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>{criticalError}</p>
          <button
            className="btn-primary"
            onClick={() => {
              setCriticalError(null);
              navigate('/');
            }}
          >
            Quay Về Trang Chủ
          </button>
        </div>
      )}

      <div style={{ marginTop: '-2vh', marginBottom: '1vh', textAlign: 'center', width: '100%' }}>
        <h1 style={{ fontSize: 'clamp(2rem, 4.5vh, 3.5rem)', color: '#0f172a', fontWeight: '800', margin: '0 0 0.5rem 0' }}>
          {!isCameraReady && "Đang kết nối camera..."}
          {isCameraReady && step === 'CONNECTING' && "Chuẩn bị..."}
          {isCameraReady && step === 'COUNTING' && `Đang chụp: Kiểu ${poseIndex} / ${totalPoses}`}
          {isCameraReady && step === 'CAPTURING' && "Cười lên nào!"}
          {isCameraReady && step === 'PROCESSING' && "Đang xử lý và rửa ảnh..."}
        </h1>
      </div>

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
        {/* Live view */}
        <img
          src={liveViewUrl}
          alt="Live View"
          onLoad={() => {
            if (!isCameraReady) {
              console.log('Đã nhận luồng hình ảnh từ camera');
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

        {/* Pose guide khớp với vùng sáng */}
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

        {/* Mask 2 bên rìa thừa */}
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

        {/* Đếm ngược */}
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