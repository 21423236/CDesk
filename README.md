# RDP Tunnel Manager | RDP 隧道管理器

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)]()
[![Electron](https://img.shields.io/badge/Electron-28.0.0-blue.svg)]()

A complete Electron desktop application for managing RDP tunnels via Cloudflared, with GitHub Gist synchronization for seamless multi-computer connectivity.

一个基于 Electron 的桌面应用，通过 Cloudflared 管理 RDP 隧道，并利用 GitHub Gist 同步实现多电脑无缝连接。

---

## Features | 功能特性

### English

- **One-click tunnel management** - Start/stop tunnels with a single button
- **Visual tunnel status** - Animated pulse indicator showing connection state
- **Remote computer list** - See and connect to other computers with one click
- **Auto-install cloudflared** - Detects and installs cloudflared automatically via winget
- **System tray integration** - Minimize to tray, control from tray menu
- **Persistent configuration** - Settings saved between sessions
- **GitHub Gist sync** - Share tunnel addresses via private GitHub Gists
- **Secure tunneling** - RDP traffic encrypted through Cloudflare Tunnel

### 中文

- **一键隧道管理** - 单击按钮即可启动/停止隧道
- **可视化状态显示** - 动态脉冲指示器显示连接状态
- **远程电脑列表** - 一键查看并连接其他电脑
- **自动安装 cloudflared** - 自动检测并通过 winget 安装
- **系统托盘集成** - 最小化到托盘，从托盘菜单控制
- **持久化配置** - 设置在会话间保存
- **GitHub Gist 同步** - 通过私有 Gist 共享隧道地址
- **安全隧道** - RDP 流量通过 Cloudflare Tunnel 加密

---

## Screenshots | 截图

> Coming soon | 即将添加

---

## Prerequisites | 系统要求

| Requirement | Description |
|-------------|-------------|
| Operating System | Windows 10/11 |
| Node.js | Version 18+ |
| GitHub Account | For Gist synchronization |
| RDP Enabled | Windows Remote Desktop must be enabled |

| 要求 | 描述 |
|------|------|
| 操作系统 | Windows 10/11 |
| Node.js | 版本 18+ |
| GitHub 账户 | 用于 Gist 同步 |
| RDP 已启用 | Windows 远程桌面必须启用 |

---

## Installation | 安装指南

### English

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/rdp-tunnel-manager.git
cd rdp-tunnel-manager
```

2. Install dependencies:
```bash
npm install
```

If Electron fails to download due to network issues, try:
```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install
```

3. Run the application:
```bash
npm start
```

### 中文

1. 克隆仓库：
```bash
git clone https://github.com/YOUR_USERNAME/rdp-tunnel-manager.git
cd rdp-tunnel-manager
```

2. 安装依赖：
```bash
npm install
```

如果 Electron 因网络问题下载失败，请尝试：
```bash
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install
```

3. 运行应用：
```bash
npm start
```

---

## Configuration | 配置说明

### English

On first run, configure the following in Settings (gear icon):

| Setting | Description | Example |
|---------|-------------|---------|
| GitHub Token | Personal access token with `gist` scope | Create at https://github.com/settings/tokens/new?scopes=gist |
| Computer Name | Unique identifier for this computer | `ComputerA`, `Office-PC`, `Home-Laptop` |
| RDP Port | Local RDP port (usually 3389) | `3389` (default) |

### 中文

首次运行时，在设置（齿轮图标）中配置以下内容：

| 设置项 | 描述 | 示例 |
|--------|------|------|
| GitHub Token | 具有 `gist` 权限的个人访问令牌 | 在 https://github.com/settings/tokens/new?scopes=gist 创建 |
| 电脑名称 | 此电脑的唯一标识符 | `ComputerA`、`办公室电脑`、`家用笔记本` |
| RDP 端口 | 本地 RDP 端口（通常为 3389） | `3389`（默认） |

---

## Usage | 使用方法

### English

1. **Configure Settings** - Click gear icon, enter GitHub Token and Computer Name
2. **Start Tunnel** - Click "Start Tunnel" button, wait for tunnel URL
3. **View Remote Computers** - Other computers appear automatically in the list
4. **Connect to Remote** - Click "Connect" button to launch Remote Desktop
5. **Stop Tunnel** - Click "Stop Tunnel" when finished

### 中文

1. **配置设置** - 点击齿轮图标，输入 GitHub Token 和电脑名称
2. **启动隧道** - 点击"启动隧道"按钮，等待隧道 URL 出现
3. **查看远程电脑** - 其他电脑会自动出现在列表中
4. **连接远程** - 点击"连接"按钮启动远程桌面
5. **停止隧道** - 完成后点击"停止隧道"

---

## Build for Distribution | 构建分发版本

### Portable EXE | 便携版

```bash
npm run dist
```

Output: `dist/RDP Tunnel Manager.exe` (no installation needed)

输出：`dist/RDP Tunnel Manager.exe`（无需安装）

### Windows Installer | 安装包

```bash
npm run build
```

Output: `dist/RDP Tunnel Manager Setup.exe`

输出：`dist/RDP Tunnel Manager Setup.exe`

---

## Project Structure | 项目结构

```
rdp-tunnel-app/
├── main.js              # Electron main process | Electron 主进程
├── preload.js           # IPC bridge | IPC 桥接
├── package.json         # Dependencies and build config | 依赖和构建配置
├── renderer/
│   ├── index.html       # UI markup | UI 标记
│   ├── styles.css       # Industrial dark theme | 工业深色主题
│   └── renderer.js      # Frontend logic | 前端逻辑
└── assets/
    ├── icon.svg         # App icon source | 应用图标源文件
    └── *.png            # Generated icons | 生成的图标
```

---

## Architecture | 系统架构

```
┌─────────────────────────────────────────┐
│  Electron App (Computer A)              │
│  Electron 应用（电脑 A）                 │
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Main Process │───▶│ cloudflared  │  │
│  │ 主进程       │    │   tunnel     │  │
│  └──────────────┘    └──────────────┘  │
│         │                               │
│         ▼                               │
│  ┌──────────────┐                       │
│  │ GitHub Gist  │◀─────────────────┐   │
│  │   API Sync   │                  │   │
│  │   API 同步   │                  │   │
│  └──────────────┘                  │   │
└─────────│───────────────────────────│───┘
          │                           │
          ▼                           │
   ┌──────────────┐                   │
   │  Gist JSON   │                   │
   │  Gist JSON   │                   │
   │  (Addresses) │                   │
   │  (地址列表)  │                   │
   └──────────────┘                   │
          │                           │
          ▼                           ▼
┌─────────────────────────────────────────┐
│  Electron App (Computer B)              │
│  Electron 应用（电脑 B）                 │
│                                         │
│  Reads Gist → Shows Computer A address  │
│  读取 Gist → 显示电脑 A 的地址          │
│                                         │
└─────────────────────────────────────────┘
```

---

## Troubleshooting | 故障排除

### English

| Issue | Solution |
|-------|----------|
| Cloudflared not found | Click "Install Cloudflared" or run `winget install Cloudflare.cloudflared` |
| Tunnel won't start | Check RDP port (3389) is not blocked by firewall |
| Remote computers not appearing | Ensure both computers use the same GitHub Token |
| RDP connection failed | Enable Remote Desktop: Right-click "This PC" → Properties → Remote Desktop |
| Tunnel address not showing | Wait 10-15 seconds for tunnel initialization |

### 中文

| 问题 | 解决方案 |
|------|----------|
| 找不到 cloudflared | 点击"安装 Cloudflared"或运行 `winget install Cloudflare.cloudflared` |
| 隧道无法启动 | 检查 RDP 端口（3389）是否被防火墙阻止 |
| 远程电脑未出现 | 确保两台电脑使用相同的 GitHub Token |
| RDP 连接失败 | 启用远程桌面：右键"此电脑" → 属性 → 远程桌面 |
| 隧道地址未显示 | 等待 10-15 秒让隧道初始化 |

---

## File Locations | 文件位置

| Type | Windows Path |
|------|--------------|
| Configuration | `%APPDATA%\rdp-tunnel-manager\rdp-tunnel-config.json` |
| Logs | `%APPDATA%\rdp-tunnel-manager\logs\` |
| Built EXE | `dist\RDP Tunnel Manager.exe` |

| 类型 | Windows 路径 |
|------|--------------|
| 配置文件 | `%APPDATA%\rdp-tunnel-manager\rdp-tunnel-config.json` |
| 日志文件 | `%APPDATA%\rdp-tunnel-manager\logs\` |
| 构建输出 | `dist\RDP Tunnel Manager.exe` |

---

## Security Notes | 安全说明

### English

- GitHub Token must have `gist` permission only (minimal scope recommended)
- Token is stored locally using electron-store
- RDP traffic is encrypted via Cloudflare Tunnel (HTTPS)
- No passwords are stored - Windows prompts for credentials at connection
- Recommended: Use strong Windows user password

### 中文

- GitHub Token 只需 `gist` 权限（建议最小权限范围）
- Token 使用 electron-store 本地存储
- RDP 流量通过 Cloudflare Tunnel 加密（HTTPS）
- 不存储密码 - 连接时 Windows 会提示输入凭据
- 建议：使用强 Windows 用户密码

---

## Design | 设计风格

- **Theme**: Industrial/Utilitarian with Tech Edge | 工业实用风格
- **Colors**: Dark background (#0d1117) with Cyan accent (#00d4ff) | 深色背景配青色强调色
- **Typography**: JetBrains Mono + Space Grotesk | JetBrains Mono + Space Grotesk 字体
- **Features**: Animated status pulse, smooth transitions | 动态状态脉冲、平滑过渡

---

## Tech Stack | 技术栈

- **Electron** v28.0.0 - Desktop application framework
- **electron-store** v8.1.0 - Configuration persistence
- **electron-builder** - Build and distribution
- **Cloudflared** - Tunnel creation
- **GitHub API** - Gist synchronization

---

## Keyboard Shortcuts | 键盘快捷键

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy tunnel address |
| `Ctrl+R` | Refresh remote computers list |
| `Escape` | Close settings modal |

| 快捷键 | 操作 |
|--------|------|
| `Ctrl+C` | 复制隧道地址 |
| `Ctrl+R` | 刷新远程电脑列表 |
| `Escape` | 关闭设置窗口 |

---

## Contributing | 贡献指南

Contributions are welcome! Please feel free to submit a Pull Request.

欢迎贡献！请随时提交 Pull Request。

---

## License | 许可证

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

本项目采用 MIT 许可证 - 详情见 [LICENSE](LICENSE) 文件。

---

## Author | 作者

RDP Tunnel Manager Team

---

## Acknowledgments | 致谢

- [Cloudflare](https://www.cloudflare.com/) for tunnel infrastructure
- [Electron](https://www.electronjs.org/) for desktop framework
- [GitHub](https://github.com/) for Gist API