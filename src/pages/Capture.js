import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';
import { capturePose, request } from '../services/kioskApi';

const API_ORIGIN = 'http://127.0.0.1:8000';
const CAMERA_ASPECT_RATIO = 16 / 9;

function createSessionId() {
  const now = new Date();
  const date = [now.getFullYear() % 100, now.getMonth() + 1, now.getDate()]
    .map(value => String(value).padStart(2, '0')).join('');
  const clock = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(value => String(value).padStart(2, '0')).join('');
  const sequence = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
  return `${date}-${clock}-${sequence}`;
}

export default function Capture() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [settings, setSettings] = useState(null);
  const [template, setTemplate] = useState(state?.template || null);
  const [poseNumber, setPoseNumber] = useState(1);
  const [phase, setPhase] = useState('CONNECTING');
  const [countdown, setCountdown] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');
  const [streamKey, setStreamKey] = useState(Date.now());
  const [isFlashing, setIsFlashing] = useState(false);
  const [liveAspectRatio, setLiveAspectRatio] = useState(CAMERA_ASPECT_RATIO);
  const [stageAspectRatio, setStageAspectRatio] = useState(CAMERA_ASPECT_RATIO);
  const sessionId = useRef(createSessionId());
  const requestInFlight = useRef(false);
  const stageRef = useRef(null);

  const templateId = state?.templateId || template?.id;
  const totalPoses = Math.max(1, Number(template?.num_poses || template?.slots?.length || 1));
  const currentSlot = template?.slots?.[poseNumber - 1] || template?.slots?.[0];
  const cropBounds = useMemo(() => {
    const slotRatio = Number(currentSlot?.width) / Number(currentSlot?.height);
    const targetRatio = Number.isFinite(slotRatio) && slotRatio > 0 ? slotRatio : CAMERA_ASPECT_RATIO;
    const sourceAspect = liveAspectRatio || CAMERA_ASPECT_RATIO;
    const stageAspect = stageAspectRatio || CAMERA_ASPECT_RATIO;

    const sourceCrop = targetRatio <= sourceAspect
      ? { width: targetRatio / sourceAspect, height: 1, left: (1 - targetRatio / sourceAspect) / 2, top: 0 }
      : { width: 1, height: sourceAspect / targetRatio, left: 0, top: (1 - sourceAspect / targetRatio) / 2 };

    // Live View dùng contain để phần nhìn thấy luôn là toàn bộ ảnh gốc.
    // Chuyển crop trong ảnh gốc sang tọa độ thực tế của khung Live View.
    if (sourceAspect >= stageAspect) {
      const displayHeight = stageAspect / sourceAspect;
      return {
        width: `${sourceCrop.width * 100}%`,
        height: `${sourceCrop.height * displayHeight * 100}%`,
        left: `${sourceCrop.left * 100}%`,
        top: `${((1 - displayHeight) / 2 + sourceCrop.top * displayHeight) * 100}%`
      };
    }
    const displayWidth = sourceAspect / stageAspect;
    return {
      width: `${sourceCrop.width * displayWidth * 100}%`,
      height: `${sourceCrop.height * 100}%`,
      left: `${((1 - displayWidth) / 2 + sourceCrop.left * displayWidth) * 100}%`,
      top: `${sourceCrop.top * 100}%`
    };
  }, [currentSlot?.height, currentSlot?.width, liveAspectRatio, stageAspectRatio]);
  const poseGuideTransform = useMemo(() => {
    if (!template?.image_url || !currentSlot?.width || !currentSlot?.height) return null;
    const canvas = template.canvas_size || { width: 1, height: 1 };
    return {
      width: `${(Number(canvas.width) / Number(currentSlot.width)) * 100}%`,
      height: `${(Number(canvas.height) / Number(currentSlot.height)) * 100}%`,
      left: `${-(Number(currentSlot.x) / Number(currentSlot.width)) * 100}%`,
      top: `${-(Number(currentSlot.y) / Number(currentSlot.height)) * 100}%`
    };
  }, [currentSlot?.height, currentSlot?.width, currentSlot?.x, currentSlot?.y, template?.canvas_size, template?.image_url]);

  useEffect(() => {
    let active = true;
    request('/settings')
      .then(nextSettings => {
        if (!active) return;
        setSettings(nextSettings);
        if (!template) setTemplate((nextSettings.templates || []).find(item => item.id === state?.templateId) || null);
      })
      .catch(() => active && setError('Không thể tải cài đặt phiên chụp.'));
    return () => { active = false; };
  }, [state?.templateId, template]);

  useEffect(() => {
    if (cameraReady && settings && templateId && phase === 'CONNECTING') setPhase('READY');
  }, [cameraReady, phase, settings, templateId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateStageRatio = () => {
      if (stage.clientWidth && stage.clientHeight) setStageAspectRatio(stage.clientWidth / stage.clientHeight);
    };
    updateStageRatio();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateStageRatio);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (phase !== 'READY') return undefined;
    const timer = setTimeout(() => {
      setCountdown(Math.max(0, Number(settings?.countdown_capture || 0)));
      setPhase('COUNTDOWN');
    }, 550);
    return () => clearTimeout(timer);
  }, [phase, settings]);

  const takePose = useCallback(async () => {
    if (!templateId || requestInFlight.current) return;
    requestInFlight.current = true;
    setPhase('CAPTURING');
    setError('');
    try {
      const result = await capturePose(sessionId.current, templateId, poseNumber);
      if (result.completed) {
        const completedState = {
          imageUrl: `${API_ORIGIN}${result.image_url}`,
          sessionId: result.session_id,
          sessionUrl: result.session_url,
          settings: result.settings,
          templateId,
          template,
          retakeCount: state?.retakeCount || 0,
          printQueued: result.print_queued,
          printError: result.print_error
        };
        try {
          sessionStorage.setItem('photobooth.activeReview', JSON.stringify(completedState));
        } catch (_) {
          // Kiosk vẫn hoạt động bình thường nếu trình duyệt chặn sessionStorage.
        }
        navigate(result.settings?.enable_review_page === false ? '/download' : '/review', {
          replace: true,
          state: completedState
        });
        return;
      }
      setPoseNumber(result.pose_number + 1);
      setPhase('TRANSITION');
      setTimeout(() => setPhase('READY'), 700);
    } catch (captureError) {
      setError(captureError.status === 429
        ? 'Vui lòng đợi một chút trước khi chụp tiếp.'
        : (captureError.message || 'Không thể chụp ảnh. Vui lòng thử lại.'));
      setPhase('READY');
    } finally {
      requestInFlight.current = false;
    }
  }, [navigate, poseNumber, state?.retakeCount, template, templateId]);

  useEffect(() => {
    if (phase !== 'COUNTDOWN') return undefined;
    if (countdown <= 1) {
      const timer = setTimeout(() => setPhase('SMILE'), 1000);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setCountdown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase]);

  useEffect(() => {
    if (phase !== 'SMILE') return undefined;
    let captureTimer;
    const smileTimer = setTimeout(() => {
      setIsFlashing(true);
      captureTimer = setTimeout(() => {
        setIsFlashing(false);
        takePose();
      }, 250);
    }, 550);
    return () => {
      clearTimeout(smileTimer);
      clearTimeout(captureTimer);
    };
  }, [phase, takePose]);

  if (!templateId || !template) {
    return <main className="kiosk-container"><h1>Không tìm thấy khung ảnh</h1><button className="btn-primary touch-btn" onClick={() => navigate('/templates')}>Chọn khung</button></main>;
  }

  const statusText = phase === 'CONNECTING' ? 'Đang kết nối camera' : phase === 'CAPTURING' || phase === 'TRANSITION' ? 'Đang lưu ảnh' : 'Camera sẵn sàng';
  const countdownText = phase === 'COUNTDOWN' ? countdown : phase === 'SMILE' || phase === 'CAPTURING' || phase === 'TRANSITION' ? 'SMILE!' : 'SẴN SÀNG';

  return <main className="kiosk-container capture-screen">
    {isFlashing && <div className="flash-overlay" />}
    <section className="capture-stage" ref={stageRef}>
      <div className="capture-liveview">
        <img
          src={`${API_ORIGIN}/api/liveview?t=${streamKey}`}
          alt="Live View"
          onLoad={event => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setLiveAspectRatio(naturalWidth / naturalHeight);
            setCameraReady(true);
          }}
          onError={() => {
            setCameraReady(false);
            setTimeout(() => setStreamKey(Date.now()), 2000);
          }}
        />
        <div className="capture-crop-window" style={cropBounds} aria-label="Vùng ảnh sẽ được chụp">
          {template?.guide_config?.enabled && poseGuideTransform && <img
            className="capture-pose-guide"
            src={template.image_url}
            alt="Hướng dẫn tạo dáng"
            style={{ ...poseGuideTransform, opacity: Math.min(1, Math.max(.1, Number(template.guide_config.opacity) || .4)) }}
          />}
        </div>
        {(phase === 'CAPTURING' || phase === 'TRANSITION') && <div className="capture-processing">Đang xử lý ảnh của bạn...</div>}
      </div>
      <div className="capture-camera-status" aria-live="polite">
        <span className={`capture-camera-light ${cameraReady ? 'is-ready' : ''}`} />
        <span>{statusText}</span>
        <span className="capture-pose-counter">Ảnh {poseNumber}/{totalPoses}</span>
      </div>
      <div className="capture-bottom-bar">
        <div key={`${phase}-${countdown}`} className="capture-countdown-value">{countdownText}</div>
      </div>
      {error && <div role="alert" className="capture-error glass-panel"><p>{error}</p><button className="btn-primary touch-btn" onClick={() => { setError(''); setPhase('READY'); }}>Thử lại</button></div>}
    </section>
  </main>;
}
