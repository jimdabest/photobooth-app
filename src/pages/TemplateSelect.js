import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function TemplateSelect() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0); // Thay vì lưu ID, ta lưu Vị trí (Index)
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

  // Logic tính toán khoảng cách vuốt ngón tay
  const minSwipeDistance = 50;
  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.touches[0].clientX);
  };
  const onTouchMove = (e) => setTouchEnd(e.touches[0].clientX);
  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) handleNextSlide(); // Vuốt sang trái -> Xem hình tiếp theo
    if (distance < -minSwipeDistance) handlePrevSlide(); // Vuốt sang phải -> Xem hình trước đó
  };

  return (
    <div className="kiosk-container" style={{ justifyContent: 'center' }}>
      <h1 style={{ fontSize: 'clamp(2.5rem, 5vw, 4rem)', marginBottom: '0.5rem', color: '#0f172a' }}>
        CHỌN KHUNG ẢNH
      </h1>
      <p style={{ fontSize: '1.5rem', color: '#475569', marginBottom: '2rem' }}>
        Lướt hoặc bấm nút để xem các mẫu
      </p>

      {isLoading ? (
        <p style={{ fontSize: '2rem', color: '#0f172a' }}>Đang tải danh sách khung...</p>
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
              background: 'white', border: 'none', borderRadius: '50%', 
              width: '4rem', height: '4rem', fontSize: '2rem', color: '#0f172a',
              cursor: selectedIndex === 0 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)', 
              opacity: selectedIndex === 0 ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ❮
          </button>

          {/* DANH SÁCH KHUNG ẢNH */}
          {templates.map((tpl, index) => {
            // Tính khoảng cách của khung hiện tại so với khung đang được chọn
            const offset = index - selectedIndex;
            
            let translateX = '0%';
            let scale = 1;
            let opacity = 1;
            let zIndex = 10;

            if (offset === 0) {
              // Khung trung tâm (Đang chọn)
              translateX = '0%';
              scale = 1.05;
              opacity = 1;
              zIndex = 10;
            } else if (offset === -1) {
              // Khung bên trái
              translateX = '-110%'; 
              scale = 0.75;
              opacity = 0.4;
              zIndex = 5;
            } else if (offset === 1) {
              // Khung bên phải
              translateX = '110%'; 
              scale = 0.75;
              opacity = 0.4;
              zIndex = 5;
            } else if (offset < -1) {
              // Các khung ẩn ngoài cùng bên trái
              translateX = '-200%';
              scale = 0.5;
              opacity = 0;
              zIndex = 1;
            } else if (offset > 1) {
              // Các khung ẩn ngoài cùng bên phải
              translateX = '200%';
              scale = 0.5;
              opacity = 0;
              zIndex = 1;
            }

            return (
              <div 
                key={tpl.id}
                onClick={() => setSelectedIndex(index)} // Bấm vào khung nào thì khung đó sẽ chạy vào giữa
                style={{
                  position: 'absolute',
                  height: '85%',
                  aspectRatio: '2/3',
                  backgroundColor: tpl.image_url ? 'transparent' : (tpl.color || '#fff'),
                  backgroundImage: tpl.image_url ? `url(${tpl.image_url})` : 'none',
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  border: offset === 0 ? '8px solid #10b981' : '4px solid transparent',
                  borderRadius: '1.5rem',
                  boxShadow: offset === 0 ? '0 20px 40px rgba(16, 185, 129, 0.4)' : '0 10px 20px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  transition: 'all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)', // Chuyển động lướt mềm mại
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
              background: 'white', border: 'none', borderRadius: '50%', 
              width: '4rem', height: '4rem', fontSize: '2rem', color: '#0f172a',
              cursor: selectedIndex === templates.length - 1 ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)', 
              opacity: selectedIndex === templates.length - 1 ? 0.3 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ❯
          </button>
        </div>
      )}

      <div style={{ marginTop: '3rem', display: 'flex', gap: '2rem' }}>
        <button className="btn-secondary" onClick={() => navigate('/')}>QUAY LẠI</button>
        <button className="btn-primary" onClick={handleNext} disabled={templates.length === 0}>TIẾP TỤC</button>
      </div>
    </div>
  );
}

export default TemplateSelect;