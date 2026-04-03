# RDP Tunnel Manager - User Guide

## Quick Start

### Launch the Application

Double-click the desktop shortcut or run:

```powershell
cd C:\Users\Alucard\Desktop\CDesk\rdp-tunnel-app
npm start
```

---

## Interface Overview

### Main Window

The application features a clean, industrial-themed interface with:

1. **Status Section** (Top)
   - Connection status indicator (animated pulse when connected)
   - Tunnel address display (copy button)
   - Start/Stop buttons

2. **Remote Computers List** (Middle)
   - Shows online computers synced via GitHub Gist
   - One-click connect buttons
   - Computer name and timestamp

3. **Settings Panel** (Click gear icon)
   - GitHub Token configuration
   - Computer name setting
   - RDP port configuration

---

## How to Use

### Step 1: Configure Settings (First Run)

1. Click the **gear icon** in the top-right corner
2. Enter your **GitHub Token** (create at https://github.com/settings/tokens/new?scopes=gist)
3. Set your **Computer Name** (e.g., `ComputerA`, `ComputerB`)
4. Click **Save**

### Step 2: Start Tunnel

1. Click **"Start Tunnel"** button
2. Application will:
   - Check and install cloudflared if missing
   - Create tunnel connection
   - Display tunnel address (e.g., `https://xxx.trycloudflare.com`)
   - Sync address to GitHub Gist
3. Status indicator turns **green** with animated pulse

### Step 3: Connect to Remote Computer

1. Wait for remote computer to appear in "Remote Computers" list
2. Click **"Connect"** button next to the computer
3. Windows Remote Desktop (mstsc.exe) will launch automatically

### Step 4: Stop Tunnel

- Click **"Stop Tunnel"** button when done
- Application will clean up processes and remove address from Gist

---

## Features

### Auto-Install cloudflared

If cloudflared is not installed, the application will:
1. Show installation prompt
2. Install via `winget install Cloudflare.cloudflared`
3. Proceed with tunnel startup

### Address Sync

All computers using the same GitHub Token will:
- Share tunnel addresses via GitHub Gist
- Automatically appear in each other's "Remote Computers" list
- No manual address sharing needed

### System Tray (Optional)

- Close window to minimize to tray
- Right-click tray icon for quick actions
- Click tray icon to restore window

---

## Distribution

### Build Portable EXE

```powershell
cd C:\Users\Alucard\Desktop\CDesk\rdp-tunnel-app
npm run dist
```

Output: `dist/RDP Tunnel Manager.exe` (portable, no installation needed)

### Build Installer

```powershell
npm run build
```

Output: `dist/RDP Tunnel Manager Setup.exe` (Windows installer)

---

## Troubleshooting

### "cloudflared not found"

- Click **"Start Tunnel"** → Application will auto-install
- Or manually install: `winget install Cloudflare.cloudflared`

### "Tunnel address not showing"

- Wait 10-15 seconds for tunnel to initialize
- Check logs in `%APPDATA%/rdp-tunnel-manager/logs/`

### "Remote computer not appearing"

- Ensure both computers use the **same GitHub Token**
- Ensure both computers have **different Computer Names**
- Click "Refresh" button in Remote Computers section

### "RDP connection failed"

- Ensure Windows Remote Desktop is enabled on target computer
- Right-click "This PC" → Properties → Remote Desktop → Enable
- Check firewall settings

---

## Configuration Storage

Settings are saved in:
- Windows: `%APPDATA%/rdp-tunnel-manager/rdp-tunnel-config.json`

Logs are saved in:
- Windows: `%APPDATA%/rdp-tunnel-manager/logs/`

---

## Keyboard Shortcuts

- **Ctrl+C**: Copy tunnel address (when tunnel is running)
- **Ctrl+R**: Refresh remote computers list
- **Escape**: Close settings modal

---

## Security Notes

- GitHub Token must have `gist` permission
- Token is stored locally in encrypted format (electron-store)
- RDP traffic is encrypted via Cloudflare Tunnel
- Recommended: Use strong Windows user password

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron App (Your Computer)           │
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Main Process │───▶│ cloudflared  │  │
│  │ (Node.js)    │    │   tunnel     │  │
│  └──────────────┘    └──────────────┘  │
│         │                               │
│         ▼                               │
│  ┌──────────────┐                       │
│  │ GitHub Gist  │◀─────────────────┐   │
│  │   API Sync   │                  │   │
│  └──────────────┘                  │   │
│         │                           │   │
└─────────│───────────────────────────│───┘
          │                           │
          ▼                           │
   ┌──────────────┐                   │
   │  Gist JSON   │                   │
   │  (Addresses) │                   │
   └──────────────┘                   │
          │                           │
          │                           │
          ▼                           ▼
┌─────────────────────────────────────────┐
│  Electron App (Remote Computer)         │
│                                         │
│  Reads Gist → Shows your address        │
│  Writes its address → You see it        │
│                                         │
└─────────────────────────────────────────┘
```

---

## Next Steps

1. **Test on Two Computers**: Install app on both, configure different computer names
2. **Build EXE**: Run `npm run dist` to create portable executable
3. **Share**: Distribute the EXE to other computers

---

## Support

For issues or questions:
- Check logs in `%APPDATA%/rdp-tunnel-manager/logs/`
- GitHub repository: (link would be added here)
- Documentation: `README.md`