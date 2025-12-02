import { useState, useEffect } from 'react';
import { Settings, Scissors, Type, Plus, Music, Edit3 } from 'lucide-react';

const PropertiesPanel = ({ 
    selectedClip, 
    onUpdateClip, 
    onAddClip, 
    onAddText, 
    onAddAudioToTimeline,
    currentTime = 0,
    selectedTextOverlay,
    onUpdateText
}) => {
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [isTrimming, setIsTrimming] = useState(false);
    
    // Text overlay state - for adding new text
    const [newText, setNewText] = useState('');
    const [textStartTime, setTextStartTime] = useState(0);
    const [textDuration, setTextDuration] = useState(3);
    const [textPosition, setTextPosition] = useState('center');
    const [textSize, setTextSize] = useState(32);
    const [textColor, setTextColor] = useState('#ffffff');
    
    // Edit text overlay state
    const [editText, setEditText] = useState('');
    const [editStartTime, setEditStartTime] = useState(0);
    const [editDuration, setEditDuration] = useState(3);
    const [editPosition, setEditPosition] = useState('center');
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
            setEditPosition(selectedTextOverlay.position || 'center');
            setEditSize(selectedTextOverlay.fontSize || 32);
            setEditColor(selectedTextOverlay.color || '#ffffff');
        }
    }, [selectedTextOverlay]);

    if (!selectedClip) {
        return (
            <div className="w-72 bg-dark-800 border-l border-dark-700 flex flex-col">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700">
                    <Settings className="w-4 h-4 text-primary-500" />
                    <h3 className="font-semibold">Properties</h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-dark-800" style={{ scrollBehavior: 'smooth' }}>
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
                                <label className="text-xs text-gray-500 block mb-1">Position</label>
                                <select
                                    className="input w-full text-sm"
                                    value={textPosition}
                                    onChange={(e) => setTextPosition(e.target.value)}
                                >
                                    <option value="top">Top</option>
                                    <option value="center">Center</option>
                                    <option value="bottom">Bottom</option>
                                </select>
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
                                    <label className="text-xs text-gray-500 block mb-1">Position</label>
                                    <select
                                        className="input w-full text-sm"
                                        value={editPosition}
                                        onChange={(e) => setEditPosition(e.target.value)}
                                    >
                                        <option value="top">Top</option>
                                        <option value="center">Center</option>
                                        <option value="bottom">Bottom</option>
                                    </select>
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
                                <label className="text-xs text-gray-500 block mb-1">Position</label>
                                <select
                                    className="input w-full text-sm"
                                    value={editPosition}
                                    onChange={(e) => setEditPosition(e.target.value)}
                                >
                                    <option value="top">Top</option>
                                    <option value="center">Center</option>
                                    <option value="bottom">Bottom</option>
                                </select>
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
                            <label className="text-xs text-gray-500 block mb-1">Position</label>
                            <select
                                className="input w-full text-sm"
                                value={textPosition}
                                onChange={(e) => setTextPosition(e.target.value)}
                            >
                                <option value="top">Top</option>
                                <option value="center">Center</option>
                                <option value="bottom">Bottom</option>
                            </select>
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
