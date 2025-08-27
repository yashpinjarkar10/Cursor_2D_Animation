# Cursor 2D Animation Pipeline

An intelligent educational animation generation system that converts topics into high-quality Manim animations using AI-powered LangGraph pipelines, web search, and RAG (Retrieval Augmented Generation).

## 🎯 Overview

This project creates educational animations automatically by:
1. **Topic Analysis**: Breaking down educational topics into digestible scenes
2. **AI-Powered Code Generation**: Using Google Gemini LLM with web search and Manim documentation RAG
3. **Automated Animation**: Generating complete Manim Python scripts for each scene
4. **Modular Architecture**: Clean, maintainable code structure with separated concerns

## 🚀 Features

- **🧠 Intelligent Scene Generation**: Automatically breaks down complex topics into animated scenes
- **🔍 Web-Enhanced Research**: Uses Tavily search for current information and context
- **📚 RAG-Powered Documentation**: Leverages Supabase vector store with Manim documentation
- **⚡ Parallel Processing**: Concurrent scene generation for improved performance
- **🎬 Manim Integration**: Generates production-ready Manim animation scripts
- **🔄 LangGraph Pipeline**: Robust workflow orchestration with state management
- **📊 Progress Tracking**: Real-time pipeline execution monitoring

## 📁 Project Structure

```
Cursor_2D_Animation/
├── src/                           # Core source code
│   ├── editor/                    # Animation editing components
│   ├── langraph_pipeline/         # Main AI pipeline modules
│   │   ├── config.py             # Environment and LLM configuration
│   │   ├── main_modular.py       # Clean main entry point
│   │   ├── manim_generator.py    # Manim code generation with RAG
│   │   ├── pipeline.py           # LangGraph workflow orchestration
│   │   ├── scene_generator.py    # Scene description generation
│   │   └── state.py              # Pipeline state management
│   ├── renderer/                  # Animation rendering components
│   ├── storage/                   # Data storage utilities
│   └── utils/                     # Common utility functions
├── scripts/                       # Utility scripts
│   └── RAG/                      # RAG system components
│       ├── chunk_docs.py         # Document chunking utilities
│       ├── crawl_recursive.py    # Web crawling for documentation
│       ├── create_table.sql      # Database schema
│       ├── insert_docs.py        # Document insertion pipeline
│       └── utils.py              # RAG utility functions
├── assets/                        # Static assets and resources
├── docs/                          # Project documentation
├── tests/                         # Unit and integration tests
├── out/                           # Generated animations output
├── requirements.txt               # Python dependencies
└── README.md                      # This file
```

## 🛠️ Installation

### Prerequisites
- Python 3.8+
- FFmpeg (for video rendering)
- Git

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
   TAVILY_API_KEY=your_tavily_api_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_supabase_key
   LANGSMITH_API_KEY=your_langsmith_key  # Optional for debugging
   ```

## 🎮 Usage

### Basic Usage
```bash
cd src/langraph_pipeline
python main_modular.py
```

### Advanced Options
```bash
# Test mode with predefined topic
python main_modular.py --test

# Debug mode with detailed logging
python main_modular.py --debug
```

### Example Workflow
1. Run the pipeline: `python main_modular.py`
2. Enter your educational topic (e.g., "Pythagorean Theorem")
3. Watch as the AI generates scene descriptions
4. Generated Manim scripts appear in `generated_scenes/`
5. Rendered videos will be saved to `out/`

## 🔧 Key Technologies

- **🤖 AI/ML**: Google Gemini 2.5 Flash, LangChain, LangGraph
- **🎬 Animation**: Manim Community Edition
- **🔍 Search**: Tavily Web Search API
- **📚 RAG**: Supabase Vector Database, Google Embeddings
- **🕸️ Web Crawling**: Crawl4AI for documentation scraping
- **🎥 Video Processing**: MoviePy, FFmpeg
- **📊 Monitoring**: LangSmith (optional)

## 🧩 Core Components

### LangGraph Pipeline (`src/langraph_pipeline/`)
- **State Management**: Typed state flow through the pipeline
- **Scene Generation**: AI-powered topic breakdown into scenes
- **Code Generation**: RAG-enhanced Manim script creation
- **Parallel Processing**: Concurrent scene processing for efficiency

### RAG System (`scripts/RAG/`)
- **Web Crawling**: Recursive documentation crawling
- **Document Processing**: Intelligent chunking and embedding
- **Vector Storage**: Supabase-based retrieval system
- **Query Enhancement**: Context-aware documentation search

## 📊 Output

The pipeline generates:
- **Manim Scripts**: Complete Python files ready for rendering
- **Scene Descriptions**: Human-readable animation breakdowns
- **Execution Logs**: Detailed pipeline performance metrics
- **Rendered Videos**: Final MP4 animations (when rendering is enabled)

## 🔮 Future Enhancements

- [ ] **Video Editor Integration**: Automated scene assembly
- [ ] **Advanced Rendering**: GPU acceleration and optimization
- [ ] **Interactive UI**: Web-based interface for topic input
- [ ] **Template System**: Reusable animation patterns
- [ ] **Batch Processing**: Multiple topic processing
- [ ] **Quality Assessment**: Automated animation quality metrics

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Manim Community** for the excellent animation framework
- **LangChain Team** for the AI orchestration tools
- **Google** for the Gemini LLM API
- **Supabase** for the vector database platform

---

**Built with ❤️ for educational content creators and AI enthusiasts**
