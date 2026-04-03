const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, shell } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const Store = require('electron-store');

// Configuration store
const store = new Store({
  name: 'rdp-tunnel-config',
  defaults: {
    githubToken: '',
    gistId: '',
    computerName: 'ComputerA',
    rdpPort: 3389
  }
});

// Global state
let mainWindow = null;
let tray = null;
let tunnelProcess = null;
let tunnelUrl = null;
let isTunnelRunning = false;
let refreshInterval = null;

// Paths
const appDataPath = app.getPath('userData');
const logPath = path.join(appDataPath, 'logs');
const outputLogPath = path.join(logPath, 'tunnel-output.log');
const errorLogPath = path.join(logPath, 'tunnel-error.log');

// Ensure log directory exists
if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
}

// Create main window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window close
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create system tray
function createTray() {
  // Check if tray icon exists and is valid
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const iconActivePath = path.join(__dirname, 'assets', 'tray-icon-active.png');

  // Skip tray if icons don't exist or are empty
  if (!fs.existsSync(iconPath) || fs.statSync(iconPath).size === 0) {
    console.log('Tray icon not found or empty, skipping tray creation');
    return;
  }

  try {
    tray = new Tray(iconPath);
  } catch (error) {
    console.log('Failed to create tray:', error.message);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: 'Tunnel Status',
      submenu: [
        {
          label: isTunnelRunning ? 'Running' : 'Stopped',
          enabled: false
        },
        {
          label: tunnelUrl || 'No URL',
          enabled: false
        },
        { type: 'separator' },
        {
          label: isTunnelRunning ? 'Stop Tunnel' : 'Start Tunnel',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('tray-toggle-tunnel');
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        stopTunnel();
        app.quit();
      }
    }
  ]);

  tray.setToolTip('RDP Tunnel Manager');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    } else {
      createMainWindow();
    }
  });
}

// Update tray menu
function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createMainWindow();
        }
      }
    },
    {
      label: 'Tunnel Status',
      submenu: [
        {
          label: isTunnelRunning ? '● Running' : '○ Stopped',
          enabled: false
        },
        {
          label: tunnelUrl ? `URL: ${tunnelUrl}` : 'No active tunnel',
          enabled: false
        },
        { type: 'separator' },
        {
          label: isTunnelRunning ? 'Stop Tunnel' : 'Start Tunnel',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('tray-toggle-tunnel');
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        stopTunnel();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  // Only update image if tray exists and icon files exist
  const iconName = isTunnelRunning ? 'tray-icon-active.png' : 'tray-icon.png';
  const iconPath = path.join(__dirname, 'assets', iconName);
  if (fs.existsSync(iconPath)) {
    tray.setImage(iconPath);
  }
}

// Check if cloudflared is installed
async function checkCloudflared() {
  return new Promise((resolve) => {
    exec('where cloudflared', (error) => {
      resolve(!error);
    });
  });
}

// Install cloudflared using winget
async function installCloudflared() {
  return new Promise((resolve, reject) => {
    const installProcess = spawn('winget', ['install', '--id', 'Cloudflare.cloudflared', '--accept-source-agreements', '--accept-package-agreements'], {
      windowsHide: true
    });

    let output = '';
    let errorOutput = '';

    installProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    installProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    installProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, message: 'Cloudflared installed successfully' });
      } else {
        reject(new Error(`Installation failed: ${errorOutput || output}`));
      }
    });

    installProcess.on('error', (error) => {
      reject(new Error(`Failed to start installation: ${error.message}`));
    });
  });
}

