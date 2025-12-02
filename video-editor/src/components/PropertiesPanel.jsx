import { useState, useEffect } from 'react';
import { Settings, Scissors, Type, Plus, Music, Edit3, Move, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const PropertiesPanel = ({ 
    selectedClip, 
    onUpdateClip, 
    onAddClip, 
    onAddText, 
    onAddAudioToTimeline,
    currentTime = 0,
    selectedTextOverlay,
    onUpdateText,
    onSelectText,
    onRemoveText,
    textOverlays = [],
    showVideoBorder = true,
    onToggleVideoBorder
}) => {
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [isTrimming, setIsTrimming] = useState(false);
    const [showTextList, setShowTextList] = useState(true);
    
    // Text overlay state - for adding new text
    const [newText, setNewText] = useState('');
    const [textStartTime, setTextStartTime] = useState(0);
    const [textDuration, setTextDuration] = useState(3);
    const [textPosition, setTextPosition] = useState('custom');
    const [textX, setTextX] = useState(50); // percentage
    const [textY, setTextY] = useState(50); // percentage
    const [textSize, setTextSize] = useState(32);
    const [textColor, setTextColor] = useState('#ffffff');
    
    // Edit text overlay state
    const [editText, setEditText] = useState('');
    const [editStartTime, setEditStartTime] = useState(0);
    const [editDuration, setEditDuration] = useState(3);
    const [editPosition, setEditPosition] = useState('custom');
    const [editX, setEditX] = useState(50);
    const [editY, setEditY] = useState(50);
    const [editSize, setEditSize] = useState(32);
    const [editColor, setEditColor] = useState('#ffffff');

    // Reset trim values when clip changes
    useEffect(() => {
        if (selectedClip && selectedClip.type === 'video') {
            setTrimStart(selectedClip.trimStart || 0);
            setTrimEnd(selectedClip.trimEnd || selectedClip.duration || 0);
        }
    }, [selectedClip]);

    // Set default text start time to current cursor position
    useEffect(() => {
        setTextStartTime(currentTime);
    }, [currentTime]);
    
    // Load selected text overlay for editing
    useEffect(() => {
        if (selectedTextOverlay) {
            setEditText(selectedTextOverlay.text || '');
            setEditStartTime(selectedTextOverlay.startTime || 0);
            setEditDuration(selectedTextOverlay.duration || 3);
            setEditPosition(selectedTextOverlay.position || 'custom');
            setEditX(selectedTextOverlay.x ?? 50);
            setEditY(selectedTextOverlay.y ?? 50);
            setEditSize(selectedTextOverlay.fontSize || 32);
            setEditColor(selectedTextOverlay.color || '#ffffff');
        }
    }, [selectedTextOverlay]);

    // Helper to adjust position preset to X/Y
    const applyPositionPreset = (preset, isEdit = false) => {
        let x = 50, y = 50;
        switch (preset) {
            case 'top': y = 10; break;
            case 'center': y = 50; break;
            case 'bottom': y = 80; break;
            case 'top-left': x = 10; y = 10; break;
            case 'top-right': x = 90; y = 10; break;
            case 'bottom-left': x = 10; y = 90; break;
            case 'bottom-right': x = 90; y = 90; break;
            default: return; // custom - don't change
        }
        if (isEdit) {
            setEditX(x);
            setEditY(y);
            setEditPosition(preset);
        } else {
            setTextX(x);
            setTextY(y);
            setTextPosition(preset);
        }
    };

    // Arrow key movement for edit mode
    const moveText = (dx, dy) => {
        if (selectedTextOverlay && onUpdateText) {
            const newX = Math.max(0, Math.min(100, editX + dx));
            const newY = Math.max(0, Math.min(100, editY + dy));
            setEditX(newX);
            setEditY(newY);
            setEditPosition('custom');
            onUpdateText({
                ...selectedTextOverlay,
                x: newX,
                y: newY,
                position: 'custom'
            });
        }
    };

    if (!selectedClip) {
        return (
            <div className="w-72 bg-dark-800 border-l border-dark-700 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700">
                    <Settings className="w-4 h-4 text-primary-500" />
                    <h3 className="font-semibold">Properties</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-dark-800" style={{ scrollBehavior: 'smooth' }}>
                    {/* Video Display Options */}
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            Display Options
                        </h4>
                        <div className="panel p-3 space-y-2">
                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm text-gray-300">Show Video Border</span>
                                <input
                                    type="checkbox"
                                    checked={showVideoBorder}
                                    onChange={() => onToggleVideoBorder && onToggleVideoBorder()}
                                    className="w-4 h-4 accent-primary-500 cursor-pointer"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Add Text Section - always visible */}
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                            <Type className="w-4 h-4" />
                            Add Text Overlay
                        </h4>
                        <div className="panel p-3 space-y-3">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Text</label>
                                <input
                                    type="text"
                                    className="input w-full text-sm"
                                    placeholder="Enter text..."
                                    value={newText}
                                    onChange={(e) => setNewText(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Start (s)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={textStartTime}
                                        onChange={(e) => setTextStartTime(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Duration (s)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={textDuration}
                                        onChange={(e) => setTextDuration(parseFloat(e.target.value) || 1)}
                                        min="0.5"
                                        step="0.5"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Position Preset</label>
                                <select
                                    className="input w-full text-sm"
                                    value={textPosition}
                                    onChange={(e) => applyPositionPreset(e.target.value, false)}
                                >
                                    <option value="custom">Custom</option>
                                    <option value="top">Top Center</option>
                                    <option value="center">Center</option>
                                    <option value="bottom">Bottom Center</option>
                                    <option value="top-left">Top Left</option>
                                    <option value="top-right">Top Right</option>
                                    <option value="bottom-left">Bottom Left</option>
                                    <option value="bottom-right">Bottom Right</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">X Position (%)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={textX}
                                        onChange={(e) => { setTextX(parseFloat(e.target.value) || 0); setTextPosition('custom'); }}
                                        min="0"
                                        max="100"
                                        step="1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Y Position (%)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={textY}
                                        onChange={(e) => { setTextY(parseFloat(e.target.value) || 0); setTextPosition('custom'); }}
                                        min="0"
                                        max="100"
                                        step="1"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Size</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={textSize}
                                        onChange={(e) => setTextSize(parseInt(e.target.value) || 24)}
                                        min="12"
                                        max="120"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Color</label>
                                    <input
                                        type="color"
                                        className="w-full h-8 rounded cursor-pointer"
                                        value={textColor}
                                        onChange={(e) => setTextColor(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button
                                className="btn btn-primary w-full text-sm"
                                onClick={() => {
                                    if (newText.trim() && onAddText) {
                                        onAddText({
                                            text: newText,
                                            startTime: textStartTime,
                                            duration: textDuration,
                                            position: textPosition,
                                            x: textX,
                                            y: textY,
                                            fontSize: textSize,
                                            color: textColor,
                                        });
                                        setNewText('');
                                    }
                                }}
                                disabled={!newText.trim()}
                            >
                                <Plus className="w-4 h-4 inline mr-1" />
                                Add Text
                            </button>
                        </div>
                    </div>

                    {/* Text Overlays List */}
                    {textOverlays.length > 0 && (
                        <div>
                            <h4 
                                className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2 cursor-pointer hover:text-gray-300"
                                onClick={() => setShowTextList(!showTextList)}
                            >
                                <Type className="w-4 h-4" />
                                Text Overlays ({textOverlays.length})
                                {showTextList ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                            </h4>
                            {showTextList && (
                                <div className="space-y-2">
                                    {textOverlays.map((text) => (
                                        <div 
                                            key={text.id}
                                            onClick={() => onSelectText && onSelectText(text.id)}
                                            className={`panel p-2 cursor-pointer transition-colors ${
                                                selectedTextOverlay?.id === text.id 
                                                    ? 'border-purple-500 bg-purple-900/20' 
                                                    : 'hover:border-gray-600'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium truncate" style={{ color: text.color || '#ffffff' }}>
                                                        {text.text || 'Empty text'}
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {(text.startTime || 0).toFixed(1)}s - {((text.startTime || 0) + (text.duration || 3)).toFixed(1)}s
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRemoveText && onRemoveText(text.id);
                                                    }}
                                                    className="text-gray-500 hover:text-red-400 p-1"
                                                    title="Delete text"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Edit Text Overlay Section - shown when text is selected (no clip view) */}
                    {selectedTextOverlay && (
                        <div>
                            <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                                <Edit3 className="w-4 h-4" />
                                Edit Text Overlay
                            </h4>
                            <div className="panel p-3 space-y-3 border border-purple-500/30">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Text</label>
                                    <input
                                        type="text"
                                        className="input w-full text-sm"
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Start (s)</label>
                                        <input
                                            type="number"
                                            className="input w-full text-sm"
                                            value={editStartTime}
                                            onChange={(e) => setEditStartTime(parseFloat(e.target.value) || 0)}
                                            min="0"
                                            step="0.1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Duration (s)</label>
                                        <input
                                            type="number"
                                            className="input w-full text-sm"
                                            value={editDuration}
                                            onChange={(e) => setEditDuration(parseFloat(e.target.value) || 1)}
                                            min="0.5"
                                            step="0.5"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Position Preset</label>
                                    <select
                                        className="input w-full text-sm"
                                        value={editPosition}
                                        onChange={(e) => applyPositionPreset(e.target.value, true)}
                                    >
                                        <option value="custom">Custom</option>
                                        <option value="top">Top Center</option>
                                        <option value="center">Center</option>
                                        <option value="bottom">Bottom Center</option>
                                        <option value="top-left">Top Left</option>
                                        <option value="top-right">Top Right</option>
                                        <option value="bottom-left">Bottom Left</option>
                                        <option value="bottom-right">Bottom Right</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">X Position (%)</label>
                                        <input
                                            type="number"
                                            className="input w-full text-sm"
                                            value={editX}
                                            onChange={(e) => { setEditX(parseFloat(e.target.value) || 0); setEditPosition('custom'); }}
                                            min="0"
                                            max="100"
                                            step="1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Y Position (%)</label>
                                        <input
                                            type="number"
                                            className="input w-full text-sm"
                                            value={editY}
                                            onChange={(e) => { setEditY(parseFloat(e.target.value) || 0); setEditPosition('custom'); }}
                                            min="0"
                                            max="100"
                                            step="1"
                                        />
                                    </div>
                                </div>
                                {/* Arrow controls for fine-tuning */}
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Fine-tune Position</label>
                                    <div className="flex items-center justify-center gap-1">
                                        <div className="grid grid-cols-3 gap-1">
                                            <div></div>
                                            <button
                                                className="btn btn-secondary p-1"
                                                onClick={() => moveText(0, -2)}
                                                title="Move Up"
                                            >
                                                <ArrowUp className="w-4 h-4" />
                                            </button>
                                            <div></div>
                                            <button
                                                className="btn btn-secondary p-1"
                                                onClick={() => moveText(-2, 0)}
                                                title="Move Left"
                                            >
                                                <ArrowLeft className="w-4 h-4" />
                                            </button>
                                            <div className="flex items-center justify-center">
                                                <Move className="w-4 h-4 text-gray-500" />
                                            </div>
                                            <button
                                                className="btn btn-secondary p-1"
                                                onClick={() => moveText(2, 0)}
                                                title="Move Right"
                                            >
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                            <div></div>
                                            <button
                                                className="btn btn-secondary p-1"
                                                onClick={() => moveText(0, 2)}
                                                title="Move Down"
                                            >
                                                <ArrowDown className="w-4 h-4" />
                                            </button>
                                            <div></div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 text-center mt-1">Or drag text on video</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Size</label>
                                        <input
                                            type="number"
                                            className="input w-full text-sm"
                                            value={editSize}
                                            onChange={(e) => setEditSize(parseInt(e.target.value) || 24)}
                                            min="12"
                                            max="120"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 block mb-1">Color</label>
                                        <input
                                            type="color"
                                            className="w-full h-8 rounded cursor-pointer"
                                            value={editColor}
                                            onChange={(e) => setEditColor(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <button
                                    className="btn btn-primary w-full text-sm"
                                    onClick={() => {
                                        if (editText.trim() && onUpdateText && selectedTextOverlay) {
                                            onUpdateText({
                                                ...selectedTextOverlay,
                                                text: editText,
                                                startTime: editStartTime,
                                                duration: editDuration,
                                                position: editPosition,
                                                x: editX,
                                                y: editY,
                                                fontSize: editSize,
                                                color: editColor,
                                            });
                                        }
                                    }}
                                    disabled={!editText.trim()}
                                >
                                    <Edit3 className="w-4 h-4 inline mr-1" />
                                    Update Text
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {!selectedTextOverlay && (
                        <div className="text-center text-gray-500 mt-4">
                            <Settings className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Select a clip to view properties</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const handleTrim = async () => {
        const videoPath = selectedClip.videoPath || selectedClip.videoUrl;
        if (videoPath && trimEnd > trimStart) {
            setIsTrimming(true);
            try {
                // Generate output path based on input
                const timestamp = Date.now();
                const outputPath = videoPath.replace(/\.(mp4|mov|avi|mkv)$/i, `_trimmed_${timestamp}.mp4`);
                const result = await window.electronAPI.trimVideo(
                    videoPath,
                    outputPath,
                    trimStart,
                    trimEnd - trimStart
                );

                if (result.success) {
                    // Create a NEW clip for trimmed version, keep original
                    if (onAddClip) {
                        onAddClip({
                            type: 'video',
                            source: 'trimmed',
                            videoPath: result.outputPath,
                            name: selectedClip.name + ' (trimmed)',
                            duration: trimEnd - trimStart,
                            trimmed: true,
                            originalClipId: selectedClip.id,
                        });
                    }
                }
            } catch (error) {
                console.error('Trim failed:', error);
            } finally {
                setIsTrimming(false);
            }
        }
    };

    // Handle adding audio clip to timeline
    const handleAddAudioToTimeline = () => {
        if (selectedClip.type === 'audio' && onAddAudioToTimeline) {
            onAddAudioToTimeline(selectedClip);
        }
    };

    return (
        <div className="w-72 bg-dark-800 border-l border-dark-700 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700 flex-shrink-0">
                <Settings className="w-4 h-4 text-primary-500" />
                <h3 className="font-semibold">Properties</h3>
            </div>

            {/* Content - scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-dark-800" style={{ scrollBehavior: 'smooth' }}>
                {/* Video Display Options */}
                <div>
                    <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Display Options
                    </h4>
                    <div className="panel p-3 space-y-2">
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-sm text-gray-300">Show Video Border</span>
                            <input
                                type="checkbox"
                                checked={showVideoBorder}
                                onChange={() => onToggleVideoBorder && onToggleVideoBorder()}
                                className="w-4 h-4 accent-primary-500 cursor-pointer"
                            />
                        </label>
                    </div>
                </div>

                {/* Clip Info */}
                <div>
                    <h4 className="text-sm font-semibold mb-2 text-gray-400">Clip Info</h4>
                    <div className="panel p-3 space-y-2">
                        <div>
                            <div className="text-xs text-gray-500">Name</div>
                            <div className="text-sm font-medium break-words">{selectedClip.name}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Type</div>
                            <div className="text-sm">{selectedClip.type}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Source</div>
                            <div className="text-sm">{selectedClip.source || 'N/A'}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Duration</div>
                            <div className="text-sm">{(selectedClip.duration || 0).toFixed(2)}s</div>
                        </div>
                    </div>
                </div>

                {/* Audio Controls */}
                {selectedClip.type === 'audio' && (
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                            <Music className="w-4 h-4" />
                            Audio Options
                        </h4>
                        <div className="panel p-3 space-y-3">
                            <button
                                className="btn btn-primary w-full text-sm"
                                onClick={handleAddAudioToTimeline}
                            >
                                <Plus className="w-4 h-4 inline mr-1" />
                                Add to Timeline
                            </button>
                            <p className="text-xs text-gray-500">
                                Add this audio to the audio track in the timeline
                            </p>
                        </div>
                    </div>
                )}

                {/* Trim Controls */}
                {selectedClip.type === 'video' && (
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                            <Scissors className="w-4 h-4" />
                            Trim (creates new clip)
                        </h4>
                        <div className="panel p-3 space-y-3">
                            <p className="text-xs text-gray-500">
                                Trimming creates a new clip. Original stays in assets.
                            </p>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Start (seconds)</label>
                                <input
                                    type="number"
                                    className="input w-full text-sm"
                                    value={trimStart}
                                    onChange={(e) => setTrimStart(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    max={selectedClip.duration || 100}
                                    step="0.1"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 block mb-1">End (seconds)</label>
                                <input
                                    type="number"
                                    className="input w-full text-sm"
                                    value={trimEnd}
                                    onChange={(e) => setTrimEnd(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    max={selectedClip.duration || 100}
                                    step="0.1"
                                />
                            </div>

                            {/* Visual trim preview */}
                            <div className="relative h-4 bg-dark-600 rounded overflow-hidden">
                                <div 
                                    className="absolute h-full bg-primary-500"
                                    style={{
                                        left: `${(trimStart / (selectedClip.duration || 1)) * 100}%`,
                                        width: `${((trimEnd - trimStart) / (selectedClip.duration || 1)) * 100}%`,
                                    }}
                                />
                            </div>
                            <div className="text-xs text-gray-500 text-center">
                                Selected: {(trimEnd - trimStart).toFixed(2)}s
                            </div>

                            <button
                                className="btn btn-primary w-full text-sm"
                                onClick={handleTrim}
                                disabled={trimEnd <= trimStart || isTrimming}
                            >
                                {isTrimming ? 'Trimming...' : 'Create Trimmed Clip'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Edit Text Overlay Section - shown when text is selected */}
                {selectedTextOverlay && (
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                            <Edit3 className="w-4 h-4" />
                            Edit Text Overlay
                        </h4>
                        <div className="panel p-3 space-y-3 border border-purple-500/30">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Text</label>
                                <input
                                    type="text"
                                    className="input w-full text-sm"
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Start (s)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={editStartTime}
                                        onChange={(e) => setEditStartTime(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Duration (s)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={editDuration}
                                        onChange={(e) => setEditDuration(parseFloat(e.target.value) || 1)}
                                        min="0.5"
                                        step="0.5"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Position Preset</label>
                                <select
                                    className="input w-full text-sm"
                                    value={editPosition}
                                    onChange={(e) => applyPositionPreset(e.target.value, true)}
                                >
                                    <option value="custom">Custom</option>
                                    <option value="top">Top Center</option>
                                    <option value="center">Center</option>
                                    <option value="bottom">Bottom Center</option>
                                    <option value="top-left">Top Left</option>
                                    <option value="top-right">Top Right</option>
                                    <option value="bottom-left">Bottom Left</option>
                                    <option value="bottom-right">Bottom Right</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">X Position (%)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={editX}
                                        onChange={(e) => { setEditX(parseFloat(e.target.value) || 0); setEditPosition('custom'); }}
                                        min="0"
                                        max="100"
                                        step="1"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Y Position (%)</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={editY}
                                        onChange={(e) => { setEditY(parseFloat(e.target.value) || 0); setEditPosition('custom'); }}
                                        min="0"
                                        max="100"
                                        step="1"
                                    />
                                </div>
                            </div>
                            {/* Arrow controls for fine-tuning */}
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Fine-tune Position</label>
                                <div className="flex items-center justify-center gap-1">
                                    <div className="grid grid-cols-3 gap-1">
                                        <div></div>
                                        <button
                                            className="btn btn-secondary p-1"
                                            onClick={() => moveText(0, -2)}
                                            title="Move Up"
                                        >
                                            <ArrowUp className="w-4 h-4" />
                                        </button>
                                        <div></div>
                                        <button
                                            className="btn btn-secondary p-1"
                                            onClick={() => moveText(-2, 0)}
                                            title="Move Left"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                        </button>
                                        <div className="flex items-center justify-center">
                                            <Move className="w-4 h-4 text-gray-500" />
                                        </div>
                                        <button
                                            className="btn btn-secondary p-1"
                                            onClick={() => moveText(2, 0)}
                                            title="Move Right"
                                        >
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                        <div></div>
                                        <button
                                            className="btn btn-secondary p-1"
                                            onClick={() => moveText(0, 2)}
                                            title="Move Down"
                                        >
                                            <ArrowDown className="w-4 h-4" />
                                        </button>
                                        <div></div>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 text-center mt-1">Or drag text on video</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Size</label>
                                    <input
                                        type="number"
                                        className="input w-full text-sm"
                                        value={editSize}
                                        onChange={(e) => setEditSize(parseInt(e.target.value) || 24)}
                                        min="12"
                                        max="120"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 block mb-1">Color</label>
                                    <input
                                        type="color"
                                        className="w-full h-8 rounded cursor-pointer"
                                        value={editColor}
                                        onChange={(e) => setEditColor(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button
                                className="btn btn-primary w-full text-sm"
                                onClick={() => {
                                    if (editText.trim() && onUpdateText && selectedTextOverlay) {
                                        onUpdateText({
                                            ...selectedTextOverlay,
                                            text: editText,
                                            startTime: editStartTime,
                                            duration: editDuration,
                                            position: editPosition,
                                            x: editX,
                                            y: editY,
                                            fontSize: editSize,
                                            color: editColor,
                                        });
                                    }
                                }}
                                disabled={!editText.trim()}
                            >
                                <Edit3 className="w-4 h-4 inline mr-1" />
                                Update Text
                            </button>
                        </div>
                    </div>
                )}

                {/* Add Text Section */}
                <div>
                    <h4 className="text-sm font-semibold mb-2 text-gray-400 flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        Add Text Overlay
                    </h4>
                    <div className="panel p-3 space-y-3">
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Text</label>
                            <input
                                type="text"
                                className="input w-full text-sm"
                                placeholder="Enter text..."
                                value={newText}
                                onChange={(e) => setNewText(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Start (s)</label>
                                <input
                                    type="number"
                                    className="input w-full text-sm"
                                    value={textStartTime}
                                    onChange={(e) => setTextStartTime(parseFloat(e.target.value) || 0)}
                                    min="0"
                                    step="0.1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Duration (s)</label>
                                <input
                                    type="number"
                                    className="input w-full text-sm"
                                    value={textDuration}
                                    onChange={(e) => setTextDuration(parseFloat(e.target.value) || 1)}
                                    min="0.5"
                                    step="0.5"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 block mb-1">Position Preset</label>
                            <select
                                className="input w-full text-sm"
                                value={textPosition}
                                onChange={(e) => applyPositionPreset(e.target.value, false)}
                            >
                                <option value="custom">Custom</option>
                                <option value="top">Top Center</option>
                                <option value="center">Center</option>
                                <option value="bottom">Bottom Center</option>
                                <option value="top-left">Top Left</option>
                                <option value="top-right">Top Right</option>
                                <option value="bottom-left">Bottom Left</option>
                                <option value="bottom-right">Bottom Right</option>
                            </select>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">X Position (%)</label>
                                <input
                                    type="number"
                                    className="input w-full text-sm"
                                    value={textX}
                                    onChange={(e) => { setTextX(parseFloat(e.target.value) || 0); setTextPosition('custom'); }}
                                    min="0"
                                    max="100"
                                    step="1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Y Position (%)</label>
                                <input
                                    type="number"
                                    className="input w-full text-sm"
                                    value={textY}
                                    onChange={(e) => { setTextY(parseFloat(e.target.value) || 0); setTextPosition('custom'); }}
                                    min="0"
                                    max="100"
                                    step="1"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Size</label>
                                <input
                                    type="number"
                                    className="input w-full text-sm"
                                    value={textSize}
                                    onChange={(e) => setTextSize(parseInt(e.target.value) || 24)}
                                    min="12"
                                    max="120"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 block mb-1">Color</label>
                                <input
                                    type="color"
                                    className="w-full h-8 rounded cursor-pointer"
                                    value={textColor}
                                    onChange={(e) => setTextColor(e.target.value)}
                                />
                            </div>
                        </div>
                        <button
                            className="btn btn-primary w-full text-sm"
                            onClick={() => {
                                if (newText.trim() && onAddText) {
                                    onAddText({
                                        text: newText,
                                        startTime: textStartTime,
                                        duration: textDuration,
                                        position: textPosition,
                                        x: textX,
                                        y: textY,
                                        fontSize: textSize,
                                        color: textColor,
                                    });
                                    setNewText('');
                                }
                            }}
                            disabled={!newText.trim()}
                        >
                            <Plus className="w-4 h-4 inline mr-1" />
                            Add Text
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertiesPanel;
