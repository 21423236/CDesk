const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  validateToken: () => ipcRenderer.invoke('validate-token'),

  // Cloudflared
  checkCloudflared: () => ipcRenderer.invoke('check-cloudflared'),
  installCloudflared: () => ipcRenderer.invoke('install-cloudflared'),

  // Tunnel
  startTunnel: () => ipcRenderer.invoke('start-tunnel'),
  stopTunnel: () => ipcRenderer.invoke('stop-tunnel'),
  getTunnelStatus: () => ipcRenderer.invoke('get-tunnel-status'),

  // Remote computers
  getRemoteComputers: () => ipcRenderer.invoke('get-remote-computers'),
  connectToRemote: (computer) => ipcRenderer.invoke('connect-to-remote', computer),
  disconnectFromRemote: (computerName) => ipcRenderer.invoke('disconnect-from-remote', computerName),
  getActiveConnections: () => ipcRenderer.invoke('get-active-connections'),
  manualRefreshRemotes: () => ipcRenderer.invoke('manual-refresh-remotes'),

  // Utilities
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Event listeners
  onTunnelStarted: (callback) => ipcRenderer.on('tunnel-started', callback),
  onTunnelStopped: (callback) => ipcRenderer.on('tunnel-stopped', callback),
  onRemoteComputersUpdated: (callback) => ipcRenderer.on('remote-computers-updated', callback),
  onTrayToggleTunnel: (callback) => ipcRenderer.on('tray-toggle-tunnel', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
