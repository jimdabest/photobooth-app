import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import '../App.css';

const PRINT_STATUSES = [
  'Đang xử lý màu sắc chuẩn Studio...',
  'Đang truyền dữ liệu xuống máy in nhiệt...',
  'Đang cắt giấy và phủ màng bảo vệ ảnh...',
  'Hoàn tất! Vui lòng nhận ảnh tại khay bên dưới.'
];

export default function Download() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const qrTimeout = Math.min(600, Math.max(1, Number(state?.settings?.qr_timeout) || 15));
  const [remaining, setRemaining] = useState(qrTimeout);
  const isOffline = Boolean(state?.settings?.offline_mode);
  const sessionUrl = state?.sessionUrl || (state?.sessionId
    ? `${(process.env.REACT_APP_PUBLIC_URL || window.location.origin).replace(/\/$/, '')}/#/photo/${encodeURIComponent(state.sessionId)}`
    : '');
  const statusIndex = Math.min(PRINT_STATUSES.length - 1, Math.floor((qrTimeout - remaining) / (qrTimeout / PRINT_STATUSES.length)));

  useEffect(() => {
    const countdown = setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    const redirect = setTimeout(() => navigate('/', { replace: true }), qrTimeout * 1000);
    return () => {
      clearInterval(countdown);
      clearTimeout(redirect);
    };
  }, [navigate, qrTimeout]);

  return <main className="kiosk-container download-screen">
    <section className={`download-layout glass-panel ${isOffline ? 'is-offline' : ''}`}>
      <div className="print-experience">
        <h1 className="print-title">Ảnh của bạn đang được in...</h1>
        <p className="print-status" aria-live="polite">{PRINT_STATUSES[statusIndex]}</p>
        <div className="printer-visual" aria-label="Hiệu ứng ảnh đang được in">
          <div className="printer-top" />
          <div className="printer-slot" />
          <div className="printed-paper">
            <svg className="printed-paper-demo" viewBox="0 0 150 200" role="img" aria-label="Ảnh mẫu đang được in">
              <rect width="150" height="200" fill="#ffffff" />
              <rect x="16" y="15" width="118" height="132" fill="#f8fafc" stroke="#60a5fa" strokeWidth="5" />
              <rect x="27" y="27" width="96" height="106" rx="3" fill="#f8fafc" stroke="#3f3a34" strokeWidth="6" />
              <circle cx="92" cy="61" r="18" fill="#ffd071" stroke="#3f3a34" strokeWidth="6" />
              <path d="M31 127 61 77l28 50Z" fill="#8bd39a" stroke="#3f3a34" strokeWidth="6" strokeLinejoin="round" />
              <path d="m68 127 25-33 26 33Z" fill="#6bc477" stroke="#3f3a34" strokeWidth="6" strokeLinejoin="round" />
              <text x="75" y="176" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="700">PHOTOBOOTH</text>
            </svg>
          </div>
          <div className="printer-base" />
        </div>
        <div className="download-progress-track"><div className="download-progress-value" style={{ animationDuration: `${qrTimeout}s` }} /></div>
        <div className="download-progress-label"><span>Tiến trình in ảnh</span><span>{Math.round(((qrTimeout - remaining) / qrTimeout) * 100)}%</span></div>
        {state?.printError && <p className="review-error" role="alert">{state.printError}. Vui lòng liên hệ nhân viên.</p>}
      </div>
      {!isOffline && sessionUrl && <aside className="download-qr-zone glass-panel">
        <div className="qr-code-wrap"><QRCodeCanvas value={sessionUrl} size={250} level="H" /></div>
        <h2>Tải ảnh về điện thoại</h2>
        <p>Quét mã QR để tải ảnh gốc và ảnh động về điện thoại.</p>
      </aside>}
    </section>
    <p className="download-return">Tự động quay về màn hình chính sau {remaining} giây</p>
  </main>;
}
