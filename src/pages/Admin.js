import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const Admin = () => {
    const navigate = useNavigate();
    const [settings, setSettings] = useState({
        countdown_capture: 3,
        review_timeout: 20,
        qr_timeout: 15,
        auto_print: false,
        enable_retake: true,
        enable_review_page: true,
        offline_mode: false,
        save_session_raw_images: false,
        printer_model: 'RX1HS',
        templates: [],
        max_print_copies: 10,
        hot_folder_dir: 'ptb_data/hot_folder',
        bg_url: ""
    });
    const [templates, setTemplates] = useState([]);
    const [uploadName, setUploadName] = useState("");
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadPrintFormat, setUploadPrintFormat] = useState("s4x6");
    const [message, setMessage] = useState("");
    const [savingSettings, setSavingSettings] = useState(false);
    const [offlineQueue, setOfflineQueue] = useState([]);
    const [isLoadingQueue, setIsLoadingQueue] = useState(false);
    const [syncingQueue, setSyncingQueue] = useState(null);
    const saveLock = useRef(false);
    const [draggedTemplateId, setDraggedTemplateId] = useState(null);
    const [dragOverTemplateId, setDragOverTemplateId] = useState(null);
    const [dragInsertPosition, setDragInsertPosition] = useState('before');
    const templatePointerDrag = useRef(null);

    const [editingTpl, setEditingTpl] = useState(null);
    const [bgFile, setBgFile] = useState(null);

    const previewRef = useRef(null);
    const [activeElement, setActiveElement] = useState({ type: 'slot', index: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragInfo = useRef({ active: false, type: null, index: null, offsetX: 0, offsetY: 0 });

    const [showLiveView, setShowLiveView] = useState(false);

    // Ref quản lý timer hiển thị thông báo
    const messageTimerRef = useRef(null);

    // Trạng thái mở/đóng của các nav bên trái
    const [expandedNav, setExpandedNav] = useState({
        settings: false,
        offlineQueue: false,
        camera: true,
        frames: true
    });

    const toggleNav = (navKey) => {
        setExpandedNav({ ...expandedNav, [navKey]: !expandedNav[navKey] });
    };

    const toggleLiveView = async () => {
        try {
            if (!showLiveView) {
                await fetch("http://127.0.0.1:8000/api/camera/live-view/start", { method: "POST" });
                setShowLiveView(true);
            } else {
                await fetch("http://127.0.0.1:8000/api/camera/live-view/stop", { method: "POST" });
                setShowLiveView(false);
            }
        } catch (err) {
            console.error("Lỗi điều khiển camera:", err);
        }
    };

    useEffect(() => {
        return () => {
            if (showLiveView) {
                fetch("http://127.0.0.1:8000/api/camera/live-view/stop", { method: "POST" }).catch(() => { });
            }
        };
    }, [showLiveView]);

    useEffect(() => {
        document.title = "Admin | Simplex";
        return () => {
            document.title = "Photo Booth | Simplex Team";
        };
    }, []);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        let active = true;
        fetch('http://127.0.0.1:8000/api/settings')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (!active) return;
                setSettings(current => ({ ...current, ...data }));
                setTemplates(Array.isArray(data.templates) ? data.templates : []);
            })
            .catch(error => {
                console.error('Lỗi lấy cài đặt:', error);
                if (active) {
                    setMessage('Không thể tải cài đặt máy in');
                    messageTimerRef.current = setTimeout(() => setMessage(''), 3500);
                }
            });
        fetchTemplates();
        setIsLoadingQueue(true);
        fetch('http://127.0.0.1:8000/api/offline-queue')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then(data => {
                if (active) setOfflineQueue(Array.isArray(data.items) ? data.items : []);
            })
            .catch(error => {
                console.error('Lỗi tải Offline Queue:', error);
                if (active) setMessage('Không thể tải Offline Queue');
            })
            .finally(() => { if (active) setIsLoadingQueue(false); });
        return () => {
            active = false;
            document.body.style.overflow = "";
            if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
        };
    }, []);

    const fetchTemplates = async () => {
        try {
            const res = await fetch("http://127.0.0.1:8000/api/templates");
            const data = await res.json();
            const nextTemplates = Array.isArray(data) ? data : [];
            setTemplates(nextTemplates);
            setSettings(current => ({ ...current, templates: nextTemplates }));
        } catch (err) {
            console.error("Lỗi lấy danh sách khung:", err);
        }
    };

    const loadOfflineQueue = async () => {
        setIsLoadingQueue(true);
        try {
            const response = await fetch("http://127.0.0.1:8000/api/offline-queue");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            setOfflineQueue(Array.isArray(data.items) ? data.items : []);
        } catch (error) {
            console.error("Lỗi tải Offline Queue:", error);
            showMessage("Không thể tải Offline Queue");
        } finally {
            setIsLoadingQueue(false);
        }
    };

    const syncOfflineQueue = async (sessionId = null) => {
        setSyncingQueue(sessionId || "all");
        try {
            const response = await fetch("http://127.0.0.1:8000/api/offline-queue/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ session_id: sessionId })
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.detail || `HTTP ${response.status}`);
            }
            const data = await response.json();
            const failed = (data.results || []).filter(item => item.status === "failed");
            const firstError = failed[0]?.error;
            showMessage(failed.length
                ? `Đồng bộ thất bại: ${firstError || `${failed.length} phiên có lỗi`}`
                : "Đồng bộ Offline Queue hoàn tất");
        } catch (error) {
            console.error("Lỗi đồng bộ Offline Queue:", error);
            showMessage(`Không thể đồng bộ: ${error.message}`);
        } finally {
            setSyncingQueue(null);
            await loadOfflineQueue();
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

    const saveSettings = async (nextSettings, successMessage = "Lưu cài đặt thành công!") => {
        if (saveLock.current) throw new Error('Đang lưu cài đặt');
        saveLock.current = true;
        setSavingSettings(true);
        try {
            const res = await fetch("http://127.0.0.1:8000/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(nextSettings)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setSettings(current => ({ ...current, ...(data.settings || nextSettings) }));
            showMessage(successMessage);
        } finally {
            saveLock.current = false;
            setSavingSettings(false);
        }
    };

    const updateSetting = async (key, value) => {
        try {
            await saveSettings({ [key]: value });
        } catch (error) {
            showMessage(`Không thể lưu: ${error.message}`);
        }
    };

    const reorderTemplates = async (sourceId, targetId, placement = 'before') => {
        if (sourceId === targetId || savingSettings) return;
        const source = templates.findIndex(item => item.id === sourceId);
        const target = templates.findIndex(item => item.id === targetId);
        if (source < 0 || target < 0) return;
        const reordered = [...templates];
        const [moved] = reordered.splice(source, 1);
        const targetIndex = reordered.findIndex(item => item.id === targetId);
        reordered.splice(targetIndex + (placement === 'after' ? 1 : 0), 0, moved);
        setTemplates(reordered);
        try {
            await saveSettings({ templates: reordered }, 'Đã lưu thứ tự khung ảnh');
        } catch (error) {
            showMessage(`Không thể sắp xếp: ${error.message}`);
            await fetchTemplates();
        }
    };

    const clearTemplatePointerDrag = () => {
        templatePointerDrag.current = null;
        setDraggedTemplateId(null);
        setDragOverTemplateId(null);
        setDragInsertPosition('before');
    };

    const startTemplatePointerDrag = (event, templateId) => {
        if (savingSettings) return;
        event.preventDefault();
        event.stopPropagation();
        templatePointerDrag.current = {
            pointerId: event.pointerId,
            sourceId: templateId,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
            targetId: null,
            placement: 'before'
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const moveTemplatePointerDrag = (event) => {
        const drag = templatePointerDrag.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
        drag.moved = true;
        setDraggedTemplateId(drag.sourceId);

        const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-template-id]');
        const targetId = targetElement?.dataset.templateId;
        if (!targetId || targetId === drag.sourceId) return;
        const bounds = targetElement.getBoundingClientRect();
        drag.targetId = targetId;
        drag.placement = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
        setDragOverTemplateId(targetId);
        setDragInsertPosition(drag.placement);
    };

    const finishTemplatePointerDrag = (event) => {
        const drag = templatePointerDrag.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        clearTemplatePointerDrag();
        if (drag.moved && drag.targetId) reorderTemplates(drag.sourceId, drag.targetId, drag.placement);
    };

    const handleSaveSettings = async () => {
        try {
            await saveSettings(settings);
        } catch (err) {
            console.error("Lỗi lưu cài đặt:", err);
            showMessage("Không thể lưu cài đặt!");
        }
    };

    const handleAutoPrintToggle = async () => {
        if (saveLock.current) return;
        const previousSettings = settings;
        const updatedSettings = { ...settings, auto_print: !settings.auto_print };
        setSettings(updatedSettings);
        try {
            await saveSettings(updatedSettings, updatedSettings.auto_print ? "Đã bật tự động in 1 bản" : "Đã tắt tự động in");
        } catch (err) {
            console.error("Lỗi đổi Auto-Print:", err);
            setSettings(previousSettings);
            showMessage("Không thể đổi chế độ tự động in!");
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile || !uploadName) return;
        const formData = new FormData();
        formData.append("name", uploadName);
        formData.append("file", uploadFile);
        formData.append("print_format", uploadPrintFormat);

        const res = await fetch("http://127.0.0.1:8000/api/templates/upload", { method: "POST", body: formData });
        if (res.ok) {
            showMessage("Upload khung ảnh mới thành công!");
            setUploadName("");
            setUploadFile(null);
            setUploadPrintFormat("s4x6");
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

    // Ẩn/hiện khung khỏi trang chọn khung của khách
    const handleToggleHidden = async (tpl, e) => {
        e.stopPropagation();

        const updatedTpl = { ...tpl, hidden: !tpl.hidden };

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/templates/${tpl.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedTpl)
            });

            if (res.ok) {
                const data = await res.json();
                setTemplates(previous => previous.map(template => template.id === tpl.id ? data.template : template));
                setSettings(current => ({ ...current, templates: current.templates.map(template => template.id === tpl.id ? data.template : template) }));
                if (editingTpl?.id === tpl.id) {
                    setEditingTpl(data.template);
                }
                showMessage(updatedTpl.hidden ? `Đã ẩn khung "${tpl.name}"!` : `Đã hiện khung "${tpl.name}"!`);
            }
        } catch (err) {
            showMessage("Lỗi khi cập nhật trạng thái khung!");
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
                showMessage("Cập nhật hình nền thành công!");
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
        if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
        messageTimerRef.current = setTimeout(() => setMessage(""), 3000);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#f1f5f9", fontFamily: "sans-serif", margin: 0, padding: 0, boxSizing: "border-box" }}>

            {/* CSS tùy chỉnh ẩn mũi tên tăng giảm của input number */}
            <style>{`
                input[type=number]::-webkit-inner-spin-button, 
                input[type=number]::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                input[type=number] {
                    -moz-appearance: textfield;
                }
            `}</style>

            {message && (
                <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", padding: "12px 24px", backgroundColor: "#d4edda", color: "#155724", borderRadius: "6px", fontWeight: "bold", zIndex: 9999, boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                    {message}
                </div>
            )}

            {/* Header */}
            <div style={{ padding: "15px 20px", backgroundColor: "white", borderBottom: "1px solid #e2e8f0", zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h1 style={{ fontSize: "20px", margin: 0, color: "#0f172a", fontWeight: "bold" }}>Hệ Thống Quản Trị PhotoBooth</h1>
                <button onClick={() => navigate('/')} style={{ padding: "10px 20px", backgroundColor: "#3b82f6", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "14px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>
                    Trở Về Màn Hình Chụp
                </button>
            </div>

            {/* Workspace */}
            <div style={{ display: "flex", flex: 1, overflow: "hidden", padding: "20px", gap: "20px" }}>

                {/* Cột 1: Navigation menu */}
                <div style={{ width: "320px", display: "flex", flexDirection: "column", gap: "15px", overflowY: "auto", paddingRight: "5px" }}>

                    {/* Cài đặt chung */}
                    <div style={{ backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden", flexShrink: 0 }}>
                        <div onClick={() => toggleNav('settings')} style={{ padding: "15px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", backgroundColor: expandedNav.settings ? "#f8fafc" : "white" }}>
                            <h2 style={{ fontSize: "16px", margin: 0, color: "#0f172a" }}>Cài Đặt Chung</h2>
                            <span style={{ fontWeight: "bold", color: "#64748b" }}>{expandedNav.settings ? "-" : "+"}</span>
                        </div>

                        {expandedNav.settings && (
                            <div style={{ padding: "0 15px 15px 15px", borderTop: "1px solid #e2e8f0" }}>
                                <fieldset disabled={savingSettings} style={{ border: 0, padding: '16px 0' }}>
                                    <label htmlFor="printer-model">Tên máy in trong HFP</label>
                                    <input id="printer-model" type="text" value={settings.printer_model}
                                        onChange={event => setSettings(current => ({ ...current, printer_model: event.target.value }))}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: 10, margin: '8px 0' }} />
                                    <button type="button" onClick={() => saveSettings({ printer_model: settings.printer_model }, 'Đã lưu cấu hình máy in')}>Lưu cấu hình máy in</button>
                                    <label htmlFor="hot-folder-dir" style={{ display: 'block', marginTop: 16 }}>Hot Folder</label>
                                    <input id="hot-folder-dir" type="text" value={settings.hot_folder_dir || ''}
                                        onChange={event => setSettings(current => ({ ...current, hot_folder_dir: event.target.value }))}
                                        placeholder="ptb_data/hot_folder"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: 10, margin: '8px 0' }} />
                                    {[['enable_review_page', 'Bật màn hình xem lại'], ['offline_mode', 'Chụp Offline (Không tạo QR)'], ['enable_retake', 'Cho phép chụp lại (Retake)'], ['save_session_raw_images', 'Lưu ảnh gốc của phiên chụp']].map(([key, label]) => (
                                        <label key={key} style={{ display: 'block', marginTop: 16 }}>
                                            <input type="checkbox" checked={Boolean(settings[key])} onChange={event => updateSetting(key, event.target.checked)} /> {label}
                                        </label>
                                    ))}
                                    <p style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.45, color: '#64748b' }}>
                                        Khi bật, ảnh raw được giữ trong thư mục session sau khi ghép ảnh. Khi tắt, ảnh raw được xóa sau khi ghép thành công.
                                    </p>
                                </fieldset>
                                <div style={{ marginTop: "15px", paddingBottom: "15px", borderBottom: "1px solid #e2e8f0" }}>
                                    <label style={{ fontSize: "13px", fontWeight: "bold", color: "#334155", display: "block", marginBottom: "8px" }}>Hình nền App:</label>
                                    <input id="bg-input" type="file" accept="image/png, image/jpeg" onChange={(e) => setBgFile(e.target.files[0])} style={{ width: "100%", fontSize: "12px", marginBottom: "10px" }} />
                                    <div style={{ display: "flex", gap: "10px" }}>
                                        <button onClick={handleUploadBackground} style={{ flex: 1, padding: "8px", backgroundColor: "#0284c7", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>Lưu Nền</button>
                                        {settings.bg_url && <button onClick={handleRemoveBackground} style={{ flex: 1, padding: "8px", backgroundColor: "#dc3545", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>Xóa Nền</button>}
                                    </div>
                                </div>

                                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "15px", marginBottom: "15px" }}>
                                    <div style={{ flex: "1 1 84px", minWidth: 0 }}>
                                        <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Đếm ngược chụp (s):</label>
                                        <input type="number" value={settings.countdown_capture} onChange={(e) => { const val = e.target.value; setSettings({ ...settings, countdown_capture: val === "" ? "" : parseInt(val) }); }} style={{ width: "100%", minWidth: 0, padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                                    </div>
                                    <div style={{ flex: "1 1 84px", minWidth: 0 }}>
                                        <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Thời gian xem lại (s):</label>
                                        <input type="number" value={settings.review_timeout} onChange={(e) => { const val = e.target.value; setSettings({ ...settings, review_timeout: val === "" ? "" : parseInt(val) }); }} style={{ width: "100%", minWidth: 0, padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                                    </div>
                                    <div style={{ flex: "1 1 84px", minWidth: 0 }}>
                                        <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Thời gian quét QR (s):</label>
                                        <input type="number" min="1" value={settings.qr_timeout} onChange={(e) => { const val = e.target.value; setSettings({ ...settings, qr_timeout: val === "" ? "" : parseInt(val) }); }} style={{ width: "100%", minWidth: 0, padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} />
                                    </div>
                                </div>

                                <div style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px solid #e2e8f0" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
                                        <div>
                                            <div style={{ fontSize: "13px", fontWeight: "bold", color: "#334155" }}>In tự động</div>
                                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>In ảnh thành phẩm ngay sau khi chụp</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAutoPrintToggle}
                                            disabled={savingSettings}
                                            role="switch"
                                            aria-checked={Boolean(settings.auto_print)}
                                            aria-label="Bật hoặc tắt tự động in"
                                            style={{ width: "54px", height: "30px", padding: 0, backgroundColor: settings.auto_print ? "#10b981" : "#cbd5e1", border: "none", borderRadius: "15px", position: "relative", cursor: "pointer", transition: "background-color 0.2s", flexShrink: 0 }}
                                        >
                                            <span style={{ width: "24px", height: "24px", backgroundColor: "white", borderRadius: "50%", position: "absolute", top: "3px", left: settings.auto_print ? "27px" : "3px", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
                                        </button>
                                    </div>
                                    <label style={{ fontSize: "12px", color: "#64748b", display: "block", marginBottom: "4px" }}>Số lượng in tối đa:</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={settings.max_print_copies}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            setSettings({ ...settings, max_print_copies: value === "" ? "" : Math.min(10, Math.max(1, parseInt(value, 10) || 1)) });
                                        }}
                                        style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }}
                                    />
                                </div>
                                <button onClick={handleSaveSettings} style={{ width: "100%", padding: "8px", marginTop: "15px", backgroundColor: "#10b981", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}>Lưu Cài Đặt Chung</button>
                            </div>
                        )}
                    </div>

                    <div style={{ backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden", flexShrink: 0 }}>
                        <div onClick={() => toggleNav('offlineQueue')} style={{ padding: "15px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", backgroundColor: expandedNav.offlineQueue ? "#f8fafc" : "white" }}>
                            <div>
                                <h2 style={{ fontSize: "16px", margin: 0, color: "#0f172a" }}>Offline Queue</h2>
                                <span style={{ fontSize: "11px", color: "#64748b" }}>{offlineQueue.filter(item => item.status !== "uploaded").length} phiên chờ đồng bộ</span>
                            </div>
                            <span style={{ fontWeight: "bold", color: "#64748b" }}>{expandedNav.offlineQueue ? "-" : "+"}</span>
                        </div>

                        {expandedNav.offlineQueue && (
                            <div style={{ padding: "15px", borderTop: "1px solid #e2e8f0" }}>
                                <p style={{ margin: "0 0 12px", fontSize: "12px", lineHeight: 1.45, color: "#475569" }}>
                                    Ảnh offline được tải lên đúng thư mục R2 đã gắn với QR của từng phiên. Ảnh local không bị xóa.
                                </p>
                                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                                    <button type="button" onClick={loadOfflineQueue} disabled={isLoadingQueue || syncingQueue !== null} style={{ flex: 1, padding: "9px", border: "1px solid #cbd5e1", backgroundColor: "white", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>
                                        {isLoadingQueue ? "Đang tải..." : "Tải lại"}
                                    </button>
                                    <button type="button" onClick={() => syncOfflineQueue()} disabled={syncingQueue !== null || offlineQueue.length === 0} style={{ flex: 1, padding: "9px", border: "none", backgroundColor: "#2563eb", color: "white", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", fontSize: "12px", opacity: syncingQueue !== null || offlineQueue.length === 0 ? 0.55 : 1 }}>
                                        {syncingQueue === "all" ? "Đang đồng bộ..." : "Đồng bộ tất cả"}
                                    </button>
                                </div>
                                {offlineQueue.length === 0 ? (
                                    <p style={{ margin: 0, textAlign: "center", color: "#64748b", fontSize: "12px" }}>Không có ảnh trong Offline Queue.</p>
                                ) : (
                                    <div style={{ maxHeight: "260px", overflowY: "auto", paddingRight: "4px" }}>
                                        {offlineQueue.map(item => {
                                            const statusColor = item.status === "uploaded" ? "#15803d" : item.status === "failed" || item.status === "invalid" ? "#dc2626" : "#b45309";
                                            const canSync = item.status !== "uploaded";
                                            return <div key={item.session_id} style={{ border: "1px solid #e2e8f0", borderRadius: "6px", padding: "9px", marginBottom: "8px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: "bold", fontSize: "12px", color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.session_id}</div>
                                                        <div style={{ fontSize: "11px", color: statusColor, marginTop: "3px" }}>{item.status} · {item.image_count} ảnh</div>
                                                    </div>
                                                    {canSync && <button type="button" onClick={() => syncOfflineQueue(item.session_id)} disabled={syncingQueue !== null} style={{ padding: "7px 9px", border: "none", borderRadius: "4px", backgroundColor: "#10b981", color: "white", cursor: "pointer", fontSize: "11px", fontWeight: "bold", whiteSpace: "nowrap", opacity: syncingQueue !== null ? 0.55 : 1 }}>
                                                        {syncingQueue === item.session_id ? "Đang tải..." : "Đồng bộ"}
                                                    </button>}
                                                </div>
                                                {item.last_error && <div style={{ color: "#dc2626", fontSize: "11px", marginTop: "6px", wordBreak: "break-word" }}>{item.last_error}</div>}
                                            </div>;
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Canh góc camera */}
                    <div style={{ backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden", flexShrink: 0 }}>
                        <div onClick={() => toggleNav('camera')} style={{ padding: "15px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", backgroundColor: expandedNav.camera ? "#f8fafc" : "white" }}>
                            <h2 style={{ fontSize: "16px", margin: 0, color: "#0f172a" }}>Canh Góc Camera</h2>
                            <span style={{ fontWeight: "bold", color: "#64748b" }}>{expandedNav.camera ? "-" : "+"}</span>
                        </div>

                        {expandedNav.camera && (
                            <div style={{ padding: "15px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: "14px", fontWeight: "bold", color: showLiveView ? "#10b981" : "#64748b" }}>
                                    {showLiveView ? "Đang bật xem trước" : "Đang tắt camera"}
                                </span>

                                <div onClick={toggleLiveView} style={{ width: "50px", height: "26px", backgroundColor: showLiveView ? "#10b981" : "#cbd5e1", borderRadius: "13px", position: "relative", cursor: "pointer", transition: "background-color 0.3s ease" }}>
                                    <div style={{ width: "22px", height: "22px", backgroundColor: "white", borderRadius: "50%", position: "absolute", top: "2px", left: showLiveView ? "26px" : "2px", transition: "left 0.3s ease", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Quản lý khung */}
                    <div style={{ backgroundColor: "white", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", flex: expandedNav.frames ? 1 : "none", minHeight: expandedNav.frames ? "400px" : "auto", flexShrink: 0, overflow: "hidden" }}>
                        <div onClick={() => toggleNav('frames')} style={{ padding: "15px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", backgroundColor: expandedNav.frames ? "#f8fafc" : "white" }}>
                            <h2 style={{ fontSize: "16px", margin: 0, color: "#0f172a" }}>Quản Lý Khung Ảnh</h2>
                            <span style={{ fontWeight: "bold", color: "#64748b" }}>{expandedNav.frames ? "-" : "+"}</span>
                        </div>

                        {expandedNav.frames && (
                            <div style={{ padding: "0 15px 15px 15px", borderTop: "1px solid #e2e8f0", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                                <form onSubmit={handleUpload} style={{ marginTop: "15px", marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px solid #e2e8f0" }}>
                                    <input type="text" placeholder="Tên khung" value={uploadName} onChange={(e) => setUploadName(e.target.value)} style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box", borderRadius: "4px", border: "1px solid #cbd5e1", minWidth: 0 }} />
                                    <select value={uploadPrintFormat} onChange={(event) => setUploadPrintFormat(event.target.value)} style={{ width: "100%", padding: "8px", marginBottom: "10px", boxSizing: "border-box", borderRadius: "4px", border: "1px solid #cbd5e1" }}>
                                        <option value="s4x6">s4x6 (4x6)</option>
                                        <option value="s6x2_2">s6x2_2 (hai dải 2x6 giống nhau)</option>
                                    </select>
                                    <input id="file-input" type="file" accept="image/png, image/jpeg" onChange={handleFileChange} style={{ display: "block", marginBottom: "10px", fontSize: "13px", minWidth: 0, width: "100%" }} />
                                    <button type="submit" style={{ padding: "8px", backgroundColor: "#0284c7", color: "white", border: "none", width: "100%", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "13px" }}>Thêm Khung Mới</button>
                                </form>

                                <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#64748b" }}>Kéo tay nắm ở bên phải. Vạch xanh cho biết frame sẽ được chèn vào vị trí nào.</p>
                                <div style={{ overflowY: "auto", flex: 1, paddingRight: "5px" }}>
                                    {templates.map(tpl => (
                                        <div
                                            key={tpl.id}
                                            data-template-id={tpl.id}
                                            onClick={() => { handleSelectTemplate(tpl); setShowLiveView(false); }}
                                            style={{
                                                border: editingTpl?.id === tpl.id ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                                                padding: "10px",
                                                marginBottom: "10px",
                                                cursor: "pointer",
                                                backgroundColor: editingTpl?.id === tpl.id ? "#eff6ff" : "white",
                                                borderRadius: "6px",
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                gap: "8px",
                                                opacity: draggedTemplateId === tpl.id ? 0.45 : (tpl.hidden ? 0.55 : 1),
                                                boxShadow: dragOverTemplateId === tpl.id && draggedTemplateId !== tpl.id
                                                    ? dragInsertPosition === 'before' ? "0 -4px 0 #10b981" : "0 4px 0 #10b981" : "none",
                                                transition: "border-color 0.15s, box-shadow 0.15s, opacity 0.15s"
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <b style={{
                                                    color: "#0f172a",
                                                    fontSize: "14px",
                                                    display: "block",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap"
                                                }}>
                                                    {tpl.name}
                                                    {tpl.hidden && (
                                                        <span style={{
                                                            marginLeft: "6px",
                                                            fontSize: "10px",
                                                            padding: "2px 6px",
                                                            backgroundColor: "#fef3c7",
                                                            color: "#92400e",
                                                            borderRadius: "4px",
                                                            fontWeight: "bold",
                                                            verticalAlign: "middle"
                                                        }}>
                                                            ĐANG ẨN
                                                        </span>
                                                    )}
                                                </b>
                                                <span style={{ fontSize: "12px", color: "#64748b" }}>
                                                    {tpl.print_format} | {tpl.orientation || 'chưa đặt hướng'} | {tpl.num_poses || (tpl.slots?.length || 3)} kiểu
                                                </span>
                                            </div>

                                            <button
                                                onClick={(e) => handleToggleHidden(tpl, e)}
                                                title={tpl.hidden ? "Hiện khung này trên trang chọn khung" : "Ẩn khung này khỏi trang chọn khung"}
                                                style={{
                                                    padding: "6px 8px",
                                                    backgroundColor: tpl.hidden ? "#f59e0b" : "#f1f5f9",
                                                    color: tpl.hidden ? "white" : "#475569",
                                                    border: "1px solid " + (tpl.hidden ? "#d97706" : "#cbd5e1"),
                                                    borderRadius: "5px",
                                                    cursor: "pointer",
                                                    fontSize: "14px",
                                                    lineHeight: 1,
                                                    flexShrink: 0,
                                                    transition: "all 0.15s"
                                                }}
                                            >
                                                {tpl.hidden ? "Hiện" : "Ẩn"}
                                            </button>
                                            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }} onClick={event => event.stopPropagation()}>
                                                <span
                                                    aria-label={`Kéo ${tpl.name} để sắp xếp`}
                                                    title="Kéo để sắp xếp"
                                                    onPointerDown={event => startTemplatePointerDrag(event, tpl.id)}
                                                    onPointerMove={moveTemplatePointerDrag}
                                                    onPointerUp={finishTemplatePointerDrag}
                                                    onPointerCancel={clearTemplatePointerDrag}
                                                    style={{ opacity: savingSettings ? 0.2 : 0.65, fontSize: 22, letterSpacing: '-5px', cursor: savingSettings ? 'not-allowed' : (draggedTemplateId === tpl.id ? 'grabbing' : 'grab'), userSelect: 'none', touchAction: 'none', padding: '5px 9px 5px 4px', lineHeight: 0.8, color: '#475569', borderRadius: 5, background: '#f1f5f9', border: '1px solid #e2e8f0' }}
                                                >⋮⋮</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Cột 2: Preview hoặc Live View */}
                {showLiveView ? (
                    <div style={{ flex: 1, backgroundColor: "white", borderRadius: "8px", padding: "20px", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden", position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <h2 style={{ fontSize: "18px", margin: 0, color: "#0f172a", textAlign: "center", flex: 1 }}>
                                Màn Hình Canh Góc Camera
                            </h2>
                            <button onClick={toggleLiveView} style={{ position: "absolute", top: "15px", right: "20px", width: "32px", height: "32px", borderRadius: "16px", backgroundColor: "#f1f5f9", border: "1px solid #cbd5e1", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "16px", fontWeight: "bold" }}>
                                X
                            </button>
                        </div>
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#000", borderRadius: "8px", overflow: "hidden" }}>
                            <img src="http://127.0.0.1:8000/api/liveview" alt="Live View" style={{ width: "100%", height: "100%", objectFit: "contain", transform: "scaleX(-1)" }} />
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, backgroundColor: "white", borderRadius: "8px", padding: "20px", display: "flex", flexDirection: "column", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
                        <h2 style={{ fontSize: "18px", margin: "0 0 20px 0", color: "#0f172a", textAlign: "center" }}>
                            Chỉnh Sửa Khung: {editingTpl ? editingTpl.name : "Chưa chọn khung"}
                        </h2>

                        {!editingTpl ? (
                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "16px" }}>
                                Hãy chọn một khung ảnh ở danh sách bên trái để chỉnh sửa tọa độ
                            </div>
                        ) : (
                            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#f8fafc", borderRadius: "8px", overflow: "hidden" }}>
                                <div ref={previewRef} style={{
                                    position: "relative",
                                    border: "2px solid #cbd5e1",
                                    maxHeight: "100%",
                                    touchAction: "none",
                                    aspectRatio: `${editingTpl.canvas_size.width} / ${editingTpl.canvas_size.height}`,
                                    backgroundColor: "#e2e8f0",
                                    backgroundImage: `url(${editingTpl.image_url})`,
                                    backgroundSize: "100% 100%",
                                    overflow: "hidden",
                                    borderRadius: "4px",
                                    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                                    margin: "0 auto",
                                    height: editingTpl.orientation === 'portrait' ? '100%' : 'auto',
                                    width: editingTpl.orientation === 'landscape' ? '100%' : 'auto'
                                }}>
                                    {editingTpl.slots.map((slot, idx) => {
                                        const scaleX = 100 / editingTpl.canvas_size.width;
                                        const scaleY = 100 / editingTpl.canvas_size.height;
                                        const isActive = activeElement.type === 'slot' && activeElement.index === idx;
                                        return (
                                            <div key={idx}
                                                onPointerDown={(e) => handlePointerDown(e, 'slot', idx)}
                                                onPointerMove={handlePointerMove}
                                                onPointerUp={handlePointerUp}
                                                style={{
                                                    position: "absolute",
                                                    left: `${slot.x * scaleX}%`,
                                                    top: `${slot.y * scaleY}%`,
                                                    width: `${slot.width * scaleX}%`,
                                                    height: `${slot.height * scaleY}%`,
                                                    backgroundColor: isActive ? "rgba(56, 189, 248, 0.35)" : "rgba(59, 130, 246, 0.2)",
                                                    border: isActive ? "2px solid #0284c7" : "1px dashed #3b82f6",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    color: isActive ? "white" : "#1d4ed8",
                                                    fontWeight: "bold",
                                                    fontSize: "12px",
                                                    textShadow: isActive ? "0 1px 3px rgba(0,0,0,0.6)" : "0 1px 2px rgba(255,255,255,0.8)",
                                                    zIndex: isActive ? 5 : 1,
                                                    cursor: isDragging && isActive ? "grabbing" : "grab"
                                                }}>
                                                Ảnh {idx + 1}
                                            </div>
                                        );
                                    })}
                                    {editingTpl.qr_config.print_on_photo && (
                                        <div
                                            onPointerDown={(e) => handlePointerDown(e, 'qr')}
                                            onPointerMove={handlePointerMove}
                                            onPointerUp={handlePointerUp}
                                            style={{
                                                position: "absolute",
                                                left: `${editingTpl.qr_config.x * (100 / editingTpl.canvas_size.width)}%`,
                                                top: `${editingTpl.qr_config.y * (100 / editingTpl.canvas_size.height)}%`,
                                                width: `${editingTpl.qr_config.size * (100 / editingTpl.canvas_size.width)}%`,
                                                height: `${editingTpl.qr_config.size * (100 / editingTpl.canvas_size.height)}%`,
                                                backgroundColor: activeElement.type === 'qr' ? "rgba(220, 38, 38, 0.6)" : "rgba(15, 23, 42, 0.4)",
                                                border: activeElement.type === 'qr' ? "2px solid #ef4444" : "1px dashed #ffffff",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                color: "white",
                                                fontSize: "12px",
                                                fontWeight: "bold",
                                                zIndex: activeElement.type === 'qr' ? 6 : 2,
                                                cursor: isDragging && activeElement.type === 'qr' ? "grabbing" : "grab"
                                            }}>
                                            QR
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Cột 3: Nhập thông số */}
                <div style={{ width: "350px", backgroundColor: "white", borderRadius: "8px", padding: "20px", display: "flex", flexDirection: "column", overflowY: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", boxSizing: "border-box", opacity: editingTpl && !showLiveView ? 1 : 0.5, pointerEvents: editingTpl && !showLiveView ? "auto" : "none" }}>
                    {editingTpl && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "15px", height: "100%" }}>
                            <div style={{ display: "flex", gap: "10px" }}>
                                <div style={{ flex: 1, minWidth: 0 }}><label style={{ fontSize: "12px", fontWeight: "bold", color: "#334155" }}>Định hướng:</label><select value={editingTpl.orientation} onChange={(e) => setEditingTpl({ ...editingTpl, orientation: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", minWidth: 0 }}><option value="portrait">Dọc</option><option value="landscape">Ngang</option></select></div>
                                <div style={{ flex: 1, minWidth: 0 }}><label style={{ fontSize: "12px", fontWeight: "bold", color: "#334155" }}>Khổ in:</label><select value={editingTpl.print_format || 's4x6'} onChange={(e) => setEditingTpl({ ...editingTpl, print_format: e.target.value })} style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #cbd5e1", minWidth: 0 }}><option value="s4x6">s4x6</option><option value="s6x2_2">s6x2_2 (hai dải giống nhau)</option></select></div>
                                <div style={{ flex: 1, minWidth: 0 }}><label style={{ fontSize: "12px", fontWeight: "bold", color: "#dc3545" }}>W Gốc:</label><input type="number" readOnly value={editingTpl.canvas_size.width} style={{ width: "100%", minWidth: 0, padding: "6px", backgroundColor: "#f1f5f9", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} /></div>
                                <div style={{ flex: 1, minWidth: 0 }}><label style={{ fontSize: "12px", fontWeight: "bold", color: "#dc3545" }}>H Gốc:</label><input type="number" readOnly value={editingTpl.canvas_size.height} style={{ width: "100%", minWidth: 0, padding: "6px", backgroundColor: "#f1f5f9", borderRadius: "4px", border: "1px solid #cbd5e1", boxSizing: "border-box" }} /></div>
                            </div>

                            <div style={{ backgroundColor: "#eff6ff", padding: "12px", borderRadius: "6px", border: "1px solid #bfdbfe" }}>
                                <h4 style={{ margin: "0 0 10px 0", color: "#1d4ed8", fontSize: "14px" }}>Pose Guide</h4>
                                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "#334155", fontWeight: "bold" }}>
                                    <input type="checkbox" checked={editingTpl.guide_config?.enabled || false} onChange={(e) => setEditingTpl({ ...editingTpl, guide_config: { ...editingTpl.guide_config, enabled: e.target.checked } })} /> Hiển thị trên màn hình chụp
                                </label>
                                {editingTpl.guide_config?.enabled && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                                        <span style={{ fontSize: "12px", color: "#475569" }}>Độ mờ:</span>
                                        <input type="range" min="0.1" max="1" step="0.1" value={editingTpl.guide_config.opacity} onChange={(e) => setEditingTpl({ ...editingTpl, guide_config: { ...editingTpl.guide_config, opacity: parseFloat(e.target.value) } })} style={{ flex: 1 }} />
                                        <span style={{ fontWeight: "bold", fontSize: "12px", color: "#ea580c" }}>{Math.round(editingTpl.guide_config.opacity * 100)}%</span>
                                    </div>
                                )}
                            </div>

                            <div style={{ backgroundColor: "#f8fafc", padding: "12px", borderRadius: "6px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div><label style={{ fontSize: "13px", fontWeight: "bold", color: "#334155" }}>Tổng số ảnh:</label> <input type="number" min="1" max="8" value={editingTpl.num_poses || editingTpl.slots.length} onChange={(e) => handleNumPosesChange(e.target.value)} style={{ width: "50px", padding: "4px", textAlign: "center", borderRadius: "4px", border: "1px solid #cbd5e1" }} /></div>
                                <button onClick={handleAddSlot} style={{ padding: "6px 10px", backgroundColor: "#0284c7", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>+ Thêm Ảnh</button>
                            </div>

                            <div style={{ flex: 1, overflowY: "auto", paddingRight: "5px" }}>
                                <h4 style={{ margin: "0 0 10px 0", color: "#0f172a", fontSize: "14px" }}>Vị trí ảnh</h4>
                                {editingTpl.slots.map((slot, idx) => (
                                    <div key={idx} onClick={() => setActiveElement({ type: 'slot', index: idx })}
                                        style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px", backgroundColor: activeElement.type === 'slot' && activeElement.index === idx ? "#eff6ff" : "white", border: activeElement.type === 'slot' && activeElement.index === idx ? "2px solid #3b82f6" : "1px solid #cbd5e1", padding: "10px", borderRadius: "6px", cursor: "pointer" }}>
                                        <b style={{ color: "#0ea5e9", fontSize: "13px" }}>Ảnh {idx + 1}</b>

                                        <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", width: "12px" }}>X</span>
                                                <input type="number" style={{ width: "100%", minWidth: 0, padding: "4px", borderRadius: "3px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "12px" }} value={slot.x} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].x = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", width: "12px" }}>Y</span>
                                                <input type="number" style={{ width: "100%", minWidth: 0, padding: "4px", borderRadius: "3px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "12px" }} value={slot.y} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].y = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", width: "12px" }}>W</span>
                                                <input type="number" style={{ width: "100%", minWidth: 0, padding: "4px", borderRadius: "3px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "12px" }} value={slot.width} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].width = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", width: "12px" }}>H</span>
                                                <input type="number" style={{ width: "100%", minWidth: 0, padding: "4px", borderRadius: "3px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "12px" }} value={slot.height} onChange={(e) => { const newSlots = [...editingTpl.slots]; newSlots[idx].height = parseInt(e.target.value) || 0; setEditingTpl({ ...editingTpl, slots: newSlots }); }} />
                                            </div>
                                        </div>

                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveSlot(idx); }} style={{ width: "100%", backgroundColor: "#fee2e2", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: "4px", padding: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>Xóa</button>
                                    </div>
                                ))}

                                <div onClick={() => setActiveElement({ type: 'qr' })} style={{ marginTop: "15px", backgroundColor: activeElement.type === 'qr' ? "#eff6ff" : "white", padding: "12px", borderRadius: "6px", border: activeElement.type === 'qr' ? "2px solid #3b82f6" : "1px solid #cbd5e1", cursor: "pointer" }}>
                                    <label style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: "bold", cursor: "pointer", fontSize: "13px", color: "#0f172a", marginBottom: "12px" }}>
                                        <input type="checkbox" checked={editingTpl.qr_config.print_on_photo} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, print_on_photo: e.target.checked } })} /> In Mã QR Code
                                    </label>

                                    {editingTpl.qr_config.print_on_photo && (
                                        <div style={{ display: "flex", gap: "6px", width: "100%" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", width: "12px" }}>X</span>
                                                <input type="number" style={{ width: "100%", minWidth: 0, padding: "4px", borderRadius: "3px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "12px" }} value={editingTpl.qr_config.x} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, x: parseInt(e.target.value) || 0 } })} />
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                                                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", width: "12px" }}>Y</span>
                                                <input type="number" style={{ width: "100%", minWidth: 0, padding: "4px", borderRadius: "3px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "12px" }} value={editingTpl.qr_config.y} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, y: parseInt(e.target.value) || 0 } })} />
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1.2 }}>
                                                <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "bold", width: "24px" }}>Size</span>
                                                <input type="number" style={{ width: "100%", minWidth: 0, padding: "4px", borderRadius: "3px", border: "1px solid #cbd5e1", boxSizing: "border-box", fontSize: "12px" }} value={editingTpl.qr_config.size} onChange={(e) => setEditingTpl({ ...editingTpl, qr_config: { ...editingTpl.qr_config, size: parseInt(e.target.value) || 100 } })} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: "10px", marginTop: "10px", paddingTop: "15px", borderTop: "1px solid #e2e8f0" }}>
                                <button onClick={handleSaveTemplateConfig} style={{ flex: 2, padding: "12px", backgroundColor: "rgb(16, 185, 129)", color: "white", border: "none", fontWeight: "bold", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Lưu Khung</button>
                                <button onClick={() => handleDeleteTemplate(editingTpl.id)} style={{ flex: 1, padding: "12px", backgroundColor: "#ef4444", color: "white", border: "none", fontWeight: "bold", borderRadius: "6px", cursor: "pointer", fontSize: "14px" }}>Xóa</button>
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Admin;
