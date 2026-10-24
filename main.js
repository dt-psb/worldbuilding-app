const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');

let mainWindow = null;
let db = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: '세계관 빌더'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'worldbuilding.db');
    console.log('[main] DB path:', dbPath);
    const Database = require('./db/database');
    db = new Database(dbPath);
    console.log('[main] DB initialized OK');
  } catch (err) {
    console.error('[main] DB init failed:', err);
    dialog.showErrorBox('DB 초기화 실패', err.message + '\n\n' + err.stack);
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
