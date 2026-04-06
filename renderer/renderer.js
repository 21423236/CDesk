// RDP Tunnel Manager - Renderer Process
// Handles UI interactions and communicates with main process

// State
let config = {};
let isTunnelRunning = false;
let tunnelUrl = null;
let isCloudflaredInstalled = false;
let activeConnections = []; // Track active remote connections

// DOM Elements
const elements = {
  // Status
  statusIndicator: document.getElementById('statusIndicator'),
  statusLabel: document.getElementById('statusLabel'),
  statusSublabel: document.getElementById('statusSublabel'),
  tunnelAddressContainer: document.getElementById('tunnelAddressContainer'),
  addressText: document.getElementById('addressText'),
  copyBtn: document.getElementById('copyBtn'),

  // Buttons
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  refreshBtn: document.getElementById('refreshBtn'),
  installBtn: document.getElementById('installBtn'),

  // Sections
  cloudflaredSection: document.getElementById('cloudflaredSection'),
  remoteList: document.getElementById('remoteList'),
  syncStatus: document.getElementById('syncStatus'),
  syncText: document.getElementById('syncText'),
  computerCount: document.getElementById('computerCount'),

  // Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettings: document.getElementById('closeSettings'),
  cancelSettings: document.getElementById('cancelSettings'),
  saveSettings: document.getElementById('saveSettings'),
  settingsForm: document.getElementById('settingsForm'),

  // Form inputs
  githubToken: document.getElementById('githubToken'),
  gistId: document.getElementById('gistId'),
  computerName: document.getElementById('computerName'),
  rdpPort: document.getElementById('rdpPort'),
  testTokenBtn: document.getElementById('testTokenBtn'),
  tokenStatus: document.getElementById('tokenStatus'),
  getTokenLink: document.getElementById('getTokenLink'),
  computerName: document.getElementById('computerName'),
  rdpPort: document.getElementById('rdpPort'),

  // Toast
  toastContainer: document.getElementById('toastContainer')
};

// Initialize
async function init() {
  await loadConfig();
  await checkCloudflared();
  await checkTunnelStatus();
  await loadRemoteComputers();
  await loadActiveConnections();
  setupEventListeners();
  setupIPCListeners();
}

// Load active connections
async function loadActiveConnections() {
  try {
    activeConnections = await window.electronAPI.getActiveConnections();
    if (activeConnections.length > 0) {
      console.log(`Loaded ${activeConnections.length} active connections`);
    }
  } catch (error) {
    console.error('Failed to load active connections:', error);
    activeConnections = [];
  }
}

// Load configuration
async function loadConfig() {
  try {
    config = await window.electronAPI.getConfig();
    elements.githubToken.value = config.githubToken || '';
    elements.gistId.value = config.gistId || '';
    elements.computerName.value = config.computerName || 'ComputerA';
    elements.rdpPort.value = config.rdpPort || 3389;
  } catch (error) {
    showToast('Failed to load configuration', 'error');
  }
}

// Check cloudflared installation
async function checkCloudflared() {
  try {
    const result = await window.electronAPI.checkCloudflared();
    isCloudflaredInstalled = result.installed;
    updateCloudflaredUI();
  } catch (error) {
    showToast('Failed to check cloudflared status', 'error');
  }
}

