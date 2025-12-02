# Video Editor

A full-featured desktop video editor built with Electron, React, and Manim for mathematical animations.

## Features

### Core Features
- 🎬 **Generate Videos**: Create videos using AI-powered Manim code generation from your backend
- 💻 **Code Editor**: Edit and render Manim code locally with Monaco Editor
- 🎥 **Video Editing**: Trim, join, and manage multiple video clips
- 🎵 **Audio Support**: Add audio tracks to your videos
- 📊 **Timeline**: Visual timeline with drag-and-drop clip reordering
- 💾 **Session Management**: Automatic session management with local file storage
- 🚀 **Export**: Export videos with customizable quality, resolution, and aspect ratio

### Video Editor Features
1. **Backend Integration**: Connect to Manim backend for AI-generated videos
2. **Local Rendering**: Render Manim code locally using Python venv
3. **Trim Videos**: Cut videos to specific time ranges
4. **Join Multiple Clips**: Combine multiple videos into one
5. **Add Audio**: Overlay audio tracks on videos
6. **Custom Export**: Export with quality presets (High/Medium/Low)
7. **Multiple Aspect Ratios**: 16:9, 9:16, 1:1, 4:3
8. **Resolutions**: 4K, Full HD, HD, SD

## Prerequisites

- **Node.js** (v16 or later)
- **Python** (v3.8 or later) - Required for local Manim rendering
- **FFmpeg** - Bundled via @ffmpeg-installer/ffmpeg

## Installation

1. Clone the repository:
\`\`\`bash
cd video-editor
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Configure backend URL (optional):
   - Edit `config.json` to set your VIDEO_GENERATION_URL
   - Default: `http://localhost:8000`

## Running the Application

### Development Mode
\`\`\`bash
npm run electron:dev
\`\`\`

This will start Vite dev server with Electron integration.

### Build for Production
\`\`\`bash
npm run build:win
\`\`\`

The built application will be in the `release` folder.

## Project Structure

\`\`\`
video-editor/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Preload script for secure IPC
├── src/
│   ├── components/
│   │   ├── AssetPanel.jsx      # Asset management
│   │   ├── CodeEditor.jsx      # Monaco code editor
│   │   ├── PropertiesPanel.jsx # Clip properties
│   │   ├── Timeline.jsx        # Video timeline
│   │   ├── Toolbar.jsx         # Top toolbar
│   │   └── VideoPlayer.jsx     # Video player with controls
│   ├── App.jsx          # Main application
│   └── index.css        # TailwindCSS styles
├── config.json          # Backend configuration
├── package.json         # Dependencies and scripts
└── vite.config.js       # Vite + Electron configuration
\`\`\`

## How to Use

### 1. Generate a Video from Backend
- Click "Generate Video" button
- Enter your prompt
- The backend will generate Manim code and video
- Video and code will be loaded automatically

### 2. Edit and Re-render Code
- The code editor shows the generated Manim code
- Edit the code as needed
- Click "Render" to execute locally
- **Note**: First render will create a Python venv and install Manim (takes time)

### 3. Import Videos/Audio
- Use "Add Video" or "Add Audio" in the Assets panel
- Files will be added to your timeline

### 4. Edit on Timeline
- Drag and drop clips to reorder
- Select a clip to view properties
- Use trim controls to cut videos

### 5. Export Final Video
- Click "Export" button
- Choose quality, aspect ratio, and resolution
- Select save location
- Wait for export to complete

## Configuration

### Backend URL
Edit `config.json`:
\`\`\`json
{
  "VIDEO_GENERATION_URL": "http://localhost:8000"
}
\`\`\`

### Backend API Endpoints

Your backend should implement:

1. **POST /generate**
   - Body: `{ "query": "your prompt" }`
   - Response: Video data + code filename in headers (`x-code-filename`)

2. **GET /get_code_file?filename=xxx**
   - Returns: Manim Python code as text

## Keyboard Shortcuts

- **Space**: Play/Pause video
- **Delete**: Remove selected clip (when timeline clip is selected)

## Technologies Used

- **Frontend**: React 19, TailwindCSS
- **Desktop**: Electron
- **Build Tool**: Vite
- **Code Editor**: Monaco Editor
- **Icons**: Lucide React
- **Video Processing**: FFmpeg (via fluent-ffmpeg)
- **Animation**: Manim Community

## Troubleshooting

### Manim Installation Issues
If local rendering fails:
1. Ensure Python is installed and in PATH
2. Check Python version: `python --version`
3. Try manual install: `pip install manim`
4. Check Manim dependencies (Cairo, Pango, etc.)

### FFmpeg Issues
- FFmpeg is bundled automatically
- If issues persist, install system FFmpeg

### Backend Connection Issues
- Verify backend is running at configured URL
- Check network/firewall settings
- Review backend logs for errors

## Development

### Adding New Features
1. Add IPC handlers in `electron/main.js`
2. Expose APIs in `electron/preload.js`
3. Create/update React components in `src/components/`

### Debugging
- Development mode opens DevTools automatically
- Check Console for errors
- Review Electron logs in terminal

## License

MIT

## Contributing

Contributions welcome! Please open an issue or pull request.
