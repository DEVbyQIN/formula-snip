'use strict';

const { app, BrowserWindow, Menu, dialog, clipboard, nativeImage, nativeTheme, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

app.setName('FormulaSnip');
if (process.platform === 'win32') app.setAppUserModelId('com.qin.formulasnip.electron');

const selftestArgIndex = process.argv.indexOf('--selftest');
const selftest = selftestArgIndex >= 0;
const selftestOutDir = selftest && process.argv[selftestArgIndex + 1] && !process.argv[selftestArgIndex + 1].startsWith('--')
  ? process.argv[selftestArgIndex + 1]
  : path.join(require('os').tmpdir(), 'formulasnip-electron-selftest');
const dark = process.argv.includes('--dark');

let win = null;
let selftestTimer = null;
let selftestDone = false;
const startedAt = Date.now();

function log(line) {
  console.log(line);
}

function webDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'web');
  return path.join(__dirname, '..', 'app', 'web');
}

function stateFile() {
  return path.join(app.getPath('userData'), 'state.json');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch (e) {
    return {};
  }
}

function sendReply(payload) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript('window.__bridgeResult(' + JSON.stringify(payload) + ')').catch(() => {});
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  try {
    return Buffer.from(dataUrl.slice(comma + 1), 'base64');
  } catch (e) {
    return null;
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [];
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 FormulaSnip' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 FormulaSnip' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 FormulaSnip' }
      ]
    });
  }
  template.push({
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '拷贝' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' }
    ]
  });
  if (!isMac) template.push({ label: '文件', submenu: [{ role: 'quit', label: '退出' }] });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.on('formulasnip:init', (event) => {
  event.returnValue = {
    state: readState(),
    selftest,
    platform: process.platform
  };
});

ipcMain.on('formulasnip:message', async (event, payload) => {
  if (!payload || typeof payload !== 'object') return;
  const { type, reqId } = payload;
  if (!reqId) return;

  if (type === 'savePng') {
    const data = decodeDataUrl(payload.dataUrl);
    if (!data) { sendReply({ reqId, ok: false, error: 'PNG 数据无效' }); return; }
    const suggested = payload.filename || 'formula.png';
    const result = await dialog.showSaveDialog(win, {
      title: '导出透明 PNG',
      defaultPath: path.join(app.getPath('downloads'), suggested),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) {
      sendReply({ reqId, ok: false, canceled: true });
      return;
    }
    try {
      fs.writeFileSync(result.filePath, data);
      sendReply({ reqId, ok: true, path: result.filePath });
    } catch (e) {
      sendReply({ reqId, ok: false, error: e.message });
    }
    return;
  }

  if (type === 'copyPng') {
    const image = nativeImage.createFromDataURL(payload.dataUrl || '');
    if (!image || image.isEmpty()) { sendReply({ reqId, ok: false, error: 'PNG 数据无效' }); return; }
    clipboard.writeImage(image);
    sendReply({ reqId, ok: true });
    return;
  }

  if (type === 'saveState') {
    let target = stateFile();
    if (payload.selftest) {
      try { fs.mkdirSync(selftestOutDir, { recursive: true }); } catch (e) {}
      target = path.join(selftestOutDir, 'state-test.json');
    }
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, payload.json || '{}', 'utf8');
      sendReply({ reqId, ok: true, path: target });
    } catch (e) {
      sendReply({ reqId, ok: false, error: e.message });
    }
    return;
  }

  if (type === 'selftestWritePng') {
    if (!selftest) { sendReply({ reqId, ok: false, error: 'not in selftest' }); return; }
    const data = decodeDataUrl(payload.dataUrl);
    if (!data) { sendReply({ reqId, ok: false, error: 'PNG 数据无效' }); return; }
    try {
      fs.mkdirSync(selftestOutDir, { recursive: true });
      const target = path.join(selftestOutDir, payload.name || 'selftest.png');
      fs.writeFileSync(target, data);
      sendReply({ reqId, ok: true, path: target });
    } catch (e) {
      sendReply({ reqId, ok: false, error: e.message });
    }
    return;
  }

  sendReply({ reqId, ok: false, error: 'unknown bridge type' });
});

function createWindow() {
  const darkMode = dark || nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1220,
    height: 840,
    minWidth: 980,
    minHeight: 660,
    title: 'FormulaSnip',
    backgroundColor: darkMode ? '#1b1b1d' : '#f2f2f4',
    show: false,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    if (selftest) log('WINDOW_SHOWN');
  });
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('did-fail-load', (event, code, description) => {
    log('LOAD_FAILED: ' + code + ' ' + description);
  });

  win.loadFile(path.join(webDir(), 'index.html')).then(() => {
    if (selftest) {
      log('WEB: ' + path.join(webDir(), 'index.html'));
      selftestTimer = setInterval(pollSelftest, 500);
    }
  }).catch((e) => {
    log('LOAD_ERROR: ' + e.message);
    if (selftest) app.exit(2);
  });
}

async function pollSelftest() {
  if (selftestDone || !win || win.isDestroyed()) return;
  if (Date.now() - startedAt > 180000) {
    selftestDone = true;
    log('SELFTEST: TIMEOUT');
    finishSelftest(3);
    return;
  }
  let text = null;
  try {
    text = await win.webContents.executeJavaScript('window.__SELFTEST_RESULT__ ? JSON.stringify(window.__SELFTEST_RESULT__) : null');
  } catch (e) {
    return;
  }
  if (!text || text === 'null' || text === '<null>') return;
  selftestDone = true;
  clearInterval(selftestTimer);
  let result = null;
  try { result = JSON.parse(text); } catch (e) {}
  log('SELFTEST_RESULT: ' + text);
  if (result) {
    log('SELFTEST_OK: ' + !!result.ok);
    for (const check of result.checks || []) {
      log((check.ok ? 'PASS' : 'FAIL') + '  ' + check.name + (check.detail ? '  [' + check.detail + ']' : ''));
    }
  }
  await captureSnapshot();
  const testState = path.join(selftestOutDir, 'state-test.json');
  log('STATE_FILE_EXISTS: ' + fs.existsSync(testState));
  finishSelftest(result && result.ok ? 0 : 1);
}

async function captureSnapshot() {
  if (!win || win.isDestroyed()) return;
  try {
    const image = await win.webContents.capturePage();
    fs.mkdirSync(selftestOutDir, { recursive: true });
    const target = path.join(selftestOutDir, 'app-ui.png');
    fs.writeFileSync(target, image.toPNG());
    log('SNAPSHOT: ' + target);
  } catch (e) {
    log('SNAPSHOT_ERROR: ' + e.message);
  }
}

function finishSelftest(code) {
  setTimeout(() => app.exit(code), 400);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    if (dark) nativeTheme.themeSource = 'dark';
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => app.quit());
}
