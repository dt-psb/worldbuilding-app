const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Characters
  getCharacters: () => ipcRenderer.invoke('db:getCharacters'),
  getCharacter: (id) => ipcRenderer.invoke('db:getCharacter', id),
  createCharacter: (data) => ipcRenderer.invoke('db:createCharacter', data),
  updateCharacter: (id, data) => ipcRenderer.invoke('db:updateCharacter', id, data),
  deleteCharacter: (id) => ipcRenderer.invoke('db:deleteCharacter', id),

  // Factions
  getFactions: () => ipcRenderer.invoke('db:getFactions'),
  createFaction: (data) => ipcRenderer.invoke('db:createFaction', data),
  updateFaction: (id, data) => ipcRenderer.invoke('db:updateFaction', id, data),
  deleteFaction: (id) => ipcRenderer.invoke('db:deleteFaction', id),

  // Relationships
  getRelationships: () => ipcRenderer.invoke('db:getRelationships'),
  getRelationshipBetween: (a, b) => ipcRenderer.invoke('db:getRelationshipBetween', a, b),
  createRelationship: (data) => ipcRenderer.invoke('db:createRelationship', data),
  updateRelationship: (id, data) => ipcRenderer.invoke('db:updateRelationship', id, data),
  deleteRelationship: (id) => ipcRenderer.invoke('db:deleteRelationship', id),

  // Graph
  getGraphData: () => ipcRenderer.invoke('db:getGraphData'),

  // Episodes
  getEpisodes: () => ipcRenderer.invoke('db:getEpisodes'),
  getEpisode: (id) => ipcRenderer.invoke('db:getEpisode', id),
  getSharedEpisodes: (a, b) => ipcRenderer.invoke('db:getSharedEpisodes', a, b),
  createEpisode: (data) => ipcRenderer.invoke('db:createEpisode', data),
  updateEpisode: (id, data) => ipcRenderer.invoke('db:updateEpisode', id, data),
  deleteEpisode: (id) => ipcRenderer.invoke('db:deleteEpisode', id),

  // Dialog
  openImage: () => ipcRenderer.invoke('dialog:openImage'),
  openImages: () => ipcRenderer.invoke('dialog:openImages'),

  // Clipboard & Export
  copyImage: (path) => ipcRenderer.invoke('clipboard:copyImage', path),
  copyImageDataUrl: (dataUrl) => ipcRenderer.invoke('clipboard:copyImageDataUrl', dataUrl),
  saveImageDataUrl: (data) => ipcRenderer.invoke('dialog:saveImageDataUrl', data),
  copyText: (text) => ipcRenderer.invoke('clipboard:copyText', text),

  // Backup & Obsidian
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  saveBackupFile: () => ipcRenderer.invoke('dialog:saveBackupFile'),
  openBackupFile: () => ipcRenderer.invoke('dialog:openBackupFile'),
  saveJsonFile: () => ipcRenderer.invoke('dialog:saveJsonFile'),
  openJsonFile: () => ipcRenderer.invoke('dialog:openJsonFile'),

  getDbInfo: () => ipcRenderer.invoke('backup:getDbInfo'),
  createSnapshot: () => ipcRenderer.invoke('backup:createSnapshot'),
  listSnapshots: () => ipcRenderer.invoke('backup:listSnapshots'),
  backupToFile: (path) => ipcRenderer.invoke('backup:backupToFile', path),
  restoreFromPath: (path) => ipcRenderer.invoke('backup:restoreFromPath', path),
  exportJSON: (path) => ipcRenderer.invoke('backup:exportJSON', path),
  importJSON: (path) => ipcRenderer.invoke('backup:importJSON', path),
  exportObsidianVault: (targetDir) => ipcRenderer.invoke('obsidian:exportVault', targetDir),

  // Window Controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isWindowMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowStateChange: (callback) => ipcRenderer.on('window:stateChange', (_, data) => callback(data)),

  // Logging
  logError: (source, message, err) => ipcRenderer.send('log:error', { source, message, err }),
  logInfo: (source, message) => ipcRenderer.send('log:info', { source, message }),
});
