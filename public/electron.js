const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;
let isToggling = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(
    isDev
      ? 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`
  );

  // Đồng bộ state khi cửa sổ vào/ra fullscreen
  const notifyWindowState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-state-changed', {
        isFullScreen: mainWindow.isFullScreen()
      });
    }
  };

  mainWindow.on('enter-full-screen', notifyWindowState);
  mainWindow.on('leave-full-screen', notifyWindowState);

  // Restore từ taskbar thì ép fullscreen lại
  mainWindow.on('restore', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(true);
      }
    }, 100);
  });

  // User bấm maximize của OS thì ép fullscreen
  mainWindow.on('maximize', () => {
    mainWindow.setFullScreen(true);
  });

  // Nếu user cố thoát fullscreen thì ép lại, trừ khi đang toggle
  mainWindow.on('leave-full-screen', () => {
    if (!isToggling) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFullScreen()) {
          mainWindow.setFullScreen(true);
        }
      }, 200);
    }
  });

  // Gửi state ban đầu sau khi load xong
  mainWindow.webContents.on('did-finish-load', () => {
    notifyWindowState();
  });

  mainWindow.on('closed', () => mainWindow = null);
}

app.on('ready', createWindow);

// Toggle fullscreen và windowed
ipcMain.on('app:toggle-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  // Đánh dấu đang toggle để không bị ép fullscreen lại
  isToggling = true;

  if (win.isFullScreen()) {
    // Đang full: thu nhỏ về windowed
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;

    const winW = 1280;
    const winH = 720;
    const winX = Math.round((screenW - winW) / 2);
    const winY = Math.round((screenH - winH) / 2);

    // Bước 1: Thoát fullscreen
    win.setFullScreen(false);

    // Bước 2: Đợi Windows xử lý xong rồi unmaximize
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.unmaximize();

      // Bước 3: Đợi thêm rồi setBounds (vị trí và kích thước trong 1 lệnh)
      setTimeout(() => {
        if (!win || win.isDestroyed()) return;
        win.setBounds({ x: winX, y: winY, width: winW, height: winH });
        win.webContents.send('window-state-changed', { isFullScreen: false });

        setTimeout(() => { isToggling = false; }, 500);
      }, 200);
    }, 250);

  } else {
    // Đang windowed: bật lại fullscreen
    win.setFullScreen(true);

    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      win.focus();
      win.webContents.send('window-state-changed', { isFullScreen: true });
      isToggling = false;
    }, 300);
  }
});

ipcMain.on('app:exit', () => {
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});