// Update cloudflared UI
function updateCloudflaredUI() {
  const card = elements.cloudflaredSection.querySelector('.cloudflared-card');
  const icon = card.querySelector('.cloudflared-icon');
  const info = card.querySelector('.cloudflared-info');
  const btn = elements.installBtn;

  if (isCloudflaredInstalled) {
    card.classList.add('installed');
    icon.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    `;
    info.innerHTML = `
      <h3>Cloudflared Installed</h3>
      <p>Ready to create secure tunnels</p>
    `;
    btn.style.display = 'none';
    elements.cloudflaredSection.style.display = 'none';
  } else {
    card.classList.remove('installed');
    elements.cloudflaredSection.style.display = 'block';
  }
}

// Check tunnel status
async function checkTunnelStatus() {
  try {
    const status = await window.electronAPI.getTunnelStatus();
    isTunnelRunning = status.isRunning;
    tunnelUrl = status.url;
    updateStatusUI();
  } catch (error) {
    console.error('Failed to get tunnel status:', error);
  }
}

// Update status UI
function updateStatusUI() {
  if (isTunnelRunning && tunnelUrl) {
    // Connected state
    elements.statusIndicator.classList.add('connected');
    elements.statusLabel.textContent = 'Connected';
    elements.statusSublabel.textContent = 'Tunnel is active and running';
    elements.tunnelAddressContainer.style.display = 'block';
    elements.addressText.textContent = tunnelUrl;

    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
  } else {
    // Disconnected state
    elements.statusIndicator.classList.remove('connected');
    elements.statusLabel.textContent = 'Disconnected';
    elements.statusSublabel.textContent = 'Tunnel is not running';
    elements.tunnelAddressContainer.style.display = 'none';

    elements.startBtn.disabled = !isCloudflaredInstalled;
    elements.stopBtn.disabled = true;
  }
}

// Load remote computers
async function loadRemoteComputers() {
  try {
    const computers = await window.electronAPI.getRemoteComputers();
    renderRemoteComputers(computers);
  } catch (error) {
    console.error('Failed to load remote computers:', error);
  }
}

// Manual refresh with sync
async function manualRefreshRemotes() {
  try {
    elements.refreshBtn.classList.add('loading');
    elements.refreshBtn.disabled = true;
    
    await window.electronAPI.manualRefreshRemotes();
    await loadRemoteComputers();
    
    setTimeout(() => {
      elements.refreshBtn.classList.remove('loading');
      elements.refreshBtn.disabled = false;
    }, 1000);
  } catch (error) {
    console.error('Failed to refresh:', error);
    elements.refreshBtn.classList.remove('loading');
    elements.refreshBtn.disabled = false;
  }
}

// Update sync status
function updateSyncStatus(computers) {
  if (!elements.syncStatus) return;
  
  const now = new Date();
  elements.syncText.textContent = `Last synced: ${now.toLocaleTimeString()}`;
  elements.computerCount.textContent = `${computers.length} computer${computers.length !== 1 ? 's' : ''} online`;
}

// Render remote computers list
function renderRemoteComputers(computers) {
  updateSyncStatus(computers);
  
  if (!computers || computers.length === 0) {
    elements.remoteList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <p>No remote computers available</p>
        <span>Start your tunnel to see other computers</span>
      </div>
    `;
    return;
  }

  elements.remoteList.innerHTML = computers.map(computer => {
    const connection = activeConnections.find(c => c.computerName === computer.name);
    const isConnected = connection !== undefined;
    
    return `
      <div class="remote-card ${isConnected ? 'connected' : ''}" data-name="${computer.name}">
        <div class="remote-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
        </div>
        <div class="remote-info">
          <div class="remote-name">${escapeHtml(computer.name)}</div>
          <div class="remote-url">${escapeHtml(computer.url)}</div>
          ${isConnected ? `
            <div class="connection-status">
              <span class="status-badge connected">Connected</span>
              <span class="connection-port">Port: ${connection.localPort}</span>
            </div>
          ` : `
            <div class="remote-meta">Last seen: ${formatTime(computer.timestamp)}</div>
          `}
        </div>
        ${isConnected ? `
          <button class="btn btn-danger disconnect-btn" data-name="${computer.name}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span>Disconnect</span>
          </button>
        ` : `
          <button class="btn btn-primary connect-btn" data-name="${computer.name}" data-url="${computer.url}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            <span>Connect</span>
          </button>
        `}
      </div>
    `;
  }).join('');

  // Add connect button listeners
  elements.remoteList.querySelectorAll('.connect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const computer = {
        name: btn.dataset.name,
        url: btn.dataset.url
      };
      connectToRemote(computer);
    });
  });
  
  // Add disconnect button listeners
  elements.remoteList.querySelectorAll('.disconnect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      disconnectFromRemote(btn.dataset.name);
    });
  });
}

