import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function TemplateSelect() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0); 
  const [isLoading, setIsLoading] = useState(true);

  // =====================================
  // STATE ĐỂ NHẬN DIỆN THAO TÁC VUỐT (SWIPE)
  // =====================================
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/templates')
      .then(res => res.json())
      .then(data => {
        setTemplates(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Lỗi:", err);
        setIsLoading(false);
      });
  }, []);

  const handleNext = () => {
    if (templates.length > 0) {
      const selectedTpl = templates[selectedIndex];
      navigate('/capture', { state: { templateId: selectedTpl.id, template: selectedTpl } });
    }
  };

  // =====================================
  // LOGIC ĐIỀU HƯỚNG BĂNG CHUYỀN
  // =====================================
  const handlePrevSlide = () => {
    setSelectedIndex(prev => Math.max(0, prev - 1));
  };

  const handleNextSlide = () => {
    setSelectedIndex(prev => Math.min(templates.length - 1, prev + 1));
  };

  const minSwipeDistance = 50;
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.touches[0].clientX);
  };
  const onTouchMove = (e) => setTouchEnd(e.touches[0].clientX);
  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) handleNextSlide(); 
    if (distance < -minSwipeDistance) handlePrevSlide(); 
  };

  return (
    <div className="kiosk-container" style={{ justifyContent: 'center' }}>
      
      {/* Sửa lại text shadow một chút để chữ không bị chìm nếu hình nền quá sáng/tối */}
      <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', marginBottom: '0.5rem', color: '#0f172a', textShadow: '0 2px 10px rgba(255,255,255,0.8)' }}>
        CHỌN KHUNG ẢNH
      </h1>
      <p style={{ fontSize: '1.5rem', color: '#1e293b', marginBottom: '2rem', textShadow: '0 2px 5px rgba(255,255,255,0.8)', fontWeight: 'bold' }}>
        Lướt hoặc bấm nút để xem các mẫu
      </p>

      {isLoading ? (
        <p style={{ fontSize: '2rem', color: '#0f172a', fontWeight: 'bold', background: 'rgba(255,255,255,0.7)', padding: '10px 20px', borderRadius: '10px' }}>Đang tải danh sách khung...</p>
      ) : (
        
        /* KHU VỰC BĂNG CHUYỀN 3D (CAROUSEL) */
        <div 
          style={{ 
            position: 'relative', 
            width: '100%', 
            maxWidth: '1200px',
            height: '55vh', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            overflow: 'hidden' 
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEndHandler}
        >
          {/* NÚT MŨI TÊN TRÁI */}
          <button 
            onClick={handlePrevSlide} 
            disabled={selectedIndex === 0}
            style={{ 
              position: 'absolute', left: '5%', zIndex: 20, 
              background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', 
              width: '4rem', height: '4rem', fontSize: '2rem', color: '#0f172a',
              cursor: selectedIndex === 0 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)', 
              opacity: selectedIndex === 0 ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(5px)'
            }}
          >
            ❮
          </button>

          {/* DANH SÁCH KHUNG ẢNH */}
          {templates.map((tpl, index) => {
            const offset = index - selectedIndex;
            
            let translateX = '0%';
            let scale = 1;
            let opacity = 1;
            let zIndex = 10;

            if (offset === 0) {
              translateX = '0%';
              scale = 1.05;
              opacity = 1;
              zIndex = 10;
            } else if (offset === -1) {
              translateX = '-110%'; 
              scale = 0.75;
              opacity = 0.7; // Tăng nhẹ opacity cho khung 2 bên nhìn rõ hơn xíu
              zIndex = 5;
            } else if (offset === 1) {
              translateX = '110%'; 
              scale = 0.75;
              opacity = 0.7;
              zIndex = 5;
            } else if (offset < -1) {
              translateX = '-200%';
              scale = 0.5;
              opacity = 0;
              zIndex = 1;
            } else if (offset > 1) {
              translateX = '200%';
              scale = 0.5;
              opacity = 0;
              zIndex = 1;
            }

            return (
              <div 
                key={tpl.id}
                onClick={() => setSelectedIndex(index)} 
                style={{
                  position: 'absolute',
                  height: '85%',
                  aspectRatio: '2/3',
                  
                  // ========================================================
                  // ĐIỂM SỬA CHÍNH: Nền mờ ảo, xuyên thấu nhẹ (Glassmorphism)
                  // ========================================================
                  backgroundColor: tpl.image_url ? 'rgba(255, 255, 255, 0.85)' : (tpl.color || 'rgba(255,255,255,0.85)'),
                  backdropFilter: 'blur(8px)', // Làm mờ hình nền Brand phía sau khung
                  
                  backgroundImage: tpl.image_url ? `url(${tpl.image_url})` : 'none',
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  border: offset === 0 ? '8px solid #10b981' : '4px solid rgba(255, 255, 255, 0.6)',
                  borderRadius: '1.5rem',
                  boxShadow: offset === 0 ? '0 20px 40px rgba(16, 185, 129, 0.4)' : '0 10px 25px rgba(0,0,0,0.15)',
                  cursor: 'pointer',
                  transition: 'all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)', 
                  transform: `translateX(${translateX}) scale(${scale})`,
                  opacity: opacity,
                  zIndex: zIndex,
                }}
              >
                {/* Dấu tích xanh chỉ hiện ở khung trung tâm */}
                {offset === 0 && (
                  <div style={{
                    position: 'absolute', top: '-1rem', right: '-1rem',
                    backgroundColor: '#10b981', color: 'white',
                    width: '3.5rem', height: '3.5rem', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 'bold', fontSize: '1.8rem', boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                  }}>✓</div>
                )}
              </div>
            );
          })}

          {/* NÚT MŨI TÊN PHẢI */}
          <button 
            onClick={handleNextSlide} 
            disabled={selectedIndex === templates.length - 1}
            style={{ 
              position: 'absolute', right: '5%', zIndex: 20, 
              background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', 
              width: '4rem', height: '4rem', fontSize: '2rem', color: '#0f172a',
              cursor: selectedIndex === templates.length - 1 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)', 
              opacity: selectedIndex === templates.length - 1 ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(5px)'
            }}
          >
            ❯
          </button>
        </div>
      )}

      <div style={{ marginTop: '3rem', display: 'flex', gap: '2rem' }}>
        <button className="btn-secondary" style={{ backdropFilter: 'blur(5px)', background: 'rgba(241, 245, 249, 0.9)' }} onClick={() => navigate('/')}>QUAY LẠI</button>
        <button className="btn-primary" onClick={handleNext} disabled={templates.length === 0}>TIẾP TỤC</button>
      </div>
    </div>
  );
}

export default TemplateSelect;