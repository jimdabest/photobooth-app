const { app, BrowserWindow } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;

function createWindow() {
  // Tạo cửa sổ ứng dụng
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true, // Kiosk mode (toàn màn hình)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Tải giao diện React
  mainWindow.loadURL(
    isDev 
      ? 'http://localhost:3000' // Chế độ Dev
      : `file://${path.join(__dirname, '../build/index.html')}` // Chế độ Build
  );

  // Nếu muốn hiện công cụ DevTools để debug
  // if (isDev) { mainWindow.webContents.openDevTools(); }

  mainWindow.on('closed', () => mainWindow = null);
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});