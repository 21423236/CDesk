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
    giteeToken: '',
    giteeUsername: '',
    giteeRepo: 'rdp-tunnel-config',
    configFilePath: 'rdp-tunnel.json',
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
let activeProxyProcesses = []; // Store active proxy processes for remote connections

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

// Validate Gitee Token
async function validateGiteeToken() {
  const token = store.get('giteeToken');
  const username = store.get('giteeUsername');
  
  if (!token) {
    throw new Error('Gitee Token not configured. Please set it in Settings.');
  }
  
  if (!username) {
    throw new Error('Gitee Username not configured. Please set it in Settings.');
  }
  
  return new Promise((resolve, reject) => {
    const url = `https://gitee.com/api/v5/user?access_token=${token}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`Token validation: Status ${res.statusCode}`);
        
        if (res.statusCode === 401) {
          reject(new Error('Gitee Token is invalid or expired. Please get a new token from https://gitee.com/profile/personal_access_tokens'));
          return;
        }
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const user = JSON.parse(data);
            if (user.login === username) {
              console.log(`Token valid for user: ${user.login}`);
              resolve({ valid: true, user: user.login });
            } else {
              reject(new Error(`Token belongs to user '${user.login}', but configured username is '${username}'`));
            }
          } catch (e) {
            reject(new Error('Invalid response from Gitee'));
          }
        } else {
          reject(new Error(`Gitee API returned status ${res.statusCode}`));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });
  });
}

// Gitee API helpers
async function giteeApiRequest(method, filePath, body = null) {
  const token = store.get('giteeToken');
  const username = store.get('giteeUsername');
  const repo = store.get('giteeRepo');
  
  if (!token || !username || !repo) {
    throw new Error('Gitee configuration incomplete');
  }
  
  const url = `https://gitee.com/api/v5/repos/${username}/${repo}/contents/${filePath}`;
  
  return new Promise((resolve, reject) => {
    let requestUrl = url;
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Node.js-RDP-Tunnel-Manager/1.0'
      }
    };
    
    let requestBody = null;
    
    if (method === 'GET') {
      requestUrl += `?access_token=${token}&ref=master`;
    } else {
      const bodyWithToken = { ...body, access_token: token };
      requestBody = JSON.stringify(bodyWithToken);
      console.log('Gitee API PUT URL:', requestUrl);
      console.log('Gitee API PUT Body:', JSON.stringify(bodyWithToken, null, 2));
      options.headers['Content-Length'] = Buffer.byteLength(requestBody);
    }
    
    const req = https.request(requestUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`Gitee API Response: Status ${res.statusCode} for ${method} ${filePath}`);
        
        if (!data || data.trim() === '') {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true });
          } else {
            reject(new Error(`Empty response from Gitee API (Status: ${res.statusCode})`));
          }
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            console.log('Gitee API Error Response:', JSON.stringify(parsed, null, 2));
            const errorMsg = parsed.message || parsed.error || `HTTP ${res.statusCode}`;
            console.log('Gitee API Error:', errorMsg);
            reject(new Error(errorMsg));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Gitee API error: ${data.substring(0, 100)}`));
          }
        }
      });
    });
    
    req.on('error', (error) => {
      console.log('Gitee API Request Error:', error.message);
      reject(new Error(`Network error: ${error.message}`));
    });
    
    if (requestBody) {
      req.write(requestBody);
    }
    req.end();
  });
}

// Initialize config file in repository
async function initConfigFile() {
  const configFilePath = store.get('configFilePath');
  
  try {
    const file = await giteeApiRequest('GET', configFilePath);
    
    console.log('GET file response type:', typeof file);
    console.log('GET file response:', JSON.stringify(file, null, 2).substring(0, 500));
    console.log('file.sha:', file.sha);
    
    // File doesn't exist (Gitee returns empty array)
    if (Array.isArray(file) && file.length === 0) {
      console.log('Config file not found, creating new one...');
      
      const initialContent = {
        lastUpdated: new Date().toISOString(),
        computers: {}
      };
      
      const body = {
        message: 'Initialize RDP Tunnel Config',
        content: Buffer.from(JSON.stringify(initialContent, null, 2)).toString('base64')
      };
      
      const result = await giteeApiRequest('POST', configFilePath, body);
      console.log('Config file created');
      return result.content;
    }

    // File exists (returns object with sha)
    if (file && file.sha) {
      console.log('Config file exists, SHA:', file.sha);
      return file;
    }
    
    // Fallback: treat as file not found
    console.log('Unexpected response format, treating as file not found');
    throw new Error('Unexpected response format from Gitee');
  } catch (error) {
    console.log('Config file not found, creating new one...');
    
    const initialContent = {
      lastUpdated: new Date().toISOString(),
      computers: {}
    };
    
    const body = {
      message: 'Initialize RDP Tunnel Config',
      content: Buffer.from(JSON.stringify(initialContent, null, 2)).toString('base64'),
      ref: 'master'
    };
    
    const result = await giteeApiRequest('POST', configFilePath, body);
    console.log('Config file created');
    return result.content;
  }
}

// Sync tunnel info with repository
async function syncWithRepo() {
  if (!tunnelUrl) return;
  
  const computerName = store.get('computerName');
  const rdpPort = store.get('rdpPort');
  const configFilePath = store.get('configFilePath');
  
  try {
    const file = await giteeApiRequest('GET', configFilePath);
    const content = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
    
    content.lastUpdated = new Date().toISOString();
    content.computers[computerName] = {
      url: tunnelUrl,
      timestamp: new Date().toISOString(),
      port: rdpPort
    };
    
    const body = {
      message: `Update tunnel info for ${computerName}`,
      content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
      sha: file.sha,
      ref: 'master'
    };
    
    await giteeApiRequest('PUT', configFilePath, body);
    console.log('Synced tunnel info to Gitee repo');
  } catch (error) {
    console.error('Failed to sync with repo:', error);
    throw error;
  }
}

// Get remote computers from repository
async function getRemoteComputers() {
  const computerName = store.get('computerName');
  const configFilePath = store.get('configFilePath');
  
  try {
    const file = await giteeApiRequest('GET', configFilePath);
    
    // Empty array means file doesn't exist
    if (Array.isArray(file) && file.length === 0) {
      return [];
    }
    
    const content = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
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
    // Validate Gitee Token first
    console.log('Validating Gitee Token...');
    await validateGiteeToken();
    console.log('Gitee Token validated successfully');

    // Initialize config file
    await initConfigFile();

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

        // Update repository
        syncWithRepo();

        // Start refresh interval
        startRefreshInterval();

        // Immediately get remote computers list
        getRemoteComputers().then(remoteComputers => {
          if (mainWindow) {
            mainWindow.webContents.send('remote-computers-updated', remoteComputers);
          }
        }).catch(error => {
          console.error('Failed to get remote computers:', error);
        });

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
          syncWithRepo();
          startRefreshInterval();

          // Immediately get remote computers list
          getRemoteComputers().then(remoteComputers => {
            if (mainWindow) {
              mainWindow.webContents.send('remote-computers-updated', remoteComputers);
            }
          }).catch(error => {
            console.error('Failed to get remote computers:', error);
          });

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
        await syncWithRepo();

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

// Find available local port for proxy
async function findAvailablePort(startPort = 3390, endPort = 3400) {
  const net = require('net');
  
  for (let port = startPort; port <= endPort; port++) {
    try {
      await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            reject(err);
          } else {
            reject(err);
          }
        });
        server.once('listening', () => {
          server.close();
          resolve();
        });
        server.listen(port);
      });
      console.log(`Found available port: ${port}`);
      return port;
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is in use, trying next port`);
        continue;
      }
      throw err;
    }
  }
  
  throw new Error(`No available port found between ${startPort} and ${endPort}`);
}

