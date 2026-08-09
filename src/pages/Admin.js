import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Admin() {
  const navigate = useNavigate();
  
  // Trạng thái lưu cài đặt
  const [settings, setSettings] = useState({ countdown_capture: 3, review_timeout: 20 });
  const [saveStatus, setSaveStatus] = useState('');

  // Trạng thái lưu khung ảnh
  const [templates, setTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');

  // Tự động tải dữ liệu khi mở trang Admin
  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/settings')
      .then(res => res.json())
      .then(data => setSettings(data))
      .catch(err => console.error("Lỗi tải cài đặt:", err));

    fetch('http://127.0.0.1:8000/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(data))
      .catch(err => console.error("Lỗi tải khung ảnh:", err));
  }, []);

  // Hàm lưu cài đặt
  const handleSaveSettings = () => {
    fetch('http://127.0.0.1:8000/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    })
    .then(() => {
      setSaveStatus('Đã lưu thành công!');
      setTimeout(() => setSaveStatus(''), 3000);
    });
  };

  // Hàm Upload Khung mới
  const handleUploadTemplate = (e) => {
    e.preventDefault();
    if (!selectedFile || !newTemplateName) {
      setUploadStatus('Vui lòng nhập tên và chọn file ảnh!');
      return;
    }

    const formData = new FormData();
    formData.append('name', newTemplateName);
    formData.append('file', selectedFile);

    setUploadStatus('Đang tải lên...');

    fetch('http://127.0.0.1:8000/api/templates/upload', {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'success') {
        setTemplates([...templates, data.template]); // Cập nhật danh sách hiển thị
        setUploadStatus('Tải lên thành công!');
        setNewTemplateName('');
        setSelectedFile(null);
        setTimeout(() => setUploadStatus(''), 3000);
      }
    })
    .catch(() => setUploadStatus('Lỗi khi tải lên!'));
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: '#333' }}>⚙️ TRANG QUẢN TRỊ KIOSK</h1>
        <button onClick={() => navigate('/')} style={{ padding: '10px 20px', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          Trở về Kiosk
        </button>
      </div>

      <div style={{ display: 'flex', gap: '40px', marginTop: '30px' }}>
        
        {/* Cột 1: Cài đặt hệ thống */}
        <div style={{ flex: 1, backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h2>Cài đặt Thời gian</h2>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Thời gian đếm ngược (giây/ảnh):</label>
            <input 
              type="number" 
              value={settings.countdown_capture} 
              onChange={(e) => setSettings({...settings, countdown_capture: parseInt(e.target.value)})}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Thời gian chờ quét QR (giây):</label>
            <input 
              type="number" 
              value={settings.review_timeout} 
              onChange={(e) => setSettings({...settings, review_timeout: parseInt(e.target.value)})}
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
          </div>
          <button onClick={handleSaveSettings} style={{ padding: '10px 20px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
            LƯU CÀI ĐẶT
          </button>
          {saveStatus && <p style={{ color: 'green', marginTop: '10px' }}>{saveStatus}</p>}
        </div>

        {/* Cột 2: Quản lý Khung ảnh */}
        <div style={{ flex: 1, backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h2>Thêm Khung ảnh (Template)</h2>
          <form onSubmit={handleUploadTemplate}>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Tên sự kiện / Khung:</label>
              <input 
                type="text" 
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="VD: Đám cưới Duy & Linh"
                style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
              />
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>File ảnh (PNG đục lỗ, 1200x1800px):</label>
              <input 
                type="file" 
                accept="image/png"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                style={{ width: '100%' }}
              />
            </div>
            <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              TẢI LÊN KHUNG MỚI
            </button>
            {uploadStatus && <p style={{ color: uploadStatus.includes('thành công') ? 'green' : 'red', marginTop: '10px' }}>{uploadStatus}</p>}
          </form>

          <h3 style={{ marginTop: '30px' }}>Khung ảnh hiện tại:</h3>
          <ul>
            {templates.map(tpl => (
              <li key={tpl.id} style={{ marginBottom: '10px' }}>
                <strong>{tpl.name}</strong> 
                {tpl.image_url && <span style={{ marginLeft: '10px', color: 'blue', fontSize: '12px' }}>(Đã có ảnh file)</span>}
              </li>
            ))}
          </ul>
        </div>

      </div>
    </div>
  );
}

export default Admin;