import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';
import { request } from '../services/kioskApi';

function Arrow({ direction }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={direction === 'left' ? 'M14.5 5 7.5 12l7 7' : 'm9.5 5 7 7-7 7'} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function TemplateSelect() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  useEffect(() => {
    request('/settings')
      .then(settings => setTemplates((settings.templates || []).filter(template => !template.hidden)))
      .catch(error => console.error('Không thể tải danh sách khung:', error))
      .finally(() => setIsLoading(false));
  }, []);

  const selectPrevious = () => setSelectedIndex(index => Math.max(0, index - 1));
  const selectNext = () => setSelectedIndex(index => Math.min(templates.length - 1, index + 1));
  const handleSwipeEnd = () => {
    if (touchStart === null || touchEnd === null) return;
    if (touchStart - touchEnd > 50) selectNext();
    if (touchStart - touchEnd < -50) selectPrevious();
  };
  const startCapture = () => {
    const template = templates[selectedIndex];
    if (template) navigate('/capture', { state: { templateId: template.id, template, retakeCount: 0 } });
  };

  return <main className="kiosk-container template-screen">
    <header className="template-heading">
      <h1>CHỌN KHUNG ẢNH</h1>
      <p>Lướt hoặc bấm nút để xem các mẫu</p>
    </header>

    {isLoading ? <p className="template-message glass-panel">Đang tải danh sách khung...</p> : templates.length === 0 ? <p className="template-message glass-panel">Hiện chưa có khung ảnh nào.</p> : <>
      <section className="template-carousel" onTouchStart={event => { setTouchEnd(null); setTouchStart(event.touches[0].clientX); }} onTouchMove={event => setTouchEnd(event.touches[0].clientX)} onTouchEnd={handleSwipeEnd}>
        <button className="template-arrow touch-btn" type="button" onClick={selectPrevious} disabled={selectedIndex === 0} aria-label="Khung trước"><Arrow direction="left" /></button>
        <div className="template-cards">
          {templates.map((template, index) => {
            const offset = index - selectedIndex;
            return <button
              type="button"
              key={template.id}
              className={`template-card ${offset === 0 ? 'is-selected' : ''}`}
              style={{
                '--offset': offset,
                '--scale': offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.76 : 0.56,
                '--opacity': Math.abs(offset) === 0 ? 1 : Math.abs(offset) === 1 ? 0.58 : 0,
                '--template-color': template.color || '#ffffff',
                '--template-image': template.image_url ? `url(${template.image_url})` : 'none',
                pointerEvents: Math.abs(offset) <= 1 ? 'auto' : 'none',
                zIndex: offset === 0 ? 3 : Math.abs(offset) === 1 ? 2 : 1
              }}
              onClick={() => setSelectedIndex(index)}
              aria-label={`Chọn khung ${index + 1}`}
              aria-pressed={offset === 0}
            >
              <span className="template-card-art" />
              {offset === 0 && <span className="template-selected-mark">Đã chọn</span>}
            </button>;
          })}
        </div>
        <button className="template-arrow touch-btn" type="button" onClick={selectNext} disabled={selectedIndex === templates.length - 1} aria-label="Khung tiếp theo"><Arrow direction="right" /></button>
      </section>
      <nav className="template-actions">
        <button className="btn-secondary touch-btn template-back" type="button" onClick={() => navigate('/')}>QUAY LẠI</button>
        <button className="btn-primary touch-btn template-continue" type="button" onClick={startCapture}>TIẾP TỤC</button>
      </nav>
    </>}
  </main>;
}
