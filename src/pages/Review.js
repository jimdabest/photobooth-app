import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { printSession, request } from '../services/kioskApi';
import '../App.css';

const API_ORIGIN = 'http://127.0.0.1:8000';

function restoreReviewState() {
  try {
    const saved = sessionStorage.getItem('photobooth.activeReview');
    return saved ? JSON.parse(saved) : null;
  } catch (_) {
    return null;
  }
}

export default function Review() {
  const { state: routeState } = useLocation();
  const navigate = useNavigate();
  const [state] = useState(() => routeState || restoreReviewState());
  const [settings, setSettings] = useState(state?.settings || {});
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showRetakeModal, setShowRetakeModal] = useState(false);
  const [selectedRetakePoses, setSelectedRetakePoses] = useState([]);
  const [cacheBuster] = useState(Date.now());
  const [error, setError] = useState(state?.printError || '');
  const [remaining, setRemaining] = useState(state?.settings?.review_timeout || 30);
  const [imageUrl, setImageUrl] = useState(state?.imageUrl || '');
  const [imageStatus, setImageStatus] = useState('loading');
  const actionLock = useRef(false);
  const imageRetryCount = useRef(0);
  const imageRetryTimer = useRef(null);
  const maxCopies = Math.min(10, Math.max(1, Number(settings.max_print_copies || 10)));
  const wasAutoPrinted = Boolean(state?.printQueued);
  const canRetake = settings.enable_retake !== false && (state?.retakeCount || 0) < 1;

  const totalPoses = Math.max(1, Number(state?.template?.num_poses || state?.template?.slots?.length || 4));
  const poseList = useMemo(() => {
    return Array.from({ length: totalPoses }, (_, i) => ({
      poseNumber: i + 1,
      url: `${API_ORIGIN}/data/session/${state?.sessionId}/pose_${i + 1}.jpg`
    }));
  }, [state?.sessionId, totalPoses]);

  const togglePoseSelection = (poseNum) => {
    setSelectedRetakePoses(current =>
      current.includes(poseNum)
        ? current.filter(p => p !== poseNum)
        : [...current, poseNum]
    );
  };

  const handleStartRetake = () => {
    if (selectedRetakePoses.length === 0 || busy || actionLock.current) return;
    actionLock.current = true;
    const sortedPoses = [...selectedRetakePoses].sort((a, b) => a - b);
    navigate('/capture', {
      replace: true,
      state: {
        ...state,
        sessionId: state?.sessionId || state?.session_id,
        templateId: state.templateId || state.template?.id,
        template: state.template,
        retakePoses: sortedPoses,
        retakeCount: (state?.retakeCount || 0) + 1,
      }
    });
  };

  useEffect(() => {
    let active = true;
    request('/settings').then(nextSettings => {
      if (!active) return;
      setSettings(nextSettings);
      setRemaining(nextSettings.review_timeout || 30);
      setCopies(current => Math.min(current, Math.min(10, Math.max(1, Number(nextSettings.max_print_copies || 10)))));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => () => clearTimeout(imageRetryTimer.current), []);

  const handleImageError = () => {
    if (imageRetryCount.current >= 3) {
      setImageStatus('error');
      return;
    }
    imageRetryCount.current += 1;
    imageRetryTimer.current = setTimeout(() => {
      setImageStatus('loading');
      setImageUrl(`${state.imageUrl}${state.imageUrl.includes('?') ? '&' : '?'}retry=${Date.now()}`);
    }, 700);
  };

  const finish = async () => {
    if (!state?.sessionId || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    try {
      if (!wasAutoPrinted) await printSession(state.sessionId, state.template?.print_format || 's4x6', copies);
      navigate('/download', { replace: true, state: { ...state, settings, printQueued: true } });
    } catch (printError) {
      setError(printError.message || 'Không thể gửi lệnh in.');
      actionLock.current = false;
      setBusy(false);
    }
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  const handleSaveOnly = async () => {
    if (!state?.sessionId || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await request('/session/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: state.sessionId })
      });
    } catch (_) {}
    navigate('/download', { replace: true, state: { ...state, settings, printQueued: false, saveOnly: true } });
  };

  const handleCancel = async () => {
    if (!state?.sessionId || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError('');
    try {
      await request(`/sessions/${state.sessionId}/cancel`, { method: 'POST' });
    } catch (_) {}
    try {
      sessionStorage.removeItem('photobooth.activeReview');
    } catch (_) {}
    navigate('/templates', { replace: true });
  };

  useEffect(() => {
    if (busy || error || !state?.sessionId || showCancelModal || showRetakeModal) return undefined;
    const timer = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [busy, error, state?.sessionId, showCancelModal, showRetakeModal]);

  useEffect(() => {
    if (remaining === 0 && !error) finishRef.current();
  }, [error, remaining]);

  if (!state?.imageUrl) return <main className="kiosk-container"><h1>Không tìm thấy phiên chụp</h1><button className="btn-primary touch-btn" onClick={() => navigate('/')}>Về trang chủ</button></main>;

  return <main className="kiosk-container review-screen">
    <section className="review-layout glass-panel">
      <div className="review-photo-zone">
        <div className={`review-photo-frame is-${imageStatus}`}>
          {imageStatus === 'loading' && <p className="review-photo-loading" role="status">Đang tải ảnh...</p>}
          {imageStatus === 'error' ? <div className="review-photo-error" role="alert"><p>Ảnh chưa tải kịp. Chạm để tải lại trang.</p><button className="btn-secondary touch-btn" type="button" onClick={() => window.location.reload()}>Tải lại trang</button></div> : <img src={imageUrl} alt="Ảnh vừa ghép" onLoad={() => setImageStatus('loaded')} onError={handleImageError} />}
        </div>
      </div>
      <div className="review-control-zone">
        <p className="review-eyebrow">Photo booth studio</p>
        <h1 className="review-title">Ảnh Của Bạn Đã Sẵn Sàng!</h1>
        <p className="review-description">Kiểm tra lại khoảnh khắc của bạn và chọn số lượng bản in.</p>
        <div className="review-copy-picker">
          <span className="review-copy-label">Số lượng bản in</span>
          <div className="review-copy-controls">
            <button className="review-copy-step touch-btn" disabled={busy || wasAutoPrinted || copies <= 1} aria-label="Giảm số bản" onClick={() => setCopies(value => value - 1)}>-</button>
            <output className="review-copy-number">{copies}</output>
            <span className="review-copy-unit">bản</span>
            <button className="review-copy-step touch-btn" disabled={busy || wasAutoPrinted || copies >= maxCopies} aria-label="Tăng số bản" onClick={() => setCopies(value => value + 1)}>+</button>
          </div>
        </div>
        {wasAutoPrinted && <p className="review-auto-note" role="status">Ảnh đã được gửi in tự động.</p>}
        <div className="review-action-row">
          <button
            type="button"
            className="btn-secondary touch-btn review-back-btn"
            disabled={busy}
            onClick={() => setShowCancelModal(true)}
          >
            Quay Lại
          </button>
          {canRetake && (
            <button
              type="button"
              className="btn-secondary touch-btn review-retake-btn"
              disabled={busy}
              onClick={() => {
                setSelectedRetakePoses([]);
                setShowRetakeModal(true);
              }}
            >
              🔄 Chụp Lại
            </button>
          )}
          {!wasAutoPrinted && (
            <button
              type="button"
              className="btn-secondary touch-btn review-save-btn"
              disabled={busy}
              onClick={handleSaveOnly}
            >
              Lưu Ảnh
            </button>
          )}
          <button
            type="button"
            className="btn-primary touch-btn review-print-btn"
            disabled={busy}
            onClick={finish}
          >
            {wasAutoPrinted ? 'Tiếp Tục' : 'Tiếp Tục & In Ảnh'}
          </button>
        </div>
        <p className="review-timeout">Tự động tiếp tục sau {remaining} giây.</p>
        {busy && <p className="review-timeout" role="status">Đang xử lý...</p>}
        {error && <p className="review-error" role="alert">{error}</p>}
      </div>
      {showCancelModal && (
        <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kiosk-modal glass-panel">
            <h2>Hủy phiên chụp?</h2>
            <p>Ảnh chụp trong phiên này sẽ không được in và không được lưu. Bạn có chắc muốn quay lại không?</p>
            <div className="kiosk-modal-actions">
              <button
                type="button"
                className="btn-secondary touch-btn"
                disabled={busy}
                onClick={() => setShowCancelModal(false)}
              >
                Ở lại
              </button>
              <button
                type="button"
                className="btn-danger touch-btn"
                disabled={busy}
                onClick={handleCancel}
              >
                Xác nhận quay lại
              </button>
            </div>
          </div>
        </div>
      )}
      {showRetakeModal && (
        <div className="kiosk-modal-backdrop" role="dialog" aria-modal="true">
          <div className="kiosk-modal kiosk-retake-modal glass-panel">
            <h2>Chọn ảnh chụp lại</h2>
            <p>Xem lại các ảnh đã chụp bên dưới và chạm vào tấm bạn thấy chưa đẹp để chụp lại:</p>
            <div className="retake-grid">
              {poseList.map(item => {
                const isSelected = selectedRetakePoses.includes(item.poseNumber);
                return (
                  <button
                    key={item.poseNumber}
                    type="button"
                    className={`retake-item touch-btn ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => togglePoseSelection(item.poseNumber)}
                    aria-label={`Chọn ảnh số ${item.poseNumber}`}
                  >
                    <div className="retake-thumb-wrap">
                      <img
                        src={`${item.url}?t=${cacheBuster}`}
                        alt={`Ảnh ${item.poseNumber}`}
                        className="retake-thumb"
                      />
                      <div className="retake-checkbox">
                        {isSelected ? <span>✓</span> : null}
                      </div>
                      {isSelected && <span className="retake-badge-selected">Chụp lại</span>}
                    </div>
                    <span className="retake-item-label">Ảnh {item.poseNumber}</span>
                  </button>
                );
              })}
            </div>
            <div className="kiosk-modal-actions">
              <button
                type="button"
                className="btn-secondary touch-btn"
                onClick={() => setShowRetakeModal(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn-primary touch-btn"
                disabled={selectedRetakePoses.length === 0}
                onClick={handleStartRetake}
              >
                Bắt đầu chụp lại ({selectedRetakePoses.length} ảnh)
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  </main>;
}
