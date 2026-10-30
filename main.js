const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const Logger = require('./logger');
const logger = new Logger(__dirname);
logger.initProcessHandlers();

const Database = require('./db/database');
const BackupManager = require('./backup-manager');
const ObsidianExporter = require('./obsidian-exporter');

let mainWindow = null;
let db = null;
let dbPath = '';

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    frame: false,
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '세계관 빌더'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:stateChange', { isMaximized: true });
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:stateChange', { isMaximized: false });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    dbPath = path.join(app.getPath('userData'), 'worldbuilding.db');
    logger.info('Main', `DB path: ${dbPath}`);
    db = new Database(dbPath);
    logger.info('Main', 'DB initialized OK');

    // 앱 시작 시 자동 스냅샷 백업 (안전 백업)
    try {
      BackupManager.createSnapshot(dbPath, app.getPath('userData'));
      logger.info('Main', 'Startup snapshot created OK');
    } catch (bErr) {
      logger.warn('Main', `Startup snapshot skipped: ${bErr.message}`);
    }
  } catch (err) {
    logger.error('Main', 'DB init failed: ' + err.message, err);
    dialog.showErrorBox('DB 초기화 실패', err.message + '\n\n' + err.stack);
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // ── Window Controls IPC ─────────────────────────────────────────
  ipcMain.on('window:minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window:close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });

  // ── Logging IPC ──────────────────────────────────────────────────
  ipcMain.on('log:error', (_, data) => {
    if (!data) return;
    logger.error(data.source || 'Renderer', data.message || 'Error occurred', data.err);
  });

  ipcMain.on('log:info', (_, data) => {
    if (!data) return;
    logger.info(data.source || 'Renderer', data.message || '');
  });

  // ── Characters ──────────────────────────────────────────────────
  ipcMain.handle('db:getCharacters', () => {
    return db.getCharacters();
  });

  ipcMain.handle('db:getCharacter', (_, id) => {
    return db.getCharacter(id);
  });

  ipcMain.handle('db:createCharacter', (_, data) => {
    return db.createCharacter(data);
  });

  ipcMain.handle('db:updateCharacter', (_, id, data) => {
    return db.updateCharacter(id, data);
  });

  ipcMain.handle('db:deleteCharacter', (_, id) => {
    return db.deleteCharacter(id);
  });

  // ── Factions ─────────────────────────────────────────────────────
  ipcMain.handle('db:getFactions', () => {
    return db.getFactions();
  });

  ipcMain.handle('db:createFaction', (_, data) => {
    return db.createFaction(data);
  });

  ipcMain.handle('db:updateFaction', (_, id, data) => {
    return db.updateFaction(id, data);
  });

  ipcMain.handle('db:deleteFaction', (_, id) => {
    return db.deleteFaction(id);
  });

  // ── Relationships ────────────────────────────────────────────────
  ipcMain.handle('db:getRelationships', () => {
    return db.getRelationships();
  });

  ipcMain.handle('db:getRelationshipBetween', (_, charAId, charBId) => {
    return db.getRelationshipBetween(charAId, charBId);
  });

  ipcMain.handle('db:createRelationship', (_, data) => {
    return db.createRelationship(data);
  });

  ipcMain.handle('db:updateRelationship', (_, id, data) => {
    return db.updateRelationship(id, data);
  });

  ipcMain.handle('db:deleteRelationship', (_, id) => {
    return db.deleteRelationship(id);
  });

  // ── Graph ────────────────────────────────────────────────────────
  ipcMain.handle('db:getGraphData', () => {
    return db.getGraphData();
  });

  // ── Episodes ─────────────────────────────────────────────────────
  ipcMain.handle('db:getEpisodes', () => {
    return db.getEpisodes();
  });

  ipcMain.handle('db:getEpisode', (_, id) => {
    return db.getEpisode(id);
  });

  ipcMain.handle('db:getSharedEpisodes', (_, charAId, charBId) => {
    return db.getSharedEpisodes(charAId, charBId);
  });

  ipcMain.handle('db:createEpisode', (_, data) => {
    return db.createEpisode(data);
  });

  ipcMain.handle('db:updateEpisode', (_, id, data) => {
    return db.updateEpisode(id, data);
  });

  ipcMain.handle('db:deleteEpisode', (_, id) => {
    return db.deleteEpisode(id);
  });

  // ── Dialog ──────────────────────────────────────────────────────
  ipcMain.handle('dialog:openImage', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: '이미지 선택',
      filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:openImages', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: '이미지 다중 선택',
      filters: [{ name: '이미지', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (result.canceled || result.filePaths.length === 0) return [];
    return result.filePaths;
  });

  // ── Clipboard ────────────────────────────────────────────────────
  ipcMain.handle('clipboard:copyImage', (_, imgPath) => {
    try {
      const img = nativeImage.createFromPath(imgPath);
      if (img.isEmpty()) {
        console.warn('Native image is empty for path:', imgPath);
        return false;
      }
      clipboard.writeImage(img);
      return true;
    } catch (err) {
      console.error('Failed to copy image to clipboard:', err);
      return false;
    }
  });

  ipcMain.handle('clipboard:copyText', (_, text) => {
    try {
      clipboard.writeText(text || '');
      return true;
    } catch (err) {
      console.error('Failed to copy text to clipboard:', err);
      return false;
    }
  });

  ipcMain.handle('clipboard:copyImageDataUrl', (_, dataUrl) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl);
      clipboard.writeImage(img);
      return true;
    } catch (err) {
      console.error('Failed to copy dataURL image to clipboard:', err);
      return false;
    }
  });

  ipcMain.handle('dialog:saveImageDataUrl', async (_, { dataUrl, defaultName }) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        defaultPath: defaultName || 'character-card.png',
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      });
      if (canceled || !filePath) return false;
      const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
      const fs = require('fs');
      await fs.promises.writeFile(filePath, base64Data, 'base64');
      return true;
    } catch (err) {
      console.error('Failed to save image file:', err);
      return false;
    }
  });

  // ── Backup & Obsidian System ─────────────────────────────────────
  ipcMain.handle('dialog:selectDirectory', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: '폴더 선택',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveBackupFile', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultName = `worldbuilding_backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.db`;
    const result = await dialog.showSaveDialog(win, {
      title: '백업 DB 파일 저장 위치 선택',
      defaultPath: defaultName,
      filters: [{ name: 'SQLite DB', extensions: ['db', 'sqlite'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('dialog:openBackupFile', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: '복원할 백업 DB 파일 선택',
      filters: [{ name: 'SQLite DB', extensions: ['db', 'sqlite'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveJsonFile', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const defaultName = `worldbuilding_export_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
    const result = await dialog.showSaveDialog(win, {
      title: 'JSON 내보내기 파일 저장 위치 선택',
      defaultPath: defaultName,
      filters: [{ name: 'JSON Data', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  ipcMain.handle('dialog:openJsonFile', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showOpenDialog(win, {
      title: '가져올 JSON 데이터 파일 선택',
      filters: [{ name: 'JSON Data', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('backup:getDbInfo', () => {
    return BackupManager.getDbInfo(dbPath);
  });

  ipcMain.handle('backup:createSnapshot', () => {
    return BackupManager.createSnapshot(dbPath, app.getPath('userData'));
  });

  ipcMain.handle('backup:listSnapshots', () => {
    return BackupManager.listSnapshots(app.getPath('userData'));
  });

  ipcMain.handle('backup:backupToFile', (_, targetPath) => {
    return BackupManager.backupToFile(dbPath, targetPath);
  });

  ipcMain.handle('backup:restoreFromPath', (_, backupFilePath) => {
    db = BackupManager.restoreDatabase(db, dbPath, backupFilePath, Database);
    return { success: true };
  });

  ipcMain.handle('backup:exportJSON', (_, targetPath) => {
    return BackupManager.exportJSON(db, targetPath);
  });

  ipcMain.handle('backup:importJSON', (_, jsonPath) => {
    return BackupManager.importJSON(db, jsonPath);
  });

  ipcMain.handle('obsidian:exportVault', (_, targetDir) => {
    return ObsidianExporter.exportVault(db, targetDir);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
