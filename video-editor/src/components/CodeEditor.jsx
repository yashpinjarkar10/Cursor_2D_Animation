import { useState, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import { Code, Play, Copy, Check, FileCode, Maximize2, Minimize2 } from 'lucide-react';

const SAMPLE_TEMPLATES = {
    circle: `from manim import *

class CreateCircle(Scene):
    def construct(self):
        circle = Circle()
        circle.set_fill(PINK, opacity=0.5)
        self.play(Create(circle))
        self.wait()
`,
    square: `from manim import *

class CreateSquare(Scene):
    def construct(self):
        square = Square()
        square.set_fill(BLUE, opacity=0.5)
        self.play(Create(square))
        self.play(square.animate.rotate(PI/4))
        self.wait()
`,
    text: `from manim import *

class WriteText(Scene):
    def construct(self):
        text = Text("Hello, Manim!")
        self.play(Write(text))
        self.wait()
        self.play(text.animate.scale(2))
        self.wait()
`,
    transform: `from manim import *

class SquareToCircle(Scene):
    def construct(self):
        circle = Circle()
        square = Square()
        square.flip(RIGHT)
        square.rotate(-3 * TAU / 8)
        circle.set_fill(PINK, opacity=0.5)

        self.play(Create(square))
        self.play(Transform(square, circle))
        self.play(FadeOut(square))
`,
};

const CodeEditor = ({ code, onChange, onRender, isRendering, isFullscreen = false, onToggleFullscreen }) => {
    const [sceneName, setSceneName] = useState('CreateCircle');
    const [copied, setCopied] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);

    // Auto-detect scene names from code
    const detectedScenes = useMemo(() => {
        if (!code) return [];
        // Match class definitions that inherit from Scene or other Manim scene types
        const scenePattern = /class\s+(\w+)\s*\(\s*(?:Scene|MovingCameraScene|ThreeDScene|ZoomedScene|LinearTransformationScene)\s*\)/g;
        const scenes = [];
        let match;
        while ((match = scenePattern.exec(code)) !== null) {
            scenes.push(match[1]);
        }
        return scenes;
    }, [code]);

    // Auto-select first detected scene
    useEffect(() => {
        if (detectedScenes.length > 0 && !detectedScenes.includes(sceneName)) {
            setSceneName(detectedScenes[0]);
        }
    }, [detectedScenes]);

    const handleRender = () => {
        if (code) {
            onRender(code, sceneName);
        }
    };

    const handleCopy = async () => {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-dark-800 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-700 flex-shrink-0">
                <Code className="w-4 h-4 text-primary-500" />
                <h3 className="font-semibold">Manim Code Editor</h3>

                <div className="flex-1" />

                {detectedScenes.length > 0 ? (
                    <select
                        className="input w-40 text-sm py-1"
                        value={sceneName}
                        onChange={(e) => setSceneName(e.target.value)}
                    >
                        {detectedScenes.map(scene => (
                            <option key={scene} value={scene}>{scene}</option>
                        ))}
                    </select>
                ) : (
                    <input
                        type="text"
                        className="input w-40 text-sm py-1"
                        placeholder="Scene Name"
                        value={sceneName}
                        onChange={(e) => setSceneName(e.target.value)}
                    />
                )}

                <button
                    className="btn btn-secondary text-sm py-1 px-3"
                    onClick={handleCopy}
                    disabled={!code}
                    title="Copy code"
                >
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>

                <div className="relative">
                    <button
                        className="btn btn-secondary text-sm py-1 px-3"
                        onClick={() => setShowTemplates(!showTemplates)}
                        title="Load template"
                    >
                        <FileCode className="w-3 h-3" />
                    </button>
                    {showTemplates && (
                        <div className="absolute right-0 top-full mt-1 bg-dark-700 border border-dark-600 rounded-lg shadow-lg z-20 min-w-[150px]">
                            {Object.entries(SAMPLE_TEMPLATES).map(([name, template]) => (
                                <button
                                    key={name}
                                    className="block w-full text-left px-3 py-2 text-sm hover:bg-dark-600 capitalize first:rounded-t-lg last:rounded-b-lg"
                                    onClick={() => {
                                        onChange(template);
                                        setShowTemplates(false);
                                    }}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    className="btn btn-primary text-sm py-1 px-3 flex items-center gap-1"
                    onClick={handleRender}
                    disabled={isRendering || !code}
                >
                    <Play className="w-3 h-3" />
                    {isRendering ? 'Rendering...' : 'Render'}
                </button>

                {/* Fullscreen toggle button */}
                <button
                    className={`btn ${isFullscreen ? 'btn-primary' : 'btn-secondary'} text-sm py-1 px-3`}
                    onClick={onToggleFullscreen}
                    title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
                >
                    {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </button>
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0">
                <Editor
                    height="100%"
                    defaultLanguage="python"
                    theme="vs-dark"
                    value={code}
                    onChange={onChange}
                    options={{
                        minimap: { enabled: isFullscreen },
                        fontSize: isFullscreen ? 16 : 14,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                    }}
                />
            </div>
        </div>
    );
};

export default CodeEditor;
