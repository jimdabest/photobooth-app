import React, { useState, useEffect, useRef } from "react";

const Admin = () => {
    const [settings, setSettings] = useState({ countdown_capture: 3, review_timeout: 20 });
    const [templates, setTemplates] = useState([]);
    const [uploadName, setUploadName] = useState("");
    const [uploadFile, setUploadFile] = useState(null);
    const [message, setMessage] = useState("");
    
    const [editingTpl, setEditingTpl] = useState(null);

    const previewRef = useRef(null);
    const [activeElement, setActiveElement] = useState({ type: 'slot', index: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragInfo = useRef({ active: false, type: null, index: null, offsetX: 0, offsetY: 0 });

    useEffect(() => {
        document.body.style.overflow = "auto";
        fetchSettings();
        fetchTemplates();
        return () => { document.body.style.overflow = "hidden"; };
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetch("http://127.0.0.1:8000/api/settings");
            setSettings(await res.json());
        } catch (err) {
            console.error("Lỗi lấy cài đặt:", err);
        }
    };

    const fetchTemplates = async () => {
        try {
            const res = await fetch("http://127.0.0.1:8000/api/templates");
            setTemplates(await res.json());
        } catch (err) {
            console.error("Lỗi lấy danh sách khung:", err);
        }
    };

    const handleSelectTemplate = (tpl) => {
        const safeTpl = {
            ...tpl,
            orientation: tpl.orientation || "portrait",
            canvas_size: tpl.canvas_size || { width: 1080, height: 1920 },
            num_poses: tpl.num_poses || (tpl.slots ? tpl.slots.length : 3),
            slots: tpl.slots || [
                { pose_index: 1, x: 50, y: 50, width: 980, height: 550, rotation: 0 },
                { pose_index: 2, x: 50, y: 620, width: 980, height: 550, rotation: 0 }
            ],
            qr_config: tpl.qr_config || { print_on_photo: true, x: 50, y: 1750, size: 150 },
            // THÊM CẤU HÌNH POSE GUIDE
            guide_config: tpl.guide_config || { enabled: false, opacity: 0.4 } 
        };
        setEditingTpl(safeTpl);
        setActiveElement({ type: 'slot', index: 0 });
    };

    const handlePointerDown = (e, type, index = null) => {
        e.stopPropagation();
        if (!previewRef.current || !editingTpl) return;
        const rect = previewRef.current.getBoundingClientRect();
        const scaleX = editingTpl.canvas_size.width / rect.width;
        const scaleY = editingTpl.canvas_size.height / rect.height;
        const clickX = (e.clientX - rect.left) * scaleX;
        const clickY = (e.clientY - rect.top) * scaleY;
        let objX = type === 'slot' ? editingTpl.slots[index].x : editingTpl.qr_config.x;
        let objY = type === 'slot' ? editingTpl.slots[index].y : editingTpl.qr_config.y;

        dragInfo.current = { active: true, type, index, offsetX: clickX - objX, offsetY: clickY - objY };
        setActiveElement({ type, index });
        setIsDragging(true);
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!dragInfo.current.active || !previewRef.current || !editingTpl) return;
        const rect = previewRef.current.getBoundingClientRect();
        const scaleX = editingTpl.canvas_size.width / rect.width;
        const scaleY = editingTpl.canvas_size.height / rect.height;
        const currentClickX = (e.clientX - rect.left) * scaleX;
        const currentClickY = (e.clientY - rect.top) * scaleY;
        const newX = Math.max(0, Math.round(currentClickX - dragInfo.current.offsetX));
        const newY = Math.max(0, Math.round(currentClickY - dragInfo.current.offsetY));

        if (dragInfo.current.type === 'slot') {
            const newSlots = [...editingTpl.slots];
            newSlots[dragInfo.current.index].x = newX;
            newSlots[dragInfo.current.index].y = newY;
            setEditingTpl({ ...editingTpl, slots: newSlots });
        } else if (dragInfo.current.type === 'qr') {
            setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, x: newX, y: newY } });
        }
    };

    const handlePointerUp = (e) => {
        if (dragInfo.current.active) {
            dragInfo.current.active = false;
            setIsDragging(false);
            e.target.releasePointerCapture(e.pointerId);
        }
    };

    const handleSaveSettings = async () => {
        const res = await fetch("http://127.0.0.1:8000/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings)
        });
        if (res.ok) showMessage("✅ Lưu cài đặt thời gian thành công!");
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadName) return;
        const formData = new FormData();
        formData.append("name", uploadName);
        formData.append("file", uploadFile);

        const res = await fetch("http://127.0.0.1:8000/api/templates/upload", { method: "POST", body: formData });
        if (res.ok) {
            showMessage("✅ Upload khung ảnh mới thành công!");
            setUploadName("");
            setUploadFile(null);
            document.getElementById("file-input").value = "";
            fetchTemplates();
        }
    };

    const handleNumPosesChange = (newCount) => {
        const count = Math.max(1, parseInt(newCount) || 1);
        let newSlots = [...editingTpl.slots];
        if (count > newSlots.length) {
            for (let i = newSlots.length; i < count; i++) {
                newSlots.push({ pose_index: i + 1, x: 50, y: 50 + i * 200, width: 400, height: 300, rotation: 0 });
            }
        } else if (count < newSlots.length) {
            newSlots = newSlots.slice(0, count);
        }
        setEditingTpl({ ...editingTpl, num_poses: count, slots: newSlots });
    };

    const handleAddSlot = () => {
        const newSlots = [...editingTpl.slots, { pose_index: editingTpl.slots.length + 1, x: 50, y: 50, width: 400, height: 300, rotation: 0 }];
        setEditingTpl({ ...editingTpl, num_poses: newSlots.length, slots: newSlots });
    };

    const handleRemoveSlot = (indexToRemove) => {
        if (editingTpl.slots.length <= 1) return alert("Khung ảnh cần ít nhất 1 ô ảnh chụp!");
        const newSlots = editingTpl.slots.filter((_, idx) => idx !== indexToRemove).map((slot, idx) => ({ ...slot, pose_index: idx + 1 }));
        setEditingTpl({ ...editingTpl, num_poses: newSlots.length, slots: newSlots });
    };

    const handleSaveTemplateConfig = async () => {
        const res = await fetch(`http://127.0.0.1:8000/api/templates/${editingTpl.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(editingTpl)
        });
        if (res.ok) {
            showMessage("✅ Lưu cấu hình khung thành công!");
            fetchTemplates();
        }
    };

    const handleDeleteTemplate = async (tplId) => {
        if (!window.confirm("⚠️ Bạn có chắc chắn muốn xóa khung ảnh này không?")) return;
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/templates/${tplId}`, { method: "DELETE" });
            if (res.ok) {
                showMessage("✅ Đã xóa khung ảnh thành công!");
                setEditingTpl(null);
                fetchTemplates();
            }
        } catch (err) {
            showMessage("❌ Lỗi khi xóa khung ảnh!");
        }
    };

    const showMessage = (msg) => {
        setMessage(msg);
        setTimeout(() => setMessage(""), 3000);
    };

    return (
        <div style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "1300px", margin: "0 auto", height: "100vh", overflowY: "auto", boxSizing: "border-box" }}>
            <h1>⚙️ Quản Trị Hệ Thống Kiosk</h1>
            {message && <div style={{ padding: "10px", backgroundColor: "#d4edda", color: "#155724", marginBottom: "20px", borderRadius: "5px", fontWeight: "bold" }}>{message}</div>}

            <div style={{ display: "flex", gap: "20px" }}>
                <div style={{ flex: 1 }}>
                    <div style={{ backgroundColor: "#f8f9fa", padding: "20px", borderRadius: "8px", marginBottom: "20px" }}>
                        <h2>⏱ Cài đặt Thời gian</h2>
                        <label style={{ fontSize: "13px", fontWeight: "bold" }}>Thời gian đếm ngược (giây):</label>
                        <input type="number" value={settings.countdown_capture} onChange={(e) => setSettings({...settings, countdown_capture: parseInt(e.target.value) || 3})} style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box" }}/>
                        <label style={{ fontSize: "13px", fontWeight: "bold" }}>Thời gian chờ mã QR (giây):</label>
                        <input type="number" value={settings.review_timeout} onChange={(e) => setSettings({...settings, review_timeout: parseInt(e.target.value) || 20})} style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box" }}/>
                        <button onClick={handleSaveSettings} style={{ padding: "10px", backgroundColor: "#007bff", color: "white", border: "none", width: "100%", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Lưu Thời Gian</button>
                    </div>

                    <div style={{ backgroundColor: "#f8f9fa", padding: "20px", borderRadius: "8px" }}>
                        <h2>🖼 Upload Khung Mới</h2>
                        <form onSubmit={handleUpload}>
                            <input type="text" placeholder="Tên khung" value={uploadName} onChange={(e) => setUploadName(e.target.value)} style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box" }}/>
                            <input id="file-input" type="file" accept="image/png, image/jpeg" onChange={(e) => setUploadFile(e.target.files[0])} style={{ display: "block", marginBottom: "10px" }}/>
                            <button type="submit" style={{ padding: "10px", backgroundColor: "#28a745", color: "white", border: "none", width: "100%", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Upload Khung</button>
                        </form>

                        <h3 style={{ marginTop: "20px" }}>Danh sách Khung Hiện Có</h3>
                        {templates.map(tpl => (
                            <div key={tpl.id} onClick={() => handleSelectTemplate(tpl)} style={{ border: editingTpl?.id === tpl.id ? "2px solid #007bff" : "1px solid #ccc", padding: "10px", marginBottom: "10px", cursor: "pointer", backgroundColor: editingTpl?.id === tpl.id ? "#e7f1ff" : "white", borderRadius: "5px" }}>
                                <b>{tpl.name}</b> <br/>
                                <span style={{ fontSize: "12px", color: "#666" }}>{tpl.orientation || "portrait"} • {tpl.num_poses || (tpl.slots?.length || 3)} kiểu chụp</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ flex: 2, backgroundColor: "#f8f9fa", padding: "20px", borderRadius: "8px" }}>
                    <h2>📐 Tùy Chỉnh Cấu Hình Khung</h2>
                    {!editingTpl ? (
                        <p style={{ color: "#777" }}>👈 Hãy bấm chọn một khung ảnh ở danh sách bên trái để bắt đầu cấu hình.</p>
                    ) : (
                        <div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "15px" }}>
                                <div>
                                    <label style={{ fontSize: "12px", fontWeight: "bold" }}>Định hướng khung:</label>
                                    <select value={editingTpl.orientation} onChange={(e) => setEditingTpl({...editingTpl, orientation: e.target.value})} style={{ width: "100%", padding: "8px" }}>
                                        <option value="portrait">Khung Dọc (Portrait)</option>
                                        <option value="landscape">Khung Ngang (Landscape)</option>
                                    </select>
                                </div>
                                <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "red" }}>Size Gốc (W):</label><input type="number" readOnly value={editingTpl.canvas_size.width} style={{ width: "100%", padding: "8px", boxSizing: "border-box", backgroundColor: "#e9ecef" }} /></div>
                                <div><label style={{ fontSize: "12px", fontWeight: "bold", color: "red" }}>Size Gốc (H):</label><input type="number" readOnly value={editingTpl.canvas_size.height} style={{ width: "100%", padding: "8px", boxSizing: "border-box", backgroundColor: "#e9ecef" }} /></div>
                            </div>

                            {/* TÍNH NĂNG MỚI: BẬT TẮT HƯỚNG DẪN TẠO DÁNG */}
                            <div style={{ backgroundColor: "#e0e7ff", padding: "12px", borderRadius: "6px", marginBottom: "15px", border: "1px solid #c7d2fe" }}>
                                <h3 style={{ margin: "0 0 10px 0", color: "#4338ca", fontSize: "16px" }}>🎭 Hướng Dẫn Tạo Dáng (Pose Guide)</h3>
                                <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold", cursor: "pointer" }}>
                                        <input type="checkbox" 
                                            checked={editingTpl.guide_config?.enabled || false} 
                                            onChange={(e) => setEditingTpl({...editingTpl, guide_config: {...editingTpl.guide_config, enabled: e.target.checked}})} 
                                            style={{ width: "18px", height: "18px" }} />
                                        Hiện ảnh mẫu lên màn hình soi gương
                                    </label>
                                    {editingTpl.guide_config?.enabled && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                            <span style={{ fontSize: "13px", fontWeight: "bold" }}>Độ mờ:</span>
                                            <input type="range" min="0.1" max="1" step="0.1" 
                                                value={editingTpl.guide_config.opacity} 
                                                onChange={(e) => setEditingTpl({...editingTpl, guide_config: {...editingTpl.guide_config, opacity: parseFloat(e.target.value)}})} 
                                                style={{ flex: 1 }} />
                                            <span style={{ fontWeight: "bold", color: "#d97706" }}>{Math.round(editingTpl.guide_config.opacity * 100)}%</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ backgroundColor: "#e9ecef", padding: "12px", borderRadius: "6px", marginBottom: "15px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div>
                                    <label style={{ fontWeight: "bold", marginRight: "10px" }}>📸 Số lượng ảnh chụp:</label>
                                    <input type="number" min="1" max="8" value={editingTpl.num_poses || editingTpl.slots.length} onChange={(e) => handleNumPosesChange(e.target.value)} style={{ width: "60px", padding: "6px", fontSize: "16px", fontWeight: "bold", textAlign: "center" }} />
                                </div>
                                <button onClick={handleAddSlot} style={{ padding: "6px 12px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>+ Thêm 1 Ô Ảnh</button>
                            </div>

                            <h3>Tọa độ các ô ảnh (Slots)</h3>
                            <div style={{ maxHeight: "250px", overflowY: "auto", marginBottom: "15px", border: "1px solid #ddd", padding: "10px", borderRadius: "5px", backgroundColor: "white" }}>
                                {editingTpl.slots.map((slot, idx) => (
                                    <div key={idx} onClick={() => setActiveElement({ type: 'slot', index: idx })}
                                        style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "center", backgroundColor: activeElement.type === 'slot' && activeElement.index === idx ? "#e0f2fe" : "transparent", border: activeElement.type === 'slot' && activeElement.index === idx ? "2px solid #38bdf8" : "2px solid transparent", padding: "8px", borderRadius: "8px", cursor: "pointer" }}>
                                        <b style={{ minWidth: "60px", color: "#007bff" }}>Ảnh {idx + 1}:</b>
                                        <span>X:</span><input type="number" style={{width: 55, padding: "4px"}} value={slot.x} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].x = parseInt(e.target.value) || 0; setEditingTpl({...editingTpl, slots: newSlots}); }} />
                                        <span>Y:</span><input type="number" style={{width: 55, padding: "4px"}} value={slot.y} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].y = parseInt(e.target.value) || 0; setEditingTpl({...editingTpl, slots: newSlots}); }} />
                                        <span>W:</span><input type="number" style={{width: 55, padding: "4px"}} value={slot.width} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].width = parseInt(e.target.value) || 0; setEditingTpl({...editingTpl, slots: newSlots}); }} />
                                        <span>H:</span><input type="number" style={{width: 55, padding: "4px"}} value={slot.height} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].height = parseInt(e.target.value) || 0; setEditingTpl({...editingTpl, slots: newSlots}); }} />
                                        
                                        {/* NÚT XÓA ĐÃ ĐƯỢC THÊM LẠI VÀO ĐÂY */}
                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveSlot(idx); }} style={{ marginLeft: "auto", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: "3px", padding: "4px 8px", cursor: "pointer", fontSize: "11px" }}>🗑 Xóa</button>
                                    </div>
                                ))}
                            </div>

                            <h3>Cấu hình in Mã QR lên ảnh</h3>
                            <div onClick={() => setActiveElement({ type: 'qr' })} style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "15px", backgroundColor: activeElement.type === 'qr' ? "#e0f2fe" : "white", padding: "12px", borderRadius: "8px", border: activeElement.type === 'qr' ? "2px solid #38bdf8" : "2px solid #ddd", cursor: "pointer" }}>
                                <label style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: "bold", cursor: "pointer" }}>
                                    <input type="checkbox" checked={editingTpl.qr_config.print_on_photo} onChange={(e) => setEditingTpl({...editingTpl, qr_config: {...editingTpl.qr_config, print_on_photo: e.target.checked}})} /> In QR lên ảnh
                                </label>
                                {editingTpl.qr_config.print_on_photo && (
                                    <>
                                        <span>X:</span><input type="number" style={{width: 55, padding: "4px"}} value={editingTpl.qr_config.x} onChange={(e) => setEditingTpl({...editingTpl, qr_config: {...editingTpl.qr_config, x: parseInt(e.target.value) || 0}})} />
                                        <span>Y:</span><input type="number" style={{width: 55, padding: "4px"}} value={editingTpl.qr_config.y} onChange={(e) => setEditingTpl({...editingTpl, qr_config: {...editingTpl.qr_config, y: parseInt(e.target.value) || 0}})} />
                                        <span>Size:</span><input type="number" style={{width: 55, padding: "4px"}} value={editingTpl.qr_config.size} onChange={(e) => setEditingTpl({...editingTpl, qr_config: {...editingTpl.qr_config, size: parseInt(e.target.value) || 100}})} />
                                    </>
                                )}
                            </div>

                            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                                <button onClick={handleSaveTemplateConfig} style={{ flex: 1, padding: "12px", backgroundColor: "#ff9800", color: "white", border: "none", fontWeight: "bold", borderRadius: "5px", cursor: "pointer", fontSize: "16px" }}>💾 Lưu Cấu Hình Khung Này</button>
                                <button onClick={() => handleDeleteTemplate(editingTpl.id)} style={{ padding: "12px 20px", backgroundColor: "#dc3545", color: "white", border: "none", fontWeight: "bold", borderRadius: "5px", cursor: "pointer", fontSize: "16px" }}>🗑 Xóa Khung</button>
                            </div>

                            <h3 style={{ textAlign: "center" }}>Bản Xem Trước Trực Quan</h3>
                            <div ref={previewRef} style={{ position: "relative", border: "4px solid #334155", margin: "0 auto", maxWidth: "100%", height: editingTpl.canvas_size.width >= editingTpl.canvas_size.height ? "auto" : "65vh", maxHeight: editingTpl.canvas_size.width >= editingTpl.canvas_size.height ? "none" : "600px", touchAction: "none", aspectRatio: `${editingTpl.canvas_size.width} / ${editingTpl.canvas_size.height}`, backgroundColor: "#ddd", backgroundImage: `url(${editingTpl.image_url})`, backgroundSize: "100% 100%", overflow: "hidden", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
                                {editingTpl.slots.map((slot, idx) => {
                                    const scaleX = 100 / editingTpl.canvas_size.width;
                                    const scaleY = 100 / editingTpl.canvas_size.height;
                                    const isActive = activeElement.type === 'slot' && activeElement.index === idx;
                                    return (
                                        <div key={idx} onPointerDown={(e) => handlePointerDown(e, 'slot', idx)} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                                            style={{ position: "absolute", left: `${slot.x * scaleX}%`, top: `${slot.y * scaleY}%`, width: `${slot.width * scaleX}%`, height: `${slot.height * scaleY}%`, backgroundColor: isActive ? "rgba(56, 189, 248, 0.65)" : "rgba(0, 123, 255, 0.45)", border: isActive ? "3px solid #0284c7" : "2px dashed #0056b3", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", zIndex: isActive ? 5 : 1, cursor: isDragging && isActive ? "grabbing" : "grab", boxShadow: isActive ? "0 0 15px rgba(2, 132, 199, 0.6)" : "none" }}>
                                            Ảnh {idx + 1}
                                        </div>
                                    );
                                })}
                                {editingTpl.qr_config.print_on_photo && (
                                    <div onPointerDown={(e) => handlePointerDown(e, 'qr')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                                        style={{ position: "absolute", left: `${editingTpl.qr_config.x * (100 / editingTpl.canvas_size.width)}%`, top: `${editingTpl.qr_config.y * (100 / editingTpl.canvas_size.height)}%`, width: `${editingTpl.qr_config.size * (100 / editingTpl.canvas_size.width)}%`, height: `${editingTpl.qr_config.size * (100 / editingTpl.canvas_size.height)}%`, backgroundColor: activeElement.type === 'qr' ? "rgba(220, 38, 38, 0.85)" : "rgba(0, 0, 0, 0.75)", border: activeElement.type === 'qr' ? "3px solid #ef4444" : "2px dashed #fff", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "13px", fontWeight: "bold", zIndex: activeElement.type === 'qr' ? 6 : 2, cursor: isDragging && activeElement.type === 'qr' ? "grabbing" : "grab", boxShadow: activeElement.type === 'qr' ? "0 0 15px rgba(239, 68, 68, 0.6)" : "none" }}>
                                        QR Code
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Admin;