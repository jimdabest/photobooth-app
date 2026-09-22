import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../App.css';

const R2_PUBLIC_URL = process.env.REACT_APP_R2_PUBLIC_URL || 'https://pub-7c6451405eed4ad1b078d02ae8a7fcad.r2.dev';
const isZalo = () => /Zalo/i.test(navigator.userAgent);

function Download() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [metadata, setMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [downloadingUrl, setDownloadingUrl] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300);

  const thumbnailsRef = useRef(null);
  const inZalo = isZalo();

  // Fetch metadata
  useEffect(() => {
    if (!sessionId) {
      setError('Không có session ID');
      setIsLoading(false);
      return;
    }

    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const metadataUrl = `${R2_PUBLIC_URL}/prints/${monthStr}/${sessionId}/metadata.json`;

    fetch(metadataUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setMetadata(data);
        setCurrentIndex(0);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('[Download] Lỗi:', err);
        const fallbackUrl = `${R2_PUBLIC_URL}/prints/${monthStr}/${sessionId}/final.jpg`;
        setMetadata({
          session_id: sessionId,
          final_image: fallbackUrl,
          poses: []
        });
        setIsLoading(false);
      });
  }, [sessionId]);

  // Đếm ngược
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Tạo danh sách ảnh
  const allImages = [];
  if (metadata?.final_image) {
    allImages.push({
      url: metadata.final_image,
      label: 'STRIP',
      filename: `photobooth_${sessionId}_final.jpg`
    });
  }
  (metadata?.poses || []).forEach((url, i) => {
    allImages.push({
      url,
      label: `#${i + 1}`,
      filename: `photobooth_${sessionId}_pose_${i + 1}.jpg`
    });
  });

  const totalImages = allImages.length;
  const currentImage = allImages[currentIndex] || null;

  const goPrev = () => {
    setCurrentIndex(prev => prev > 0 ? prev - 1 : totalImages - 1);
  };

  const goNext = () => {
    setCurrentIndex(prev => prev < totalImages - 1 ? prev + 1 : 0);
  };

  // Scroll thumbnail theo ảnh hiện tại
  useEffect(() => {
    if (thumbnailsRef.current) {
      const activeThumb = thumbnailsRef.current.querySelector(`[data-index="${currentIndex}"]`);
      if (activeThumb) {
        activeThumb.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [currentIndex]);

  // Download qua Worker proxy
  const handleDownload = async (url, filename) => {
    if (!url) return;
    try {
      setDownloadingUrl(url);

      const encodedUrl = encodeURIComponent(url);
      const encodedFilename = encodeURIComponent(filename);
      const proxyUrl = `/api/download?url=${encodedUrl}&filename=${encodedFilename}`;

      try {
        const link = document.createElement('a');
        link.href = proxyUrl;
        link.download = filename;
        link.target = '_system';
        link.rel = 'noopener';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (link.parentNode) document.body.removeChild(link);
        }, 500);
        return;
      } catch (linkErr) {
        console.warn('[Download] Link _system lỗi:', linkErr);
      }

      try {
        window.location.href = proxyUrl;
        return;
      } catch (navErr) {
        console.warn('[Download] window.location lỗi:', navErr);
      }

      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 500);

    } catch (err) {
      console.error('[Download] Lỗi:', err);
      alert('Không tải tự động được.\n\nVui lòng:\n1. Bấm giữ ảnh\n2. Chọn "Lưu ảnh"');
    } finally {
      setTimeout(() => setDownloadingUrl(null), 1500);
    }
  };

  const handleDownloadCurrent = () => {
    if (currentImage) {
      handleDownload(currentImage.url, currentImage.filename);
    }
  };

  const handleDownloadAll = async () => {
    for (const img of allImages) {
      await handleDownload(img.url, img.filename);
      await new Promise(r => setTimeout(r, 800));
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{
          width: '50px', height: '50px',
          border: '5px solid #e2e8f0',
          borderTop: '5px solid #ec4899',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '1rem' }}>
          Đang tải ảnh...
        </p>
        <style>{`@keyframes spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }`}</style>
      </div>
    );
  }

  if (error || !currentImage) {
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        backgroundColor: '#f8fafc'
      }}>
        <h1 style={{ fontSize: '1.5rem', color: '#0f172a', marginBottom: '1rem' }}>
          Không tìm thấy ảnh
        </h1>
        <p style={{ color: '#64748b', marginBottom: '2rem', textAlign: 'center' }}>
          {error || 'Ảnh chưa được tải lên'}
        </p>
        <button className="btn-primary" onClick={() => navigate('/')}>
          Quay Về Trang Chủ
        </button>
      </div>
    );
  }

  const hasMultiple = totalImages > 1;

  return (
    <div style={{
      height: '100dvh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
      maxWidth: '100vw'
    }}>

      {/* Header */}
      <div style={{
        flexShrink: 0,
        textAlign: 'center',
        padding: 'clamp(0.6rem, 2vw, 1rem) 1rem clamp(0.3rem, 1vw, 0.5rem)'
      }}>
        <h1 style={{
          fontSize: 'clamp(1rem, 3vw, 1.5rem)',
          color: '#0f172a',
          fontWeight: '800',
          margin: '0 0 0.2rem 0',
          lineHeight: 1.2
        }}>
          Ảnh Của Bạn Đã Sẵn Sàng
        </h1>
        <p style={{
          color: '#64748b',
          fontSize: 'clamp(0.7rem, 2vw, 0.85rem)',
          margin: 0
        }}>
          {hasMultiple
            ? `${currentIndex + 1} / ${totalImages} ảnh`
            : 'Bấm nút bên dưới để tải ảnh'}
        </p>
      </div>

      {/* Cảnh báo Zalo */}
      {inZalo && (
        <div style={{
          flexShrink: 0,
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '8px',
          padding: 'clamp(0.4rem, 1.5vw, 0.6rem) clamp(0.6rem, 2vw, 0.9rem)',
          margin: '0 1rem clamp(0.4rem, 1.5vw, 0.6rem)',
          fontSize: 'clamp(0.65rem, 1.8vw, 0.75rem)',
          color: '#92400e',
          lineHeight: 1.35,
          maxWidth: 'min(90vw, 600px)',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          <strong>Đang mở trong Zalo.</strong> Nếu nút Tải không hoạt động: bấm <strong>3 chấm</strong> → <strong>Mở bằng trình duyệt</strong>
        </div>
      )}

      {/* Vùng ảnh chính */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 clamp(0.5rem, 2vw, 1rem)',
        position: 'relative',
        overflow: 'hidden'
      }}>

        {/* Mũi tên trái */}
        {hasMultiple && (
          <button
            onClick={goPrev}
            aria-label="Ảnh trước"
            style={{
              position: 'absolute',
              left: 'clamp(0.3rem, 1.5vw, 1rem)',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 'clamp(36px, 6vw, 48px)',
              height: 'clamp(36px, 6vw, 48px)',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'clamp(16px, 3vw, 22px)',
              color: '#0f172a',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              zIndex: 10,
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            ❮
          </button>
        )}

        {/* Khung ảnh */}
        <div style={{
          backgroundColor: 'white',
          padding: 'clamp(0.3rem, 1vw, 0.6rem)',
          borderRadius: '0.8rem',
          boxShadow: '0 8px 25px rgba(0,0,0,0.1)',
          maxWidth: 'min(85vw, 500px)',
          maxHeight: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <img
            key={currentImage.url}
            src={currentImage.url}
            alt={currentImage.label}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              borderRadius: '0.4rem',
              display: 'block',
              backgroundColor: '#f1f5f9'
            }}
          />
        </div>

        {/* Mũi tên phải */}
        {hasMultiple && (
          <button
            onClick={goNext}
            aria-label="Ảnh sau"
            style={{
              position: 'absolute',
              right: 'clamp(0.3rem, 1.5vw, 1rem)',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 'clamp(36px, 6vw, 48px)',
              height: 'clamp(36px, 6vw, 48px)',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'clamp(16px, 3vw, 22px)',
              color: '#0f172a',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
              zIndex: 10,
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            ❯
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {hasMultiple && (
        <div
          ref={thumbnailsRef}
          style={{
            flexShrink: 0,
            display: 'flex',
            gap: 'clamp(0.3rem, 1vw, 0.5rem)',
            overflowX: 'auto',
            overflowY: 'hidden',
            padding: 'clamp(0.4rem, 1.5vw, 0.6rem) clamp(0.5rem, 2vw, 1rem)',
            WebkitOverflowScrolling: 'touch',
            scrollSnapType: 'x mandatory',
            scrollbarWidth: 'none',
            justifyContent: 'center'
          }}
        >
          {allImages.map((img, idx) => (
            <button
              key={idx}
              data-index={idx}
              onClick={() => setCurrentIndex(idx)}
              style={{
                flexShrink: 0,
                width: 'clamp(48px, 8vw, 64px)',
                height: 'clamp(48px, 8vw, 64px)',
                padding: 0,
                border: currentIndex === idx
                  ? '3px solid #ec4899'
                  : '2px solid #e2e8f0',
                borderRadius: '0.4rem',
                cursor: 'pointer',
                overflow: 'hidden',
                backgroundColor: 'white',
                position: 'relative',
                scrollSnapAlign: 'center',
                transition: 'border-color 0.2s',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              <img
                src={img.url}
                alt={img.label}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: img.label === 'STRIP'
                  ? 'rgba(236, 72, 153, 0.9)'
                  : 'rgba(15, 23, 42, 0.8)',
                color: 'white',
                fontSize: 'clamp(0.5rem, 1.5vw, 0.6rem)',
                padding: '1px 2px',
                fontWeight: 'bold',
                textAlign: 'center',
                lineHeight: 1.3
              }}>
                {img.label}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Action bar */}
      <div style={{
        flexShrink: 0,
        backgroundColor: 'white',
        padding: 'clamp(0.5rem, 2vw, 0.8rem) clamp(0.5rem, 2vw, 1rem)',
        boxShadow: '0 -4px 15px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.3rem, 1vw, 0.5rem)',
        width: '100%',
        maxWidth: 'min(85vw, 500px)',
        margin: '0 auto'
      }}>
        <button
          onClick={handleDownloadCurrent}
          disabled={downloadingUrl === currentImage.url}
          style={{
            padding: 'clamp(10px, 2vw, 14px) clamp(12px, 2.5vw, 20px)',
            fontSize: 'clamp(0.9rem, 2vw, 1rem)',
            width: '100%',
            background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)',
            opacity: downloadingUrl === currentImage.url ? 0.7 : 1,
            WebkitTapHighlightColor: 'transparent'
          }}
        >
          {downloadingUrl === currentImage.url
            ? 'ĐANG TẢI...'
            : `TẢI ẢNH ${currentImage.label} VỀ`}
        </button>

        {hasMultiple && (
          <button
            onClick={handleDownloadAll}
            style={{
              padding: 'clamp(8px, 1.8vw, 12px) clamp(12px, 2.5vw, 20px)',
              fontSize: 'clamp(0.8rem, 1.8vw, 0.95rem)',
              width: '100%',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              WebkitTapHighlightColor: 'transparent'
            }}
          >
            TẢI TẤT CẢ ({totalImages} ảnh)
          </button>
        )}

        <div style={{
          textAlign: 'center',
          fontSize: 'clamp(0.6rem, 1.5vw, 0.7rem)',
          color: '#94a3b8',
          lineHeight: 1.2
        }}>
          Trang tự đóng sau {timeLeft}s
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        div::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

export default Download;