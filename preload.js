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
  createEpisode: (data) => ipcRenderer.invoke('db:createEpisode', data),
  updateEpisode: (id, data) => ipcRenderer.invoke('db:updateEpisode', id, data),
  deleteEpisode: (id) => ipcRenderer.invoke('db:deleteEpisode', id),

  // Dialog
  openImage: () => ipcRenderer.invoke('dialog:openImage'),
  openImages: () => ipcRenderer.invoke('dialog:openImages'),

  // Clipboard
  copyImage: (path) => ipcRenderer.invoke('clipboard:copyImage', path),
  copyText: (text) => ipcRenderer.invoke('clipboard:copyText', text),
});
