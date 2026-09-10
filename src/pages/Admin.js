import React, { useState, useEffect, useRef } from "react";

const Admin = () => {
    const [settings, setSettings] = useState({ countdown_capture: 3, review_timeout: 20 });
    const [templates, setTemplates] = useState([]);
    const [uploadName, setUploadName] = useState("");
    const [uploadFile, setUploadFile] = useState(null);
    const [message, setMessage] = useState("");

    const [editingTpl, setEditingTpl] = useState(null);
    const [bgFile, setBgFile] = useState(null);

    const previewRef = useRef(null);
    const [activeElement, setActiveElement] = useState({ type: 'slot', index: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragInfo = useRef({ active: false, type: null, index: null, offsetX: 0, offsetY: 0 });

    useEffect(() => {
        document.title = "Admin | Simplex";
        return () => {
            document.title = "Photo Booth | Simplex Team";
        };
    }, []);

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
        if (res.ok) showMessage("Lưu cài đặt thành công!");
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadName) return;
        const formData = new FormData();
        formData.append("name", uploadName);
        formData.append("file", uploadFile);

        const res = await fetch("http://127.0.0.1:8000/api/templates/upload", { method: "POST", body: formData });
        if (res.ok) {
            showMessage("Upload khung ảnh mới thành công!");
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
            showMessage("Lưu cấu hình khung thành công!");
            fetchTemplates();
        }
    };

    const handleDeleteTemplate = async (tplId) => {
        if (!window.confirm("Bạn có chắc chắn muốn xóa khung ảnh này không?")) return;
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/templates/${tplId}`, { method: "DELETE" });
            if (res.ok) {
                showMessage("Đã xóa khung ảnh thành công!");
                setEditingTpl(null);
                fetchTemplates();
            }
        } catch (err) {
            showMessage("Lỗi khi xóa khung ảnh!");
        }
    };

    const handleUploadBackground = async () => {
        if (!bgFile) return showMessage("Vui lòng chọn file ảnh nền!");
        const formData = new FormData();
        formData.append("file", bgFile);
        try {
            const res = await fetch("http://127.0.0.1:8000/api/upload-background", { method: "POST", body: formData });
            if (res.ok) {
                const data = await res.json();
                const updatedSettings = { ...settings, bg_url: data.url };
                setSettings(updatedSettings);
                await fetch("http://127.0.0.1:8000/api/settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(updatedSettings)
                });
                showMessage("Cập nhật hình nền Brand thành công!");
                setBgFile(null);
                document.getElementById("bg-input").value = "";
            }
        } catch (err) {
            showMessage("Lỗi khi upload hình nền!");
        }
    };

    const handleRemoveBackground = async () => {
        const updatedSettings = { ...settings, bg_url: "" };
        setSettings(updatedSettings);
        await fetch("http://127.0.0.1:8000/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updatedSettings)
        });
        showMessage("Đã xóa hình nền, giao diện quay về mặc định!");
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadFile(file);
        const fileNameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        setUploadName(fileNameWithoutExt);
    };

    const showMessage = (msg) => {
        setMessage(msg);
        setTimeout(() => setMessage(""), 3000);
    };

    return (
        <div style={{ padding: "30px", fontFamily: "sans-serif", maxWidth: "100%", height: "100vh", overflowY: "auto", boxSizing: "border-box" }}>
            <h1>Quản Trị Hệ Thống PhotoBooth</h1>
            {message && <div style={{ padding: "10px", backgroundColor: "#d4edda", color: "#155724", marginBottom: "20px", borderRadius: "5px", fontWeight: "bold" }}>{message}</div>}

            <div style={{ display: "flex", gap: "30px", alignItems: "flex-start" }}>

                {/* ========== CỘT 1: CHUNG VÀ DANH SÁCH KHUNG (25%) ========== */}
                <div style={{ flex: "0 0 25%", minWidth: "300px" }}>

                    {/* KHỐI CÀI ĐẶT THỜI GIAN & HÌNH NỀN */}
                    <div style={{ backgroundColor: "#f8f9fa", padding: "15px", borderRadius: "8px", marginBottom: "20px" }}>
                        <h2 style={{ fontSize: "18px", marginBottom: "15px" }}>Cài đặt chung</h2>

                        <div style={{ backgroundColor: "#e2e8f0", padding: "15px", borderRadius: "8px", marginBottom: "15px", border: "1px dashed #64748b" }}>
                            <label style={{ fontSize: "13px", fontWeight: "bold" }}>Upload hình nền App:</label>
                            <input id="bg-input" type="file" accept="image/png, image/jpeg" onChange={(e) => setBgFile(e.target.files[0])} style={{ display: "block", marginBottom: "10px", width: "100%" }} />
                            <div style={{ display: "flex", gap: "10px" }}>
                                <button onClick={handleUploadBackground} style={{ flex: 1, padding: "8px", backgroundColor: "#0284c7", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Lưu Nền</button>
                                {settings.bg_url && <button onClick={handleRemoveBackground} style={{ padding: "8px", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Xóa Nền</button>}
                            </div>
                        </div>

                        <label style={{ fontSize: "13px", fontWeight: "bold" }}>Đếm ngược (giây):</label>
                        <input
                            type="number"
                            value={settings.countdown_capture}
                            onChange={(e) => {
                                const val = e.target.value;
                                // Cho phép để trống (string) hoặc chuyển thành số nếu có dữ liệu
                                setSettings({ ...settings, countdown_capture: val === "" ? "" : parseInt(val) });
                            }}
                            style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box" }}
                        />                        <label style={{ fontSize: "13px", fontWeight: "bold" }}>Chờ mã QR (giây):</label>
                        <input
                            type="number"
                            value={settings.review_timeout}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSettings({ ...settings, review_timeout: val === "" ? "" : parseInt(val) });
                            }}
                            style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box" }}
                        />                        <button onClick={handleSaveSettings} style={{ padding: "10px", backgroundColor: "#007bff", color: "white", border: "none", width: "100%", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Lưu Cài Đặt</button>
                    </div>

                    {/* KHỐI UPLOAD & DANH SÁCH KHUNG */}
                    <div style={{ backgroundColor: "#f8f9fa", padding: "15px", borderRadius: "8px" }}>
                        <h2 style={{ fontSize: "18px", marginBottom: "10px" }}>Quản lý Khung</h2>
                        <form onSubmit={handleUpload} style={{ marginBottom: "20px" }}>
                            <input type="text" placeholder="Tên khung" value={uploadName} onChange={(e) => setUploadName(e.target.value)} style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box" }} />
                            <input
                                id="file-input"
                                type="file"
                                accept="image/png, image/jpeg"
                                onChange={handleFileChange}
                                style={{ display: "block", marginBottom: "10px" }}
                            />                            <button type="submit" style={{ padding: "10px", backgroundColor: "#28a745", color: "white", border: "none", width: "100%", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>Thêm Khung</button>
                        </form>

                        <div style={{ maxHeight: "400px", overflowY: "auto", pr: "5px" }}>
                            {templates.map(tpl => (
                                <div key={tpl.id} onClick={() => handleSelectTemplate(tpl)} style={{ border: editingTpl?.id === tpl.id ? "2px solid #007bff" : "1px solid #ccc", padding: "10px", marginBottom: "10px", cursor: "pointer", backgroundColor: editingTpl?.id === tpl.id ? "#e7f1ff" : "white", borderRadius: "5px" }}>
                                    <b>{tpl.name}</b> <br />
                                    <span style={{ fontSize: "12px", color: "#666" }}>{tpl.orientation} • {tpl.num_poses || (tpl.slots?.length || 3)} kiểu</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ========== CỘT 2: KHU VỰC CẤU HÌNH CHI TIẾT VÀ PREVIEW (75%) ========== */}
                <div style={{ flex: "1", backgroundColor: "#f8f9fa", padding: "20px", borderRadius: "8px", minHeight: "80vh" }}>
                    <h2>Tùy Chỉnh Khung: {editingTpl ? editingTpl.name : "Chưa chọn"}</h2>

                    {!editingTpl ? (
                        <p style={{ color: "#777", marginTop: "40px", fontSize: "18px" }}>Hãy chọn một khung ảnh bên trái để chỉnh sửa tọa độ.</p>
                    ) : (
                        <div style={{ marginTop: "100px", display: "flex", gap: "20px", height: "calc(100% - 60px)" }}>

                            {/* CỘT 2.1: PREVIEW (Hiển thị to) */}
                            <div style={{ flex: "1.5", display: "flex", flexDirection: "column" }}>
                                <h3 style={{ textAlign: "center", marginTop: 0 }}>Xem Trước (Kéo thả trực tiếp)</h3>

                                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#e2e8f0", borderRadius: "8px", padding: "10px" }}>
                                    <div ref={previewRef} style={{ position: "relative", border: "2px solid #334155", maxHeight: "65vh", touchAction: "none", aspectRatio: `${editingTpl.canvas_size.width} / ${editingTpl.canvas_size.height}`, backgroundColor: "#ddd", backgroundImage: `url(${editingTpl.image_url})`, backgroundSize: "100% 100%", overflow: "hidden", borderRadius: "4px", boxShadow: "0 10px 30px rgba(0,0,0,0.15)", margin: "0 auto", height: editingTpl.orientation === 'portrait' ? '100%' : 'auto', width: editingTpl.orientation === 'landscape' ? '100%' : 'auto' }}>

                                        {/* Render Slots */}
                                        {editingTpl.slots.map((slot, idx) => {
                                            const scaleX = 100 / editingTpl.canvas_size.width;
                                            const scaleY = 100 / editingTpl.canvas_size.height;
                                            const isActive = activeElement.type === 'slot' && activeElement.index === idx;
                                            return (
                                                <div key={idx} onPointerDown={(e) => handlePointerDown(e, 'slot', idx)} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                                                    style={{ position: "absolute", left: `${slot.x * scaleX}%`, top: `${slot.y * scaleY}%`, width: `${slot.width * scaleX}%`, height: `${slot.height * scaleY}%`, backgroundColor: isActive ? "rgba(56, 189, 248, 0.65)" : "rgba(0, 123, 255, 0.45)", border: isActive ? "3px solid #0284c7" : "2px dashed #0056b3", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold", zIndex: isActive ? 5 : 1, cursor: isDragging && isActive ? "grabbing" : "grab" }}>
                                                    Ảnh {idx + 1}
                                                </div>
                                            );
                                        })}

                                        {/* Render QR */}
                                        {editingTpl.qr_config.print_on_photo && (
                                            <div onPointerDown={(e) => handlePointerDown(e, 'qr')} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
                                                style={{ position: "absolute", left: `${editingTpl.qr_config.x * (100 / editingTpl.canvas_size.width)}%`, top: `${editingTpl.qr_config.y * (100 / editingTpl.canvas_size.height)}%`, width: `${editingTpl.qr_config.size * (100 / editingTpl.canvas_size.width)}%`, height: `${editingTpl.qr_config.size * (100 / editingTpl.canvas_size.height)}%`, backgroundColor: activeElement.type === 'qr' ? "rgba(220, 38, 38, 0.85)" : "rgba(0, 0, 0, 0.75)", border: activeElement.type === 'qr' ? "3px solid #ef4444" : "2px dashed #fff", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "11px", fontWeight: "bold", zIndex: activeElement.type === 'qr' ? 6 : 2, cursor: isDragging && activeElement.type === 'qr' ? "grabbing" : "grab" }}>
                                                QR
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* CỘT 2.2: NHẬP SỐ LIỆU (Nằm cạnh Preview) */}
                            <div style={{ flex: "1", display: "flex", flexDirection: "column", gap: "15px", overflowY: "auto", paddingRight: "5px" }}>

                                <div style={{ display: "flex", gap: "10px" }}>
                                    <div style={{ flex: 1 }}><label style={{ fontSize: "12px", fontWeight: "bold" }}>Định hướng:</label><select value={editingTpl.orientation} onChange={(e) => setEditingTpl({ ...editingTpl, orientation: e.target.value })} style={{ width: "100%", padding: "6px" }}><option value="portrait">Dọc</option><option value="landscape">Ngang</option></select></div>
                                    <div style={{ flex: 1 }}><label style={{ fontSize: "12px", fontWeight: "bold", color: "#dc3545" }}>W Gốc:</label><input type="number" readOnly value={editingTpl.canvas_size.width} style={{ width: "100%", padding: "6px", backgroundColor: "#e9ecef" }} /></div>
                                    <div style={{ flex: 1 }}><label style={{ fontSize: "12px", fontWeight: "bold", color: "#dc3545" }}>H Gốc:</label><input type="number" readOnly value={editingTpl.canvas_size.height} style={{ width: "100%", padding: "6px", backgroundColor: "#e9ecef" }} /></div>
                                </div>

                                <div style={{ backgroundColor: "#e0e7ff", padding: "10px", borderRadius: "6px", border: "1px solid #c7d2fe" }}>
                                    <h4 style={{ margin: "0 0 10px 0", color: "#4338ca" }}>Pose Guide</h4>
                                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", cursor: "pointer" }}>
                                        <input type="checkbox" checked={editingTpl.guide_config?.enabled || false} onChange={(e) => setEditingTpl({ ...editingTpl, guide_config: { ...editingTpl.guide_config, enabled: e.target.checked } })} /> Hiện ảnh mẫu
                                    </label>
                                    {editingTpl.guide_config?.enabled && (
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                                            <span style={{ fontSize: "12px" }}>Mờ:</span>
                                            <input type="range" min="0.1" max="1" step="0.1" value={editingTpl.guide_config.opacity} onChange={(e) => setEditingTpl({ ...editingTpl, guide_config: { ...editingTpl.guide_config, opacity: parseFloat(e.target.value) } })} style={{ flex: 1 }} />
                                            <span style={{ fontWeight: "bold", fontSize: "12px", color: "#d97706" }}>{Math.round(editingTpl.guide_config.opacity * 100)}%</span>
                                        </div>
                                    )}
                                </div>

                                <div style={{ backgroundColor: "#e9ecef", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div><label style={{ fontSize: "14px", fontWeight: "bold" }}>📸 Số ảnh:</label> <input type="number" min="1" max="8" value={editingTpl.num_poses || editingTpl.slots.length} onChange={(e) => handleNumPosesChange(e.target.value)} style={{ width: "50px", padding: "4px", textAlign: "center" }} /></div>
                                    <button onClick={handleAddSlot} style={{ padding: "6px", backgroundColor: "#17a2b8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px" }}>+ Thêm Ô</button>
                                </div>

                                <div>
                                    <h4 style={{ margin: "0 0 10px 0" }}>Tọa độ (Slots)</h4>
                                    {editingTpl.slots.map((slot, idx) => (
                                        <div key={idx} onClick={() => setActiveElement({ type: 'slot', index: idx })}
                                            style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px", alignItems: "center", backgroundColor: activeElement.type === 'slot' && activeElement.index === idx ? "#e0f2fe" : "white", border: activeElement.type === 'slot' && activeElement.index === idx ? "2px solid #38bdf8" : "1px solid #ccc", padding: "8px", borderRadius: "6px", cursor: "pointer" }}>
                                            <b style={{ width: "50px", color: "#007bff", fontSize: "13px" }}>Ảnh {idx + 1}:</b>
                                            <span style={{ fontSize: "12px" }}>X:</span><input type="number" style={{ width: "45px", padding: "2px" }} value={slot.x} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].x = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            <span style={{ fontSize: "12px" }}>Y:</span><input type="number" style={{ width: "45px", padding: "2px" }} value={slot.y} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].y = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            <span style={{ fontSize: "12px" }}>W:</span><input type="number" style={{ width: "45px", padding: "2px" }} value={slot.width} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].width = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            <span style={{ fontSize: "12px" }}>H:</span><input type="number" style={{ width: "45px", padding: "2px" }} value={slot.height} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].height = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            <button onClick={(e) => { e.stopPropagation(); handleRemoveSlot(idx); }} style={{ marginLeft: "auto", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: "3px", padding: "4px", cursor: "pointer", fontSize: "11px" }}>Xóa</button>
                                        </div>
                                    ))}
                                </div>

                                <div onClick={() => setActiveElement({ type: 'qr' })} style={{ backgroundColor: activeElement.type === 'qr' ? "#e0f2fe" : "white", padding: "10px", borderRadius: "6px", border: activeElement.type === 'qr' ? "2px solid #38bdf8" : "1px solid #ccc", cursor: "pointer" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: "bold", cursor: "pointer", fontSize: "14px", marginBottom: "8px" }}>
                                        <input type="checkbox" checked={editingTpl.qr_config.print_on_photo} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, print_on_photo: e.target.checked } })} /> In Mã QR
                                    </label>
                                    {editingTpl.qr_config.print_on_photo && (
                                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                            <span style={{ fontSize: "12px" }}>X:</span><input type="number" style={{ width: "45px", padding: "2px" }} value={editingTpl.qr_config.x} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, x: parseInt(e.target.value) || 0 } })} />
                                            <span style={{ fontSize: "12px" }}>Y:</span><input type="number" style={{ width: "45px", padding: "2px" }} value={editingTpl.qr_config.y} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, y: parseInt(e.target.value) || 0 } })} />
                                            <span style={{ fontSize: "12px" }}>Size:</span><input type="number" style={{ width: "45px", padding: "2px" }} value={editingTpl.qr_config.size} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, size: parseInt(e.target.value) || 100 } })} />
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: "flex", gap: "10px", marginTop: "auto" }}>
                                    <button onClick={handleSaveTemplateConfig} style={{ flex: 2, padding: "12px", backgroundColor: "#ff9800", color: "white", border: "none", fontWeight: "bold", borderRadius: "5px", cursor: "pointer" }}>Lưu Khung</button>
                                    <button onClick={() => handleDeleteTemplate(editingTpl.id)} style={{ flex: 1, padding: "12px", backgroundColor: "#dc3545", color: "white", border: "none", fontWeight: "bold", borderRadius: "5px", cursor: "pointer" }}>Xóa</button>
                                </div>
                            </div>

                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Admin;