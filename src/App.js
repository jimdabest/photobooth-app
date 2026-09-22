import React, { useEffect, useState, useRef } from 'react';
import { HashRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Home from './pages/Home';
import TemplateSelect from './pages/TemplateSelect';
import Capture from './pages/Capture';
import Review from './pages/Review';
import Download from './pages/Download';
import Admin from './pages/Admin';
import './App.css';

// Quản lý hình nền theo route
function BackgroundManager() {
  const location = useLocation();

  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/settings")
      .then(res => res.json())
      .then(data => {
        let dynamicStyle = document.getElementById('dynamic-bg-style');
        if (!dynamicStyle) {
          dynamicStyle = document.createElement('style');
          dynamicStyle.id = 'dynamic-bg-style';
          document.head.appendChild(dynamicStyle);
        }

        if (location.pathname.includes('/admin')) {
          document.body.style.backgroundImage = "none";
          document.body.style.backgroundColor = "#ffffff";
          dynamicStyle.innerHTML = ``;
        } else {
          if (data.bg_url) {
            document.body.style.backgroundImage = `url('${data.bg_url}')`;
            document.body.style.backgroundSize = "cover";
            document.body.style.backgroundPosition = "center";
            document.body.style.backgroundRepeat = "no-repeat";
            document.body.style.backgroundAttachment = "fixed";
            dynamicStyle.innerHTML = `
                #root, .kiosk-container {
                    background: transparent !important;
                    background-color: transparent !important;
                }
            `;
          } else {
            document.body.style.backgroundImage = "none";
            document.body.style.backgroundColor = "#f1f5f9";
            dynamicStyle.innerHTML = ``;
          }
        }
      })
      .catch(err => console.error("Lỗi lấy cài đặt nền:", err));
  }, [location.pathname]);

  return null;
}

// Vùng chạm ẩn góc phải trên để mở panel điều khiển
function QuickControl() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPanel, setShowPanel] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(true);
  const autoHideTimer = useRef(null);

  const isAdminPage = location.pathname.includes('/admin');

  // Lắng nghe sự kiện thay đổi state cửa sổ từ Electron
  useEffect(() => {
    if (window.electronAPI?.onWindowStateChange) {
      const cleanup = window.electronAPI.onWindowStateChange((data) => {
        setIsFullScreen(data.isFullScreen);
      });
      return cleanup;
    }
  }, []);

  const resetAutoHide = () => {
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    autoHideTimer.current = setTimeout(() => setShowPanel(false), 10000);
  };

  const openPanel = () => {
    setShowPanel(true);
    resetAutoHide();
  };

  const closePanel = () => {
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    setShowPanel(false);
  };

  useEffect(() => {
    return () => {
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current);
    };
  }, []);

  useEffect(() => {
    closePanel();
  }, [location.pathname]);

  if (isAdminPage) return null;

  return (
    <>
      {/* Vùng chạm ẩn góc phải trên */}
      {!showPanel && (
        <div
          onClick={openPanel}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '100px',
            height: '100px',
            zIndex: 99998,
            background: 'transparent',
            cursor: 'pointer'
          }}
          aria-label="Mở menu điều khiển"
        />
      )}

      {/* Panel điều khiển */}
      {showPanel && (
        <>
          <div
            onClick={closePanel}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(4px)',
              zIndex: 99998,
              animation: 'fadeIn 0.2s ease'
            }}
          />

          <div
            onClick={(e) => { e.stopPropagation(); resetAutoHide(); }}
            style={{
              position: 'fixed',
              top: '20px',
              right: '20px',
              width: '340px',
              backgroundColor: 'white',
              borderRadius: '20px',
              padding: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              zIndex: 99999,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              animation: 'slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
              paddingBottom: '12px',
              borderBottom: '2px solid #f1f5f9'
            }}>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', fontWeight: 'bold' }}>
                Điều Khiển
              </h3>
              <button
                onClick={closePanel}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '20px',
                  color: '#64748b',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                ✕
              </button>
            </div>

            {/* Nút Trang Quản Trị */}
            <button
              onClick={() => { navigate('/admin'); closePanel(); }}
              style={{
                padding: '18px 20px',
                backgroundColor: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                cursor: 'pointer',
                fontSize: '17px',
                fontWeight: 'bold',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                minHeight: '64px',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <span style={{ fontSize: '24px' }}>⚙️</span>
              <span>Trang Quản Trị</span>
            </button>

            {/* Nút Toggle Fullscreen và Windowed */}
            <button
              onClick={() => {
                if (window.electronAPI?.toggleWindow) {
                  window.electronAPI.toggleWindow();
                }
                closePanel();
              }}
              style={{
                padding: '18px 20px',
                backgroundColor: '#f59e0b',
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                cursor: 'pointer',
                fontSize: '17px',
                fontWeight: 'bold',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                minHeight: '64px',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
              }}
            >
              <span style={{ fontSize: '24px' }}>
                {isFullScreen ? '🗕' : '🗖'}
              </span>
              <span>
                {isFullScreen ? 'Thu Nhỏ Cửa Sổ' : 'Mở Rộng Toàn Màn Hình'}
              </span>
            </button>

            {/* Nút Tắt */}
            <button
              onClick={() => {
                if (window.electronAPI?.exitApp) window.electronAPI.exitApp();
              }}
              style={{
                padding: '18px 20px',
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '14px',
                cursor: 'pointer',
                fontSize: '17px',
                fontWeight: 'bold',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                minHeight: '64px',
                WebkitTapHighlightColor: 'transparent',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
              }}
            >
              <span style={{ fontSize: '24px' }}>⏻</span>
              <span>Tắt Ứng Dụng</span>
            </button>
          </div>
        </>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: translateX(40px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </>
  );
}

function App() {
  return (
    <Router>
      <BackgroundManager />
      <QuickControl />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/templates" element={<TemplateSelect />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/review" element={<Review />} />
        <Route path="/download/:sessionId" element={<Download />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </Router>
  );
}

export default App;