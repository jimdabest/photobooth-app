import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { printSession, request } from '../services/kioskApi';
import '../App.css';

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
  const [error, setError] = useState(state?.printError || '');
  const [remaining, setRemaining] = useState(state?.settings?.review_timeout || 30);
  const [imageUrl, setImageUrl] = useState(state?.imageUrl || '');
  const [imageStatus, setImageStatus] = useState('loading');
  const actionLock = useRef(false);
  const imageRetryCount = useRef(0);
  const imageRetryTimer = useRef(null);
  const maxCopies = Math.min(10, Math.max(1, Number(settings.max_print_copies || 10)));
  const wasAutoPrinted = Boolean(state?.printQueued);
  const canRetake = settings.enable_retake === true && (state?.retakeCount || 0) < 1;

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

  useEffect(() => {
    if (busy || error || !state?.sessionId) return undefined;
    const timer = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [busy, error, state?.sessionId]);

  useEffect(() => {
    if (remaining === 0 && !error) finishRef.current();
  }, [error, remaining]);

  const retake = () => {
    if (actionLock.current) return;
    actionLock.current = true;
    navigate('/capture', {
      replace: true,
      state: { templateId: state.templateId, template: state.template, retakeCount: (state.retakeCount || 0) + 1 }
    });
  };

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
          {canRetake && <button className="btn-secondary touch-btn review-retake" disabled={busy} onClick={retake}>Chụp Lại</button>}
          <button className="btn-primary touch-btn review-print" disabled={busy} onClick={finish}>{wasAutoPrinted ? 'Tiếp Tục' : 'Tiếp Tục & In Ảnh'}</button>
        </div>
        <p className="review-timeout">Tự động tiếp tục sau {remaining} giây.</p>
        {busy && <p className="review-timeout" role="status">Đang gửi lệnh in...</p>}
        {error && <p className="review-error" role="alert">{error}</p>}
      </div>
    </section>
  </main>;
}
