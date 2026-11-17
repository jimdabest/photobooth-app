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
  const retakePoses = useMemo(() => Array.isArray(state?.retakePoses) ? state.retakePoses : [], [state?.retakePoses]);
  const isRetakeSession = retakePoses.length > 0;
  const [retakeIndex, setRetakeIndex] = useState(0);
  const retakeIndexRef = useRef(0);
  const [poseNumber, setPoseNumber] = useState(1);
  const poseNumberRef = useRef(1);
  const currentPoseNumber = isRetakeSession ? (retakePoses[retakeIndex] || 1) : poseNumber;
  const [phase, setPhase] = useState('CONNECTING');
  const [countdown, setCountdown] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState('');
  const [streamKey, setStreamKey] = useState(Date.now());
  const [isFlashing, setIsFlashing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [liveAspectRatio, setLiveAspectRatio] = useState(CAMERA_ASPECT_RATIO);
  const [stageAspectRatio, setStageAspectRatio] = useState(CAMERA_ASPECT_RATIO);
  const [isManualCapture, setIsManualCapture] = useState(false);
  const sessionId = useRef(state?.sessionId || state?.session_id || createSessionId());
  const requestInFlight = useRef(false);
  const stageRef = useRef(null);

  const templateId = state?.templateId || template?.id;
  const totalPoses = Math.max(1, Number(template?.num_poses || template?.slots?.length || 1));
  const [capturedPoses, setCapturedPoses] = useState(() => {
    const sessId = state?.sessionId || state?.session_id;
    if (isRetakeSession && sessId) {
      const initial = {};
      const numPoses = Math.max(1, Number(state?.template?.num_poses || state?.template?.slots?.length || 4));
      for (let i = 1; i <= numPoses; i++) {
        initial[i] = `${API_ORIGIN}/data/session/${sessId}/pose_${i}.jpg?t=${Date.now()}`;
      }
      return initial;
    }
    return {};
  });
  const currentSlot = template?.slots?.[currentPoseNumber - 1] || template?.slots?.[0];
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
        if (typeof nextSettings?.manual_capture === 'boolean') {
          setIsManualCapture(nextSettings.manual_capture);
        }
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

  const handleStartCapture = useCallback(() => {
    if (phase !== 'READY' || showCancelModal) return;
    setCountdown(Math.max(0, Number(settings?.countdown_capture || 0)));
    setPhase('COUNTDOWN');
  }, [phase, settings?.countdown_capture, showCancelModal]);

  useEffect(() => {
    if (phase !== 'READY' || showCancelModal || isManualCapture) return undefined;
    const timer = setTimeout(() => {
      setCountdown(Math.max(0, Number(settings?.countdown_capture || 0)));
      setPhase('COUNTDOWN');
    }, 550);
    return () => clearTimeout(timer);
  }, [isManualCapture, phase, settings, showCancelModal]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (showCancelModal) return;
      if ((event.code === 'Space' || event.code === 'Enter') && phase === 'READY') {
        event.preventDefault();
        handleStartCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleStartCapture, phase, showCancelModal]);

  const handleCancelSession = async () => {
    try {
      await request(`/sessions/${sessionId.current}/cancel`, { method: 'POST' });
    } catch (_) {}
    navigate('/templates', { replace: true });
  };

  const takePose = useCallback(async () => {
    if (!templateId || requestInFlight.current) return;
    requestInFlight.current = true;
    setPhase('CAPTURING');
    setError('');
    const activeRetakeIndex = retakeIndexRef.current;
    const poseToShoot = isRetakeSession ? (retakePoses[activeRetakeIndex] || 1) : poseNumberRef.current;
    const isLastInRetake = isRetakeSession && (activeRetakeIndex >= retakePoses.length - 1);
    try {
      const result = await capturePose(sessionId.current, templateId, poseToShoot, {
        isRetake: isRetakeSession,
        isLastInRetake
      });
      const shotUrl = `${API_ORIGIN}/data/session/${sessionId.current}/pose_${poseToShoot}.jpg?t=${Date.now()}`;
      setCapturedPoses(prev => ({ ...prev, [poseToShoot]: shotUrl }));

      if (result.completed) {
        const completedState = {
          imageUrl: `${API_ORIGIN}${result.image_url}?t=${Date.now()}`,
          sessionId: result.session_id,
          sessionUrl: result.session_url,
          settings: result.settings,
          poses: result.poses || [],
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
      if (isRetakeSession) {
        retakeIndexRef.current = activeRetakeIndex + 1;
        setRetakeIndex(activeRetakeIndex + 1);
      } else {
        const nextPose = result.pose_number + 1;
        poseNumberRef.current = nextPose;
        setPoseNumber(nextPose);
      }
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
  }, [isRetakeSession, navigate, retakePoses, state?.retakeCount, template, templateId]);

  useEffect(() => {
    if (phase !== 'COUNTDOWN' || showCancelModal) return undefined;
    if (countdown <= 1) {
      const timer = setTimeout(() => setPhase('SMILE'), 1000);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setCountdown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, phase, showCancelModal]);

  useEffect(() => {
    if (phase !== 'SMILE' || showCancelModal) return undefined;
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
  }, [phase, showCancelModal, takePose]);

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
        <span className="capture-pose-counter">
          {isRetakeSession
            ? `Chụp lại: Ảnh ${currentPoseNumber} (${retakeIndex + 1}/${retakePoses.length})`
            : `Ảnh ${poseNumber}/${totalPoses}`}
        </span>
      </div>
      {isRetakeSession && (
        <aside className="capture-old-photo-card glass-panel" aria-label="Ảnh cũ cần chụp lại">
          <div className="old-photo-badge">Ảnh cũ (Ảnh {currentPoseNumber})</div>
          <div className="old-photo-thumb">
            <img
              src={`${API_ORIGIN}/data/session/${sessionId.current}/pose_${currentPoseNumber}.jpg?t=${streamKey}`}
              alt={`Ảnh cũ số ${currentPoseNumber}`}
            />
          </div>
          <span className="old-photo-label">Tấm cần thay thế</span>
        </aside>
      )}
      {template?.slots?.length > 1 && (
        <aside className="capture-strip-panel glass-panel" aria-label="Khung ảnh xem trước">
          <div className="strip-panel-header">
            <span className="strip-panel-title">Khung ảnh</span>
            <span className="strip-panel-counter">
              {Object.keys(capturedPoses).length}/{totalPoses}
            </span>
          </div>
          <div className="strip-panel-canvas-wrap">
            <div
              className="strip-panel-canvas"
              style={{
                aspectRatio: `${template.canvas_size?.width || 800} / ${template.canvas_size?.height || 1200}`
              }}
            >
              {template.slots.map((slot, index) => {
                const poseIdx = slot.pose_index || index + 1;
                const photo = capturedPoses[poseIdx];
                const isCurrent = poseIdx === currentPoseNumber;
                const canvasW = template.canvas_size?.width || 1200;
                const canvasH = template.canvas_size?.height || 1800;
                return (
                  <div
                    key={poseIdx}
                    className={`strip-panel-slot ${isCurrent ? 'is-current' : ''} ${photo ? 'has-photo' : ''}`}
                    style={{
                      left: `${(slot.x / canvasW) * 100}%`,
                      top: `${(slot.y / canvasH) * 100}%`,
                      width: `${(slot.width / canvasW) * 100}%`,
                      height: `${(slot.height / canvasH) * 100}%`,
                      transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined
                    }}
                  >
                    {photo && !isCurrent ? (
                      <img src={photo} alt={`Pose ${poseIdx}`} className="strip-panel-photo" />
                    ) : isCurrent ? (
                      <div className="strip-slot-live-wrap">
                        <img
                          src={`${API_ORIGIN}/api/liveview?t=${streamKey}`}
                          alt="Live View trong khung"
                          className="strip-slot-liveview"
                        />
                        <div className="strip-live-badge">Đang chụp</div>
                      </div>
                    ) : (
                      <div className="strip-panel-placeholder">
                        <span className="strip-pending-num">{poseIdx}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {template.image_url && (
                <img src={template.image_url} alt="Khung ảnh" className="strip-panel-overlay" />
              )}
            </div>
          </div>
          <p className="strip-panel-hint">
            {Object.keys(capturedPoses).length > 0
              ? '💡 Nhìn ảnh trước để tạo dáng ăn khớp!'
              : 'Ảnh vừa chụp sẽ hiện ngay lên đây'}
          </p>
        </aside>
      )}
      <div className="capture-top-actions">
        <button
          type="button"
          className={`capture-mode-toggle touch-btn ${isManualCapture ? 'is-manual' : ''}`}
          onClick={() => setIsManualCapture(prev => !prev)}
          disabled={phase === 'CAPTURING' || phase === 'TRANSITION'}
          title="Bật/Tắt chế độ chụp thủ công"
        >
          <span className="mode-indicator" />
          {isManualCapture ? 'Chụp: Thủ công' : 'Chụp: Tự động'}
        </button>
        <button
          type="button"
          className="capture-cancel-btn touch-btn"
          onClick={() => setShowCancelModal(true)}
          disabled={phase === 'CAPTURING'}
        >
          ✕ Hủy phiên
        </button>
      </div>
      <div className="capture-bottom-bar">
        {isManualCapture && phase === 'READY' ? (
          <button
            type="button"
            className="capture-shutter-btn touch-btn"
            onClick={handleStartCapture}
            disabled={!cameraReady}
          >
            <span className="shutter-icon-outer">
              <span className="shutter-icon-inner" />
            </span>
            <span className="shutter-text">BẤM ĐỂ CHỤP</span>
          </button>
        ) : (
          <div key={`${phase}-${countdown}`} className="capture-countdown-value">{countdownText}</div>
        )}
      </div>
      {error && <div role="alert" className="capture-error glass-panel"><p>{error}</p><button className="btn-primary touch-btn" onClick={() => { setError(''); setPhase('READY'); }}>Thử lại</button></div>}
      {showCancelModal && (
        <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kiosk-modal glass-panel">
            <h2>Hủy phiên chụp?</h2>
            <p>Bạn có chắc chắn muốn hủy phiên chụp này và quay lại màn hình trước?</p>
            <div className="kiosk-modal-actions">
              <button
                type="button"
                className="btn-secondary touch-btn"
                onClick={() => setShowCancelModal(false)}
              >
                Tiếp tục chụp
              </button>
              <button
                type="button"
                className="btn-danger touch-btn"
                onClick={handleCancelSession}
              >
                Hủy phiên
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  </main>;
}
