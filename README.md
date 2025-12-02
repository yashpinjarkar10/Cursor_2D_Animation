# AI-Powered Manim Animation Studio

An integrated suite for creating educational 2D animations, featuring an AI-powered video generation backend and a full-featured desktop video editor.

## Overview

This repository contains two main components:
1.  **AI Animation Backend (`backend_graph/`)**: A FastAPI service that uses a sophisticated LangGraph pipeline to convert text prompts into Manim animations. It leverages a Retrieval-Augmented Generation (RAG) system with Manim documentation to produce accurate, executable code.
2.  **Desktop Video Editor (`video-editor/`)**: A cross-platform application built with Electron and React. It serves as a user interface for the AI backend and provides a complete video editing environment, including a code editor, timeline, and local rendering capabilities.

## Features

### AI Animation Backend
- **Text-to-Video**: Generates Manim animations from natural language queries.
- **LangGraph Pipeline**: Orchestrates a multi-step AI process including story generation, syntax analysis, RAG, code generation, and execution.
- **RAG-Powered Documentation**: Uses a ChromaDB vector store of Manim documentation to provide context to the LLM, ensuring accurate syntax.
- **Auto-Correction**: An intelligent error-handling loop uses the LLM to debug and fix failed Manim code.
- **Optimized LLM Usage**: Employs different Google Gemini models (Flash and Flash-Lite) for speed and cost-effectiveness across different tasks.
- **Dockerized**: Includes a `Dockerfile` for easy deployment.

### Desktop Video Editor
- **AI Video Generation**: UI to send prompts to the backend and receive generated videos and code.
- **Integrated Code Editor**: A Monaco-based editor to view and modify the AI-generated Manim code.
- **Local Rendering**: Execute Manim code directly from the editor to re-render videos.
- **Multi-Track Timeline**: A visual timeline to arrange video clips, audio tracks, and text overlays.
- **Video Editing**: Trim, join, and reorder video clips.
- **Asset Management**: Import and manage your own video and audio files.
- **Custom Export**: Export final videos with customizable quality, resolution (up to 4K), and aspect ratio (16:9, 9:16, 1:1, etc.).

## Technology Stack

- **Backend**: Python, FastAPI, LangGraph, LangChain, Google Gemini, Manim, ChromaDB, HuggingFace Embeddings.
- **Frontend**: Electron, React, Vite, TailwindCSS, Monaco Editor, fluent-ffmpeg.
- **Deployment**: Docker, GitHub Actions for release automation.

## Project Structure

```
.
├── backend_graph/      # FastAPI and LangGraph application for AI animation
│   ├── app.py          # Main FastAPI server and LangGraph logic
│   ├── prompts.py      # LLM prompts for each step of the AI pipeline
│   └── chroma_db_manim/ # ChromaDB vector store
├── video-editor/       # Electron/React desktop application
│   ├── electron/       # Electron main and preload scripts
│   ├── src/            # React components (UI)
│   └── package.json    # Dependencies and build scripts
├── docs/               # Manim documentation and RAG setup scripts
│   └── convert_manim_docs_to_vector.py
└── .github/workflows/  # CI/CD for building and releasing the editor
```

## Setup and Installation

### 1. AI Animation Backend

#### Prerequisites
*   Python 3.10+
*   FFmpeg
*   A Google Gemini API Key

#### Installation
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yashpinjarkar10/Cursor_2D_Animation.git
    cd Cursor_2D_Animation
    ```

2.  **Install Python dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Configure environment variables:**
    Create a `.env` file in the `backend_graph` directory and add your API key:
    ```env
    # In backend_graph/.env
    GOOGLE_API_KEY="YOUR_GEMINI_API_KEY"
    ```

4.  **Run the server:**
    Navigate to the backend directory and run the application.
    ```bash
    cd backend_graph
    python app.py
    ```
    The API will be available at `http://localhost:8000`.

#### Using Docker
You can also run the backend using Docker:
```bash
docker build -t manim-generator -f backend_graph/Dockerfile .
docker run -p 8000:8000 -e GOOGLE_API_KEY="YOUR_GEMINI_API_KEY" manim-generator
```

### 2. Desktop Video Editor

#### Prerequisites
*   Node.js (v18+)
*   The AI Animation Backend running (for AI generation features).

#### Installation
1.  **Navigate to the editor directory:**
    ```bash
    cd video-editor
    ```

2.  **Install Node.js dependencies:**
    ```bash
    npm install
    ```

3.  **Run in development mode:**
    This will start the Vite dev server and launch the Electron app.
    ```bash
    npm run electron:dev
    ```

4.  **(Optional) Build the application:**
    To create a standalone executable for your platform:
    ```bash
    # For Windows
    npm run build:win

    # For macOS
    npm run build:mac

    # For Linux
    npm run build:linux
    ```
    The output will be in the `video-editor/release` directory. Pre-built releases are also available on the [Releases page](https://github.com/yashpinjarkar10/Cursor_2D_Animation/releases).

## The AI Pipeline (LangGraph)

The backend uses a stateful graph to process user requests. This ensures a robust and debuggable workflow.

1.  **Generate Story**: The initial query is expanded into a visual narrative, breaking down the animation into distinct phases and describing visual elements.
2.  **Generate Syntax Questions**: The story is analyzed to create specific, technical questions about Manim syntax needed for implementation (e.g., "How to use `Transform` to change one shape into another?").
3.  **RAG Search**: The generated questions are used to search the ChromaDB vector store, which contains the Manim documentation. This retrieves relevant code snippets and explanations.
4.  **Generate Code**: The story, RAG search results, and original query are passed to the code generation LLM, which produces a complete, executable Manim Python script.
5.  **Execute Manim**: The generated script is executed using a `subprocess` call to Manim to render the video.
6.  **Review & Fix Code (Conditional Edge)**: If the execution fails, the error message and the faulty code are passed back to the LLM, which attempts to fix the error. The corrected code is then executed once more.

## Usage

### API Endpoints
The backend exposes a simple REST API.

| Method | Endpoint             | Description                                  |
| :----- | :------------------- | :------------------------------------------- |
| `POST` | `/generate`          | Generates a video from a text query.         |
| `GET`  | `/get_code/{filename}`| Retrieves the generated Python code.         |
| `POST` | `/render`            | Renders a video from a provided code string. |

**Example `curl` Request:**
```bash
curl -X POST "http://localhost:8000/generate" \
  -H "Content-Type: application/json" \
  -d '{"query": "Animate the process of binary search"}' \
  --output animation.mp4
```

### Video Editor
1.  Launch the application.
2.  Click **Generate Video**, enter a prompt, and wait for the AI to create the video and code.
3.  The generated video and code will appear in the editor.
4.  Modify the code in the **Code Editor** and click **Render** to see your changes.
5.  Drag clips from the **Assets** panel to the **Timeline**.
6.  Trim, reorder, and layer clips, audio, and text on the timeline.
7.  Click **Export** to render your final video.

## Contributing

Contributions are welcome! Please fork the repository, create a new feature branch, and submit a pull request. Make sure to follow the existing code style and add tests for any new functionality.