// Connect to remote computer
async function connectToRemote(computer) {
  showToast(`Connecting to ${computer.name}...`, 'info');
  
  try {
    const result = await window.electronAPI.connectToRemote(computer);
    if (result.success) {
      showToast(result.message || `Connected to ${computer.name} on port ${result.localPort}`, 'success');
      
      // Update active connections
      activeConnections.push({
        computerName: computer.name,
        localPort: result.localPort,
        remoteUrl: computer.url
      });
      
      // Refresh UI
      loadRemoteComputers();
    } else {
      showToast(`Failed to connect: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Connection error: ${error.message}`, 'error');
  }
}

// Disconnect from remote computer
async function disconnectFromRemote(computerName) {
  showToast(`Disconnecting from ${computerName}...`, 'info');
  
  try {
    const result = await window.electronAPI.disconnectFromRemote(computerName);
    if (result.success) {
      showToast(`Disconnected from ${computerName}`, 'success');
      
      // Update active connections
      activeConnections = activeConnections.filter(c => c.computerName !== computerName);
      
      // Refresh UI
      loadRemoteComputers();
    } else {
      showToast(`Failed to disconnect: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Disconnect error: ${error.message}`, 'error');
  }
}

// Start tunnel
async function startTunnel() {
  if (!isCloudflaredInstalled) {
    showToast('Please install cloudflared first', 'warning');
    return;
  }

  elements.startBtn.disabled = true;
  elements.startBtn.innerHTML = `
    <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
    </svg>
    <span>Starting...</span>
  `;

  try {
    const result = await window.electronAPI.startTunnel();
    if (result.success) {
      showToast('Tunnel started successfully', 'success');
    } else {
      showToast(`Failed to start tunnel: ${result.error}`, 'error');
      elements.startBtn.disabled = false;
    }
  } catch (error) {
    showToast(`Error: ${error.message}`, 'error');
    elements.startBtn.disabled = false;
  }

  elements.startBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polygon points="5 3 19 12 5 21 5 3"/>
    </svg>
    <span>Start Tunnel</span>
  `;
}

// Stop tunnel
async function stopTunnel() {
  elements.stopBtn.disabled = true;

  try {
    await window.electronAPI.stopTunnel();
    showToast('Tunnel stopped', 'success');
  } catch (error) {
    showToast(`Error stopping tunnel: ${error.message}`, 'error');
  }
}

// Install cloudflared
async function installCloudflared() {
  elements.installBtn.disabled = true;
  elements.installBtn.innerHTML = `
    <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
    </svg>
    <span>Installing...</span>
  `;

  try {
    const result = await window.electronAPI.installCloudflared();
    if (result.success) {
      showToast('Cloudflared installed successfully', 'success');
      await checkCloudflared();
    } else {
      showToast(`Installation failed: ${result.error}`, 'error');
    }
  } catch (error) {
    showToast(`Installation error: ${error.message}`, 'error');
  }

  elements.installBtn.disabled = false;
  elements.installBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>Install Cloudflared</span>
  `;
}

// Copy to clipboard
async function copyToClipboard() {
  if (!tunnelUrl) return;

  try {
    await window.electronAPI.copyToClipboard(tunnelUrl);
    showToast('Address copied to clipboard', 'success');
  } catch (error) {
    showToast('Failed to copy', 'error');
  }
}

// Settings modal
function openSettings() {
  elements.settingsModal.classList.add('active');
}

function closeSettingsModal() {
  elements.settingsModal.classList.remove('active');
}

async function saveSettings() {
  const newConfig = {
    githubToken: elements.githubToken.value.trim(),
    gistId: elements.gistId.value.trim(),
    computerName: elements.computerName.value.trim() || 'ComputerA',
    rdpPort: parseInt(elements.rdpPort.value) || 3389
  };

  try {
    await window.electronAPI.saveConfig(newConfig);
    config = newConfig;
    showToast('Settings saved', 'success');
    closeSettingsModal();
  } catch (error) {
    showToast('Failed to save settings', 'error');
  }
}

// Test GitHub Token
async function testToken() {
  const token = elements.githubToken.value.trim();
  
  if (!token) {
    showToast('Please enter a GitHub Token first', 'warning');
    return;
  }
  
  elements.testTokenBtn.disabled = true;
  elements.testTokenBtn.innerHTML = `
    <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
      <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
    </svg>
    <span>Testing...</span>
  `;
  
  elements.tokenStatus.innerHTML = '';
  elements.tokenStatus.className = 'token-status';
  
  try {
    // Save token first
    await window.electronAPI.saveConfig({
      githubToken: token,
      gistId: elements.gistId.value.trim(),
      computerName: elements.computerName.value.trim() || 'ComputerA',
      rdpPort: parseInt(elements.rdpPort.value) || 3389
    });
    
    // Validate token
    const result = await window.electronAPI.validateToken();
    
    if (result.success) {
      elements.tokenStatus.innerHTML = `<span class="status-success">✓ Token valid for user: ${result.user}</span>`;
      elements.tokenStatus.className = 'token-status success';
      showToast('Token is valid!', 'success');
    } else {
      elements.tokenStatus.innerHTML = `<span class="status-error">✗ ${result.error}</span>`;
      elements.tokenStatus.className = 'token-status error';
      showToast(result.error, 'error');
    }
  } catch (error) {
    elements.tokenStatus.innerHTML = `<span class="status-error">✗ ${error.message}</span>`;
    elements.tokenStatus.className = 'token-status error';
    showToast('Failed to test token', 'error');
  }
  
  elements.testTokenBtn.disabled = false;
  elements.testTokenBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    <span>Test</span>
  `;
}

// Toast notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };

  toast.innerHTML = `
    ${icons[type] || icons.info}
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close">&times;</button>
  `;

  elements.toastContainer.appendChild(toast);

  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.remove();
  }, 5000);

  // Close button
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.remove();
  });
}

// Event listeners
function setupEventListeners() {
  // Tunnel controls
  elements.startBtn.addEventListener('click', startTunnel);
  elements.stopBtn.addEventListener('click', stopTunnel);
  elements.copyBtn.addEventListener('click', copyToClipboard);

  // Cloudflared
  elements.installBtn.addEventListener('click', installCloudflared);

  // Settings
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.closeSettings.addEventListener('click', closeSettingsModal);
  elements.cancelSettings.addEventListener('click', closeSettingsModal);
  elements.saveSettings.addEventListener('click', saveSettings);
  elements.testTokenBtn.addEventListener('click', testToken);
  elements.getTokenLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.electronAPI.openExternal('https://github.com/settings/tokens/new?scopes=gist');
  });

  // Refresh
  elements.refreshBtn.addEventListener('click', manualRefreshRemotes);

  // Close modal on overlay click
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elements.settingsModal.classList.contains('active')) {
      closeSettingsModal();
    }
  });
}

// IPC listeners
function setupIPCListeners() {
  // Tunnel started
  window.electronAPI.onTunnelStarted((event, data) => {
    isTunnelRunning = true;
    tunnelUrl = data.url;
    updateStatusUI();
    loadRemoteComputers();
  });

  // Tunnel stopped
  window.electronAPI.onTunnelStopped((event, data) => {
    isTunnelRunning = false;
    tunnelUrl = null;
    updateStatusUI();
  });

  // Remote computers updated
  window.electronAPI.onRemoteComputersUpdated((event, computers) => {
    renderRemoteComputers(computers);
  });

  // Tray toggle
  window.electronAPI.onTrayToggleTunnel(() => {
    if (isTunnelRunning) {
      stopTunnel();
    } else {
      startTunnel();
    }
  });
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  if (!timestamp) return 'Unknown';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const minutes = Math.floor(diff / 60000);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }

  // Default to date
  return date.toLocaleDateString();
}

// Add spinner animation styles
const style = document.createElement('style');
style.textContent = `
  .spinner {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Start the app
document.addEventListener('DOMContentLoaded', init);