// Cleanup all active proxy processes
function cleanupProxyProcesses() {
  console.log(`Cleaning up ${activeProxyProcesses.length} active proxy processes`);
  
  activeProxyProcesses.forEach(proxy => {
    try {
      if (proxy.process && !proxy.process.killed) {
        proxy.process.kill('SIGTERM');
        console.log(`Killed proxy for ${proxy.computerName} on port ${proxy.localPort}`);
      }
    } catch (e) {
      console.error(`Failed to kill proxy for ${proxy.computerName}:`, e.message);
    }
  });
  
  activeProxyProcesses = [];
}

// Disconnect from specific remote computer
function disconnectFromRemote(computerName) {
  const proxy = activeProxyProcesses.find(p => p.computerName === computerName);
  
  if (proxy) {
    try {
      if (proxy.process && !proxy.process.killed) {
        proxy.process.kill('SIGTERM');
        console.log(`Disconnected from ${computerName}`);
      }
      activeProxyProcesses = activeProxyProcesses.filter(p => p.computerName !== computerName);
      return { success: true };
    } catch (e) {
      console.error(`Failed to disconnect from ${computerName}:`, e.message);
      return { success: false, error: e.message };
    }
  }
  
  return { success: false, error: 'No active connection found for this computer' };
}

// Connect to remote computer
async function connectToRemote(computer) {
  try {
    // 0. Validate URL
    if (!computer.url || !computer.url.startsWith('https://')) {
      return { success: false, error: 'Remote computer URL is invalid or empty. Ask the remote user to restart their tunnel.' };
    }

    console.log(`Connecting to remote computer: ${computer.name}`);
    console.log(`Remote URL: ${computer.url}`);

    // Check URL freshness (warn if older than 10 minutes)
    if (computer.timestamp) {
      const urlAge = Date.now() - new Date(computer.timestamp).getTime();
      if (urlAge > 10 * 60 * 1000) {
        console.log(`Warning: Remote URL is ${Math.round(urlAge / 60000)} minutes old. It may be stale.`);
      }
    }
    
    // 1. Parse remote hostname
    const remoteHostname = computer.url.replace(/^https?:\/\//, '');
    console.log(`Remote hostname: ${remoteHostname}`);
    
    // 2. Find available local port for proxy
    const localPort = await findAvailablePort(3390, 3400);
    console.log(`Assigned local port: ${localPort}`);
    
    // 3. Start cloudflared access TCP proxy
    console.log('Starting cloudflared access TCP proxy...');
    const proxyProcess = spawn('cloudflared', [
      'access',
      'tcp',
      '--hostname', remoteHostname,
      '--url', `localhost:${localPort}`
    ], {
      windowsHide: true,
      detached: false
    });
    
    // 4. Monitor proxy startup
    let proxyReady = false;
    let proxyError = null;
    let stderrBuffer = '';
    let stdoutBuffer = '';
    
    proxyProcess.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutBuffer += output;
      console.log(`Proxy stdout: ${output}`);
      
      if (output.includes('Start Websocket listener') || 
          output.includes('Connection ready') ||
          output.includes('Proxy started')) {
        proxyReady = true;
      }
    });
    
    proxyProcess.stderr.on('data', (data) => {
      const output = data.toString();
      stderrBuffer += output;
      console.log(`Proxy stderr: ${output}`);
      
      // Check for ready indicators in stderr (cloudflared logs to stderr)
      if (output.includes('Start Websocket listener') ||
          output.includes('Connection established') ||
          output.includes('Registered tunnel connection')) {
        proxyReady = true;
      }
      
      // Check for actual errors (not just informational messages)
      if (output.includes('ERR ') || output.includes('error:') || 
          output.includes('failed:') || output.includes('unable to') ||
          output.includes('tunnel') && output.includes('not found')) {
        proxyError = output.trim();
      }
    });
    
    proxyProcess.on('error', (err) => {
      console.error('Proxy process error:', err);
      proxyError = err.message;
    });
    
    proxyProcess.on('close', (code) => {
      console.log(`Proxy process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        // Use stderr content as error message if available, otherwise generic message
        const stderrMsg = stderrBuffer.trim();
        if (stderrMsg) {
          // Extract the most relevant error line (last non-empty line with content)
          const errorLines = stderrMsg.split('\n').filter(l => l.trim().length > 0);
          const lastLine = errorLines[errorLines.length - 1] || stderrMsg.substring(0, 200);
          proxyError = `cloudflared error: ${lastLine.trim()}`;
        } else {
          proxyError = `Proxy exited with code ${code}. The remote tunnel may be offline or unreachable.`;
        }
      }
    });
    
    // 5. Wait for proxy to be ready (max 10 seconds)
    console.log('Waiting for proxy to be ready...');
    const startTime = Date.now();
    const maxWaitTime = 10000; // 10 seconds
    
    while (!proxyReady && !proxyError) {
      if (Date.now() - startTime > maxWaitTime) {
        proxyProcess.kill();
        throw new Error('Proxy failed to start within 10 seconds');
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (proxyError) {
      proxyProcess.kill();
      throw new Error(`Proxy error: ${proxyError}`);
    }
    
    console.log(`Proxy is ready on localhost:${localPort}`);
    
    // 6. Create RDP file connecting to local proxy
    const rdpFile = path.join(appDataPath, `remote-${computer.name}.rdp`);
    const rdpContent = `full address:s:localhost:${localPort}
username:s:
prompt for credentials:i:1
authentication level:i:2
enablecredsspsupport:i:1
`;
    
    fs.writeFileSync(rdpFile, rdpContent, 'ascii');
    console.log(`Created RDP file: ${rdpFile}`);
    
    // 7. Launch RDP client
    console.log('Launching mstsc.exe...');
    const rdpProcess = spawn('mstsc.exe', [rdpFile], {
      windowsHide: false,
      detached: true
    });
    
    // 8. Store proxy process for later cleanup
    activeProxyProcesses.push({
      process: proxyProcess,
      computerName: computer.name,
      localPort: localPort,
      remoteUrl: computer.url,
      startTime: new Date()
    });
    
    console.log(`Successfully connected to ${computer.name} via localhost:${localPort}`);
    
    return { 
      success: true, 
      localPort,
      message: `Connected to ${computer.name} on port ${localPort}`
    };
  } catch (error) {
    console.error('Connection error:', error);
    return { success: false, error: error.message };
  }
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  return {
    giteeToken: store.get('giteeToken'),
    giteeUsername: store.get('giteeUsername'),
    giteeRepo: store.get('giteeRepo'),
    configFilePath: store.get('configFilePath'),
    computerName: store.get('computerName'),
    rdpPort: store.get('rdpPort')
  };
});

ipcMain.handle('save-config', (event, config) => {
  store.set('giteeToken', config.giteeToken);
  store.set('giteeUsername', config.giteeUsername);
  store.set('giteeRepo', config.giteeRepo || 'rdp-tunnel-config');
  store.set('configFilePath', config.configFilePath || 'rdp-tunnel.json');
  store.set('computerName', config.computerName);
  store.set('rdpPort', config.rdpPort);
  return { success: true };
});

ipcMain.handle('validate-token', async () => {
  try {
    const result = await validateGiteeToken();
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

ipcMain.handle('disconnect-from-remote', async (event, computerName) => {
  return disconnectFromRemote(computerName);
});

ipcMain.handle('get-active-connections', () => {
  return activeProxyProcesses.map(proxy => ({
    computerName: proxy.computerName,
    localPort: proxy.localPort,
    remoteUrl: proxy.remoteUrl,
    startTime: proxy.startTime
  }));
});

ipcMain.handle('manual-refresh-remotes', async () => {
  console.log('Manual refresh triggered by user');
  await syncWithRepo();
  return { success: true };
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
  cleanupProxyProcesses();
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
