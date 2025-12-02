# Cursor 2D Video Editor - Installation Guide

A powerful video editor for creating cursor animations and video overlays with Manim support.

## Table of Contents

- [Quick Start](#quick-start)
- [Downloading the App](#downloading-the-app)
- [Windows Installation](#windows-installation)
- [macOS Installation](#macos-installation)
- [Linux Installation](#linux-installation)
- [Backend Server Setup](#backend-server-setup)
- [Configuration](#configuration)
- [Building from Source](#building-from-source)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

1. Download the appropriate version for your OS from [Releases](https://github.com/yashpinjarkar10/Cursor_2D_Animation/releases)
2. Install and run the application
3. Start the Manim backend server (required for video generation)
4. Configure the backend URL in **Edit → Settings**

---

## Downloading the App

Go to the [Releases page](https://github.com/yashpinjarkar10/Cursor_2D_Animation/releases) and download the appropriate file for your operating system:

| OS | File | Description |
|---|---|---|
| **Windows** | `Cursor 2D Video Editor Setup *.exe` | Installer (recommended) |
| **Windows** | `Cursor 2D Video Editor *.exe` | Portable version (no installation) |
| **macOS** | `*.dmg` | macOS disk image |
| **Linux** | `*.AppImage` | Universal Linux package (recommended) |
| **Linux** | `*.deb` | Debian/Ubuntu package |
| **Linux** | `*.rpm` | Fedora/RHEL package |

---

## Windows Installation

### Option 1: Installer (Recommended)

1. Download `Cursor 2D Video Editor Setup *.exe`
2. Run the installer
3. Follow the installation wizard
4. Launch from Start Menu or Desktop shortcut

### Option 2: Portable Version

1. Download `Cursor 2D Video Editor *.exe`
2. Run directly - no installation needed
3. Settings are stored in `%APPDATA%\Cursor 2D Video Editor\`

### Windows Requirements

- Windows 10 or later (64-bit)
- 4GB RAM minimum
- 500MB free disk space

---

## macOS Installation

1. Download the `.dmg` file
2. Open the DMG file
3. Drag "Cursor 2D Video Editor" to the Applications folder
4. First launch: Right-click → Open (to bypass Gatekeeper)

### macOS Requirements

- macOS 10.15 (Catalina) or later
- Apple Silicon (M1/M2) or Intel processor
- 4GB RAM minimum

---

## Linux Installation

### AppImage (Universal - Recommended)

```bash
# Download the AppImage
chmod +x Cursor_2D_Video_Editor-*.AppImage
./Cursor_2D_Video_Editor-*.AppImage
```

### Debian/Ubuntu (.deb)

```bash
sudo dpkg -i cursor-2d-video-editor_*.deb
sudo apt-get install -f  # Install dependencies if needed
```

### Fedora/RHEL (.rpm)

```bash
sudo rpm -i cursor-2d-video-editor-*.rpm
# or with dnf
sudo dnf install cursor-2d-video-editor-*.rpm
```

### Linux Requirements

- Ubuntu 20.04+ / Fedora 35+ / or equivalent
- 4GB RAM minimum
- X11 or Wayland display server

---

## Backend Server Setup

The video editor requires a running Manim backend server for AI-powered video generation.

### Option 1: Local Backend (Recommended for Development)

1. Navigate to the backend folder:
   ```bash
   cd backend_graph
   ```

2. Install Python dependencies:
   ```bash
   pip install -r ../requirements.txt
   ```

3. Start the backend server:
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8000 --reload
   ```

4. The server will be available at `http://localhost:8000`

### Option 2: Remote Backend

If you have a remote Manim server:

1. Open the video editor
2. Go to **Edit → Settings** (or press `Ctrl+,` / `Cmd+,`)
3. Enter your backend URL (e.g., `http://your-server:8000`)
4. Click **Save**

### Backend Requirements

- Python 3.9+
- Manim Community Edition
- FFmpeg
- See `requirements.txt` for full dependencies

---

## Configuration

### Changing Backend URL

1. Open the application
2. Go to **Edit → Settings** (keyboard: `Ctrl+,` or `Cmd+,`)
3. Enter the backend URL
4. Click **Save**

Settings are stored in:
- **Windows:** `%APPDATA%\Cursor 2D Video Editor\user-config.json`
- **macOS:** `~/Library/Application Support/Cursor 2D Video Editor/user-config.json`
- **Linux:** `~/.config/Cursor 2D Video Editor/user-config.json`

### Default Configuration

```json
{
  "VIDEO_GENERATION_URL": "http://localhost:8000"
}
```

---

## Building from Source

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+
- Git

### Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/yashpinjarkar10/Cursor_2D_Animation.git
   cd Cursor_2D_Animation/video-editor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run electron:dev
   ```

4. Build for your platform:
   ```bash
   # Windows
   npm run build:win

   # macOS
   npm run build:mac

   # Linux
   npm run build:linux
   ```

5. Built files will be in the `release/` folder

---

## Troubleshooting

### Common Issues

#### "Cannot connect to backend"

1. Ensure the Manim backend server is running
2. Check the backend URL in **Edit → Settings**
3. Verify firewall isn't blocking the connection

#### "Video generation failed"

1. Check backend server logs for errors
2. Ensure Manim is properly installed on the backend
3. Verify FFmpeg is available

#### Windows: "App won't start"

1. Try running as Administrator
2. Install Visual C++ Redistributable
3. Check antivirus isn't blocking the app

#### macOS: "App is damaged" or "Cannot be opened"

```bash
# Remove quarantine attribute
xattr -cr /Applications/Cursor\ 2D\ Video\ Editor.app
```

#### Linux: AppImage won't run

```bash
# Install FUSE
sudo apt install libfuse2  # Ubuntu/Debian
sudo dnf install fuse      # Fedora
```

### Getting Help

- [GitHub Issues](https://github.com/yashpinjarkar10/Cursor_2D_Animation/issues)
- Check the logs in the developer console (View → Toggle Developer Tools)

---

## Uninstallation

### Windows (Installer version)
- Use "Add or Remove Programs" in Windows Settings

### Windows (Portable version)
- Delete the executable and `%APPDATA%\Cursor 2D Video Editor\` folder

### macOS
- Drag app from Applications to Trash
- Remove `~/Library/Application Support/Cursor 2D Video Editor/`

### Linux
```bash
# AppImage
rm Cursor_2D_Video_Editor-*.AppImage

# Debian/Ubuntu
sudo apt remove cursor-2d-video-editor

# Fedora/RHEL
sudo dnf remove cursor-2d-video-editor
```

---

## License

This project is open source. See the main repository for license details.
