---
title: Manim Video Generator
emoji: 🎬
colorFrom: purple
colorTo: indigo
sdk: docker
pinned: false
license: mit
short_description: AI-powered Manim animation generator API
---
# Manim Video Generator API

An intelligent educational animation generation system that converts text queries into high-quality Manim animations using AI-powered LangGraph pipelines and RAG (Retrieval Augmented Generation).

## 🎯 Overview

This project creates educational animations automatically by:
1. **Story Generation**: Converting user queries into visual narratives
2. **Syntax Analysis**: Generating specific Manim syntax questions for RAG lookup
3. **RAG-Powered Documentation**: Using ChromaDB vector store with Manim documentation
4. **AI-Powered Code Generation**: Using Google Gemini LLM to generate Manim code
5. **Automated Execution**: Running Manim and returning video files
6. **Error Correction**: Automatically fixing code errors with LLM assistance

## 🚀 Features

- **🧠 Intelligent Story Generation**: Automatically creates visual narratives from topics
- **📚 RAG-Powered Documentation**: ChromaDB vector store with Manim documentation
- **⚡ LangGraph Pipeline**: Robust workflow orchestration with state management
- **🎬 Manim Integration**: Generates and executes production-ready Manim scripts
- **🔄 Auto-Error Correction**: Attempts to fix code errors automatically
- **🌐 FastAPI Backend**: RESTful API for video generation

## 📁 Project Structure

```
Cursor_2D_Animation/
├── app.py                         # Main FastAPI application
├── prompts.py                     # LLM prompts for all generation stages
├── chroma_db_manim/              # ChromaDB vector store for RAG
│   ├── chroma.sqlite3            # Vector database
│   └── {collection}/             # Embedding collections
├── docs/                          # Documentation and RAG setup
│   ├── convert_manim_docs_to_vector.py  # Script to create vector store
│   └── manim_docs.txt            # Manim documentation for RAG
├── generated_videos/              # Output directory for videos (created at runtime)
├── Dockerfile                     # Docker configuration
├── requirements.txt               # Python dependencies
└── README.md                      # This file
```

## 🛠️ Installation

### Prerequisites
- Python 3.10+
- FFmpeg (for video rendering)
- LaTeX (optional, for math formulas)

### Setup
1. **Clone the repository**
   ```bash
   git clone https://github.com/yashpinjarkar10/Cursor_2D_Animation.git
   cd Cursor_2D_Animation
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Environment configuration**
   Create a `.env` file with your API keys:
   ```env
   GOOGLE_API_KEY=your_gemini_api_key
   ```

4. **(Optional) Regenerate RAG Vector Store**
   If you need to update the Manim documentation:
   ```bash
   cd docs
   python convert_manim_docs_to_vector.py
   ```

## 🎮 Usage

### Running the Server
```bash
python app.py
```
The server will start on `http://localhost:8000`

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate` | Generate a video from text query |
| GET | `/get_code/{filename}` | Retrieve generated Manim code |
| GET | `/` | Health check and API info |

### Example Request
```bash
curl -X POST "http://localhost:8000/generate" \
  -H "Content-Type: application/json" \
  -d '{"query": "Explain the Pythagorean theorem"}'
```

### Using with Docker
```bash
docker build -t manim-generator .
docker run -p 8000:8000 -e GOOGLE_API_KEY=your_key manim-generator
```

## 🔧 Key Technologies

- **🤖 AI/ML**: Google Gemini 2.5 Flash, LangChain, LangGraph
- **🎬 Animation**: Manim Community Edition
- **📚 RAG**: ChromaDB Vector Database, HuggingFace Embeddings
- **🌐 API**: FastAPI, Uvicorn
- **🐳 Deployment**: Docker

## 🧩 LangGraph Pipeline

The application uses a sophisticated LangGraph workflow:

```
START → Generate Story → Generate Syntax Questions → RAG Search → Generate Code → Execute Manim
                                                                                       ↓
                                                                      [Error?] → Review & Fix Code → END
                                                                      [Success?] → END
```

### Pipeline Nodes:
1. **Generate Story**: Creates a visual narrative from the query
2. **Generate Syntax Questions**: Identifies Manim syntax needs
3. **RAG Search**: Retrieves relevant documentation
4. **Generate Code**: Creates executable Manim Python code
5. **Execute Manim**: Runs the code and generates video
6. **Review & Fix**: Attempts to fix errors (if any)

## 📊 Output

The API returns:
- **Video File**: MP4 animation file (on success)
- **Custom Headers**: Include query info and code file path
- **Generated Code**: Saved to `generated_videos/` directory

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- **Manim Community** for the excellent animation framework
- **LangChain Team** for the AI orchestration tools
- **Google** for the Gemini LLM API

---

**Built with ❤️ for educational content creators**
