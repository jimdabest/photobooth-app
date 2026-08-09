import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function TemplateSelect() {
  const navigate = useNavigate();
  
  // Biến lưu danh sách khung từ Backend
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Gọi API lấy danh sách khung khi mở trang
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/templates')
      .then(res => res.json())
      .then(data => {
        setTemplates(data);
        // Tự động chọn khung đầu tiên làm mặc định nếu có data
        if (data.length > 0) {
          setSelectedTemplate(data[0].id);
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Lỗi lấy danh sách khung:", err);
        setIsLoading(false);
      });
  }, []);

  const handleNext = () => {
    // Tìm khung ảnh khách vừa chọn trong danh sách
    const selectedTpl = templates.find(t => t.id === selectedTemplate);
    // Chuyển sang trang chụp và truyền theo ID của khung đã chọn
    navigate('/capture', { state: { templateId: selectedTemplate, template: selectedTpl } });
  };

  return (
    <div className="kiosk-container">
      <h1 style={{ fontSize: '4vh', marginBottom: '2vh' }}>CHỌN KHUNG ẢNH CỦA BẠN</h1>
      <p style={{ fontSize: '2vh', marginBottom: '5vh' }}>Chạm vào mẫu bạn thích nhất</p>

      {isLoading ? (
        <p style={{ fontSize: '3vh' }}>Đang tải danh sách khung...</p>
      ) : (
        <div style={{ display: 'flex', gap: '3vw', flexWrap: 'wrap', justifyContent: 'center' }}>
          {templates.map(tpl => (
            <div 
              key={tpl.id}
              onClick={() => setSelectedTemplate(tpl.id)}
              style={{
                width: '20vw',
                height: '30vw',
                // Ưu tiên hiển thị ảnh thật, nếu chưa upload ảnh thì dùng màu nền
                backgroundColor: tpl.image_url ? 'transparent' : (tpl.color || '#fff'),
                backgroundImage: tpl.image_url ? `url(${tpl.image_url})` : 'none',
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                // Đổi viền thành màu xanh lá khi được chọn
                border: selectedTemplate === tpl.id ? '6px solid #4CAF50' : '6px solid transparent',
                borderRadius: '2vh',
                boxShadow: '0 1vh 2vh rgba(0,0,0,0.3)',
                cursor: 'pointer',
                transition: 'transform 0.2s',
                transform: selectedTemplate === tpl.id ? 'scale(1.05)' : 'scale(1)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                paddingBottom: '2vh',
                position: 'relative'
              }}
            >
              {/* Nếu khung chưa có ảnh thật, hiển thị tên của khung lên màn hình */}
              {!tpl.image_url && <h2 style={{ color: '#333' }}>{tpl.name}</h2>}
              
              {/* Hiển thị dấu check xanh nhỏ góc trên nếu được chọn */}
              {selectedTemplate === tpl.id && (
                <div style={{
                  position: 'absolute', top: '1vh', right: '1vh',
                  backgroundColor: '#4CAF50', color: 'white',
                  width: '4vh', height: '4vh', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 'bold', fontSize: '2vh'
                }}>✓</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '8vh', display: 'flex', gap: '2vw' }}>
        <button className="start-btn" onClick={() => navigate('/')} style={{ backgroundColor: '#555' }}>
          QUAY LẠI
        </button>
        <button 
          className="start-btn" 
          onClick={handleNext}
          disabled={!selectedTemplate} // Khóa nút nếu chưa chọn khung nào
        >
          TIẾP TỤC
        </button>
      </div>
    </div>
  );
}

export default TemplateSelect;