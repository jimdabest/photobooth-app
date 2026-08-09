import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function TemplateSelect() {
  const navigate = useNavigate();

  // Danh sách các khung (Sau này bạn chỉ cần đổi 'color' thành 'image: url_anh_png')
  const templates = [
    { id: 'template_1', name: 'Mẫu 1', color: '#ffb8b8' }, // Hồng nhẹ
    { id: 'template_2', name: 'Mẫu 2', color: '#b8e9ff' }, // Xanh nhạt
    { id: 'template_3', name: 'Mẫu 3', color: '#fff3b8' }  // Vàng nhạt
  ];

  const handleSelectTemplate = (templateId) => {
    // Chuyển sang trang chụp (sau này sẽ truyền cả templateId đi theo)
    navigate('/capture');
  };

  return (
    <div className="kiosk-container">
      <div className="text-instruction" style={{ marginTop: '50px' }}>
        <h1>CHỌN MẪU KHUNG</h1>
        <p>Chạm vào một mẫu bên dưới để bắt đầu chụp</p>
      </div>
      
      {/* Khu vực hiển thị danh sách khung */}
      <div style={{ 
        display: 'flex', 
        gap: '3vw', /* Khoảng cách giãn theo bề ngang màn hình */
        marginTop: '5vh', 
        justifyContent: 'center',
        flexWrap: 'wrap' /* Tự động rớt dòng nếu màn hình quá hẹp */
      }}>
        {templates.map((tpl) => (
          <div 
            key={tpl.id}
            onClick={() => handleSelectTemplate(tpl.id)}
            style={{ 
              height: '45vh', /* Chiều cao cố định theo tỉ lệ màn hình */
              aspectRatio: '2/3', /* Tự động tính ra bề ngang, luôn giữ dáng dọc */
              backgroundColor: tpl.color, 
              borderRadius: '2vh', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              color: '#333', 
              fontSize: '3vh', 
              fontWeight: 'bold',
              boxShadow: '0 1vh 2vh rgba(0,0,0,0.2)',
              transition: 'transform 0.2s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {tpl.name}
          </div>
        ))}
      </div>
      
      <button className="start-btn" onClick={() => navigate('/')} style={{ marginTop: '60px', backgroundColor: '#555' }}>
        QUAY LẠI
      </button>
    </div>
  );
}

export default TemplateSelect;