// Validate GitHub Token
async function validateGitHubToken() {
  const token = store.get('githubToken');
  
  if (!token || token === 'your_github_token_here') {
    throw new Error('GitHub Token not configured. Please set it in Settings.');
  }
  
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Node.js-RDP-Tunnel-Manager/1.0'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`Token validation: Status ${res.statusCode}`);
        
        if (res.statusCode === 401) {
          reject(new Error('GitHub Token is invalid or expired. Please get a new token from https://github.com/settings/tokens'));
          return;
        }
        
        if (res.statusCode === 403) {
          reject(new Error('GitHub Token lacks required permissions. Please ensure token has "gist" scope.'));
          return;
        }
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const user = JSON.parse(data);
            console.log(`Token valid for user: ${user.login}`);
            resolve({ valid: true, user: user.login });
          } catch (e) {
            reject(new Error('Invalid response from GitHub'));
          }
        } else {
          reject(new Error(`GitHub API returned status ${res.statusCode}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });
    
    req.end();
  });
}

// GitHub API helpers
async function githubApiRequest(urlPath, options = {}) {
  const token = store.get('githubToken');
  
  // Parse URL or use path
  const urlObj = urlPath.startsWith('http') ? new URL(urlPath) : null;
  const hostname = urlObj ? urlObj.hostname : 'api.github.com';
  const path = urlObj ? urlObj.pathname : urlPath;
  
  const requestOptions = {
    hostname: hostname,
    path: path,
    method: options.method || 'GET',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Node.js-RDP-Tunnel-Manager/1.0',
      ...options.headers
    }
  };

  // Add Content-Length for POST/PATCH requests
  if (options.body) {
    requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`GitHub API Response: Status ${res.statusCode}`);
        console.log(`Response headers:`, JSON.stringify(res.headers));
        console.log(`Response body (${data.length} bytes):`, data.substring(0, 500));
        
        // Handle empty response
        if (!data || data.trim() === '') {
          reject(new Error(`Empty response from GitHub API (Status: ${res.statusCode})`));
          return;
        }
        
        // Check if response is JSON
        if (!data.trim().startsWith('{') && !data.trim().startsWith('[')) {
          // Non-JSON response - likely an error message
          reject(new Error(`GitHub API error (Status ${res.statusCode}): ${data.trim()}`));
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const errorMsg = parsed.message || parsed.error || `HTTP ${res.statusCode}`;
            console.log('GitHub API Error:', errorMsg);
            reject(new Error(errorMsg));
          }
        } catch (e) {
          console.log('JSON Parse Error. Raw data:', data.substring(0, 200));
          reject(new Error(`JSON parse failed. Response: ${data.substring(0, 100)}`));
        }
      });
    });

    req.on('error', (error) => {
      console.log('GitHub API Request Error:', error.message);
      reject(new Error(`Network error: ${error.message}`));
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Create or get Gist
async function getOrCreateGist() {
  const gistId = store.get('gistId');

  if (gistId) {
    try {
      const gist = await githubApiRequest(`https://api.github.com/gists/${gistId}`);
      return gist;
    } catch (error) {
      console.log('Failed to get existing gist, creating new one');
    }
  }

  // Create new gist
  const body = JSON.stringify({
    description: 'RDP Tunnel Addresses - Auto Generated',
    public: false,
    files: {
      'rdp-tunnel.json': {
        content: JSON.stringify({
          lastUpdated: new Date().toISOString(),
          computers: {}
        }, null, 2)
      }
    }
  });

  const gist = await githubApiRequest('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body
  });

  store.set('gistId', gist.id);
  return gist;
}

// Update Gist with tunnel address
async function updateGistAddress(tunnelUrl) {
  const gistId = store.get('gistId');
  const computerName = store.get('computerName');
  const rdpPort = store.get('rdpPort');

  if (!gistId) return;

  // Get current content
  const gist = await githubApiRequest(`https://api.github.com/gists/${gistId}`);
  let content = {};
  try {
    content = JSON.parse(gist.files['rdp-tunnel.json'].content);
  } catch (e) {
    content = { computers: {} };
  }

  // Update with new data
  content.lastUpdated = new Date().toISOString();
  content.computers[computerName] = {
    url: tunnelUrl,
    timestamp: new Date().toISOString(),
    port: rdpPort
  };

  // Push update
  const body = JSON.stringify({
    files: {
      'rdp-tunnel.json': {
        content: JSON.stringify(content, null, 2)
      }
    }
  });

  await githubApiRequest(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body
  });
}

// Get remote computers from Gist
async function getRemoteComputers() {
  const gistId = store.get('gistId');
  const computerName = store.get('computerName');

  if (!gistId) return [];

  try {
    const gist = await githubApiRequest(`https://api.github.com/gists/${gistId}`);
    const content = JSON.parse(gist.files['rdp-tunnel.json'].content);
    const computers = [];

    for (const [name, data] of Object.entries(content.computers || {})) {
      if (name !== computerName) {
        computers.push({
          name,
          url: data.url,
          timestamp: data.timestamp,
          port: data.port
        });
      }
    }

    return computers;
  } catch (error) {
    console.error('Failed to get remote computers:', error);
    return [];
  }
}

