const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Toggle fullscreen ↔ windowed
    toggleWindow: () => ipcRenderer.send('app:toggle-window'),
    
    // Thoát ứng dụng
    exitApp: () => ipcRenderer.send('app:exit'),
    
    // Lắng nghe sự kiện thay đổi state cửa sổ
    onWindowStateChange: (callback) => {
        const listener = (event, data) => callback(data);
        ipcRenderer.on('window-state-changed', listener);
        // Trả về hàm cleanup để tránh memory leak
        return () => ipcRenderer.removeListener('window-state-changed', listener);
    }
});