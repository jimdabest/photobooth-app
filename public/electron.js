const { app, BrowserWindow, dialog, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow;
let isToggling = false;
let backendProcess;

const API_ORIGIN = 'http://127.0.0.1:8000';

function isDevelopment() {
  return !app.isPackaged;
}

function backendDirectory() {
  return isDevelopment()
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');
}

function isBackendReady() {
  return new Promise((resolve) => {
    const request = http.get(`${API_ORIGIN}/api/settings`, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForBackend() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await isBackendReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Backend không phản hồi trên cổng 8000 sau 20 giây.');
}

async function startBackend() {
  // Let operators keep an already-running production backend on port 8000.
  if (await isBackendReady()) return;

  const backendDir = backendDirectory();
  const command = isDevelopment()
    ? path.join(backendDir, 'venv', 'Scripts', 'python.exe')
    : path.join(backendDir, 'photobooth-backend.exe');
  const arguments_ = isDevelopment() ? [path.join(backendDir, 'run.py')] : [];

  backendProcess = spawn(command, arguments_, {
    cwd: backendDir,
    windowsHide: true,
    env: {
      ...process.env,
      PTB_DATA_DIR: path.join(app.getPath('userData'), 'ptb_data'),
      PYTHONUTF8: '1'
    }
  });
  backendProcess.stdout.on('data', (data) => console.log(`[backend] ${data}`));
  backendProcess.stderr.on('data', (data) => console.error(`[backend] ${data}`));
  backendProcess.on('error', (error) => console.error('Không thể khởi động backend:', error));
  backendProcess.on('exit', (code) => {
    backendProcess = undefined;
    if (code && !app.isQuitting) console.error(`Backend đã dừng với mã ${code}.`);
  });

  await waitForBackend();
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
}

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
    isDevelopment()
      ? 'http://localhost:3000'
      : pathToFileURL(path.join(__dirname, '../build/index.html')).toString()
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

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (error) {
    dialog.showErrorBox('Không thể khởi động Photobooth', error.message);
    app.quit();
  }
});

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

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBackend();
});