// Start cloudflared tunnel
async function startTunnel() {
  if (isTunnelRunning) {
    return { success: false, error: 'Tunnel already running' };
  }

  const rdpPort = store.get('rdpPort');

  try {
    // Validate GitHub Token first
    console.log('Validating GitHub Token...');
    await validateGitHubToken();
    console.log('GitHub Token validated successfully');

    // Initialize Gist
    await getOrCreateGist();

    // Clear old logs
    if (fs.existsSync(outputLogPath)) fs.unlinkSync(outputLogPath);
    if (fs.existsSync(errorLogPath)) fs.unlinkSync(errorLogPath);

    // Start cloudflared process
    tunnelProcess = spawn('cloudflared', ['tunnel', '--url', `rdp://localhost:${rdpPort}`], {
      windowsHide: true
    });

    let urlFound = false;
    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

    // Monitor output for URL
    const checkForUrl = (data) => {
      const output = data.toString();
      fs.appendFileSync(outputLogPath, output);

      if (!urlFound && urlRegex.test(output)) {
        const match = output.match(urlRegex);
        tunnelUrl = match[0];
        urlFound = true;
        isTunnelRunning = true;

        // Update Gist
        updateGistAddress(tunnelUrl);

        // Start refresh interval
        startRefreshInterval();

        // Update UI
        if (mainWindow) {
          mainWindow.webContents.send('tunnel-started', { url: tunnelUrl });
        }
        updateTrayMenu();
      }
    };

    tunnelProcess.stdout.on('data', checkForUrl);
    tunnelProcess.stderr.on('data', (data) => {
      fs.appendFileSync(errorLogPath, data.toString());
      checkForUrl(data);
    });

    tunnelProcess.on('close', (code) => {
      isTunnelRunning = false;
      tunnelUrl = null;
      stopRefreshInterval();

      if (mainWindow) {
        mainWindow.webContents.send('tunnel-stopped', { code });
      }
      updateTrayMenu();
    });

    // Wait for URL (timeout after 60 seconds)
    let attempts = 0;
    const maxAttempts = 60;

    while (!urlFound && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;

      // Also check log files
      if (fs.existsSync(outputLogPath)) {
        const log = fs.readFileSync(outputLogPath, 'utf8');
        if (urlRegex.test(log)) {
          const match = log.match(urlRegex);
          tunnelUrl = match[0];
          urlFound = true;
          isTunnelRunning = true;
          updateGistAddress(tunnelUrl);
          startRefreshInterval();

          if (mainWindow) {
            mainWindow.webContents.send('tunnel-started', { url: tunnelUrl });
          }
          updateTrayMenu();
          break;
        }
      }
    }

    if (!urlFound) {
      stopTunnel();
      return { success: false, error: 'Failed to get tunnel URL within 60 seconds' };
    }

    return { success: true, url: tunnelUrl };
  } catch (error) {
    stopTunnel();
    return { success: false, error: error.message };
  }
}

// Stop tunnel
function stopTunnel() {
  stopRefreshInterval();

  if (tunnelProcess) {
    try {
      tunnelProcess.kill();
    } catch (e) {
      console.error('Error killing tunnel process:', e);
    }
    tunnelProcess = null;
  }

  isTunnelRunning = false;
  tunnelUrl = null;

  if (mainWindow) {
    mainWindow.webContents.send('tunnel-stopped', { code: 0 });
  }
  updateTrayMenu();
}

// Start refresh interval
function startRefreshInterval() {
  if (refreshInterval) return;

  refreshInterval = setInterval(async () => {
    if (isTunnelRunning && tunnelUrl) {
      try {
        await updateGistAddress(tunnelUrl);

        // Get remote computers
        const remoteComputers = await getRemoteComputers();
        if (mainWindow) {
          mainWindow.webContents.send('remote-computers-updated', remoteComputers);
        }
      } catch (error) {
        console.error('Refresh error:', error);
      }
    }
  }, 300000); // 5 minutes
}

// Stop refresh interval
function stopRefreshInterval() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Connect to remote computer
async function connectToRemote(computer) {
  try {
    const rdpFile = path.join(appDataPath, `remote-${computer.name}.rdp`);
    const rdpHost = computer.url.replace(/^https?:\/\//, '');

    const rdpContent = `full address:s:${rdpHost}
username:s:
prompt for credentials:i:1
authentication level:i:2
enablecredsspsupport:i:1
`;

    fs.writeFileSync(rdpFile, rdpContent, 'ascii');

    // Launch mstsc
    const rdpProcess = spawn('mstsc.exe', [rdpFile], {
      windowsHide: false,
      detached: true
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  return {
    githubToken: store.get('githubToken'),
    gistId: store.get('gistId'),
    computerName: store.get('computerName'),
    rdpPort: store.get('rdpPort')
  };
});

ipcMain.handle('save-config', (event, config) => {
  store.set('githubToken', config.githubToken);
  store.set('gistId', config.gistId);
  store.set('computerName', config.computerName);
  store.set('rdpPort', config.rdpPort);
  return { success: true };
});

ipcMain.handle('validate-token', async () => {
  try {
    const result = await validateGitHubToken();
    return { success: true, user: result.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-cloudflared', async () => {
  const installed = await checkCloudflared();
  return { installed };
});

ipcMain.handle('install-cloudflared', async () => {
  try {
    const result = await installCloudflared();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-tunnel', async () => {
  return await startTunnel();
});

ipcMain.handle('stop-tunnel', () => {
  stopTunnel();
  return { success: true };
});

ipcMain.handle('get-tunnel-status', () => {
  return {
    isRunning: isTunnelRunning,
    url: tunnelUrl
  };
});

ipcMain.handle('get-remote-computers', async () => {
  return await getRemoteComputers();
});

ipcMain.handle('connect-to-remote', async (event, computer) => {
  return await connectToRemote(computer);
});

ipcMain.handle('copy-to-clipboard', (event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  return { success: true };
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
  return { success: true };
});

// App event handlers
app.whenReady().then(() => {
  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep running in background with tray
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopTunnel();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
