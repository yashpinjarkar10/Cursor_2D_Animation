import { useState, useRef, useEffect } from 'react';
import { FolderOpen, Video, Music, Plus, Loader2, X, Trash2, Mic, MicOff, Square, ChevronDown, ChevronUp } from 'lucide-react';

const AssetPanel = ({ 
    clips, 
    onAddClip, 
    onSelectClip, 
    onRemoveAsset, 
    generatingTasks = [], 
    onCancelGeneration,
    currentTime = 0,
    isPlaying = false,
    onAddVoiceover,
    sessionId
}) => {
    const audioPreviewRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const mediaStreamRef = useRef(null); // Track media stream for cleanup
    const audioChunksRef = useRef([]);
    const recordingStartTimeRef = useRef(0);
    
    // Voiceover recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [audioDevices, setAudioDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState('');
    const [showVoiceoverSection, setShowVoiceoverSection] = useState(false);
    const [voiceoverError, setVoiceoverError] = useState('');
    const recordingIntervalRef = useRef(null);
    const recordingMimeTypeRef = useRef('audio/webm');
    const recordingStartTimestampRef = useRef(0);

    // Get available audio input devices
    useEffect(() => {
        const getDevices = async () => {
            try {
                // Just enumerate devices - permission will be requested when recording starts
                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(device => device.kind === 'audioinput');
                console.log('Found audio devices:', audioInputs.length);
                setAudioDevices(audioInputs);
                if (audioInputs.length > 0 && !selectedDevice) {
                    setSelectedDevice(audioInputs[0].deviceId);
                }
                
                // If no labels, we need permission - request it
                if (audioInputs.length > 0 && !audioInputs[0].label) {
                    console.log('No labels - requesting mic permission...');
                    try {
                        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        tempStream.getTracks().forEach(t => t.stop());
                        // Re-enumerate to get labels
                        const devicesWithLabels = await navigator.mediaDevices.enumerateDevices();
                        const audioInputsWithLabels = devicesWithLabels.filter(device => device.kind === 'audioinput');
                        setAudioDevices(audioInputsWithLabels);
                        if (audioInputsWithLabels.length > 0) {
                            setSelectedDevice(audioInputsWithLabels[0].deviceId);
                        }
                    } catch (e) {
                        console.error('Permission request failed:', e);
                        setVoiceoverError('Microphone access denied');
                    }
                }
            } catch (err) {
                console.error('Error getting audio devices:', err);
            }
        };
        
        if (showVoiceoverSection) {
            getDevices();
        }
    }, [showVoiceoverSection]);

    // Start recording voiceover
    const startRecording = async () => {
        try {
            setVoiceoverError('');
            audioChunksRef.current = [];
            
            console.log('=== STARTING RECORDING ===');
            console.log('Selected device:', selectedDevice);
            
            // Get fresh audio stream
            const constraints = { 
                audio: selectedDevice 
                    ? { deviceId: { exact: selectedDevice } }
                    : true 
            };
            
            console.log('Getting user media...');
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            const audioTracks = stream.getAudioTracks();
            console.log('Audio tracks:', audioTracks.length);
            if (audioTracks.length === 0) {
                throw new Error('No audio track in stream');
            }
            
            console.log('Track:', audioTracks[0].label, 'readyState:', audioTracks[0].readyState, 'enabled:', audioTracks[0].enabled);
            
            // Keep reference to stream
            mediaStreamRef.current = stream;
            
            // Add track ended listener
            audioTracks[0].onended = () => {
                console.log('!!! Audio track ended unexpectedly !!!');
            };
            
            // Create MediaRecorder
            const options = { mimeType: 'audio/webm;codecs=opus' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/webm';
            }
            console.log('Creating MediaRecorder with:', options.mimeType);
            
            const recorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = recorder;
            recordingMimeTypeRef.current = options.mimeType;
            
            // Set up event handlers BEFORE starting
            recorder.ondataavailable = (e) => {
                console.log('Data available:', e.data?.size, 'bytes');
                if (e.data && e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };
            
            recorder.onstart = () => {
                console.log('Recorder started, state:', recorder.state);
                recordingStartTimestampRef.current = Date.now();
                recordingStartTimeRef.current = currentTime;
            };
            
            recorder.onstop = async () => {
                console.log('Recorder stopped');
                const duration = (Date.now() - recordingStartTimestampRef.current) / 1000;
                console.log('Duration:', duration, 'Chunks:', audioChunksRef.current.length);
                
                // Stop tracks
                if (mediaStreamRef.current) {
                    mediaStreamRef.current.getTracks().forEach(t => t.stop());
                    mediaStreamRef.current = null;
                }
                
                const chunks = [...audioChunksRef.current];
                audioChunksRef.current = [];
                
                if (chunks.length === 0 || duration < 0.3) {
                    setVoiceoverError('Recording failed or too short. Please try again.');
                    return;
                }
                
                const blob = new Blob(chunks, { type: recordingMimeTypeRef.current });
                console.log('Blob size:', blob.size);
                
                if (blob.size < 100) {
                    setVoiceoverError('No audio captured. Check microphone.');
                    return;
                }
                
                // Save
                const reader = new FileReader();
                reader.onloadend = async () => {
                    const fileName = `voiceover_${Date.now()}.webm`;
                    try {
                        const result = await window.electronAPI.saveVoiceover(reader.result, fileName, sessionId);
                        if (result.success && onAddVoiceover) {
                            onAddVoiceover({
                                name: fileName,
                                path: result.filePath,
                                audioPath: result.filePath,
                                duration: Math.max(0.5, duration),
                                startTime: recordingStartTimeRef.current,
                                type: 'audio',
                                source: 'voiceover',
                            });
                        } else {
                            setVoiceoverError('Failed to save voiceover');
                        }
                    } catch (err) {
                        setVoiceoverError('Save error: ' + err.message);
                    }
                };
                reader.readAsDataURL(blob);
            };
            
            recorder.onerror = (e) => {
                console.error('Recorder error:', e);
                setVoiceoverError('Recording error');
            };
            
            // Start recording with timeslice
            console.log('Calling recorder.start()...');
            recorder.start(500);
            console.log('Recorder state after start:', recorder.state);
            
            // Verify it's actually recording after a short delay
            setTimeout(() => {
                console.log('State check after 100ms:', recorder.state);
                if (recorder.state !== 'recording') {
                    console.error('Recorder is not recording!');
                    setVoiceoverError('Recording failed to start');
                    setIsRecording(false);
                }
            }, 100);
            
            setIsRecording(true);
            setRecordingDuration(0);
            
            recordingIntervalRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 0.1);
            }, 100);
            
        } catch (err) {
            console.error('startRecording error:', err);
            setVoiceoverError('Error: ' + err.message);
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(t => t.stop());
                mediaStreamRef.current = null;
            }
            setIsRecording(false);
        }
    };

    // Stop recording
    const stopRecording = () => {
        console.log('=== STOP RECORDING ===');
        console.log('Recorder state:', mediaRecorderRef.current?.state);
        
        if (recordingIntervalRef.current) {
            clearInterval(recordingIntervalRef.current);
            recordingIntervalRef.current = null;
        }
        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        
        setIsRecording(false);
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (recordingIntervalRef.current) {
                clearInterval(recordingIntervalRef.current);
            }
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    const handleAddVideo = async () => {
        const result = await window.electronAPI.selectFile({
            title: 'Select Video',
            filters: [
                { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] },
            ],
            properties: ['openFile'],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const videoPath = result.filePaths[0];
            const fileName = videoPath.split(/[\\/]/).pop();

            onAddClip({
                type: 'video',
                source: 'imported',
                videoPath,
                name: fileName,
                duration: 0,
            });
        }
    };

    const handleAddAudio = async () => {
        const result = await window.electronAPI.selectFile({
            title: 'Select Audio',
            filters: [
                { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'ogg', 'm4a'] },
            ],
            properties: ['openFile'],
        });

        if (!result.canceled && result.filePaths.length > 0) {
            const audioPath = result.filePaths[0];
            const fileName = audioPath.split(/[\\/]/).pop();

            // Get audio duration using an Audio element
            const audio = new Audio();
            audio.src = `file:///${audioPath.replace(/\\/g, '/')}`;
            
            audio.onloadedmetadata = () => {
                onAddClip({
                    type: 'audio',
                    source: 'imported',
                    audioPath,
                    path: audioPath,
                    name: fileName,
                    duration: audio.duration || 0,
                });
            };
            
            audio.onerror = () => {
                // Add with 0 duration if we can't determine it
                onAddClip({
                    type: 'audio',
                    source: 'imported',
                    audioPath,
                    path: audioPath,
                    name: fileName,
                    duration: 30, // Default duration
                });
            };
        }
    };

    return (
        <div className="w-64 bg-dark-800 border-r border-dark-700 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-dark-700">
                <FolderOpen className="w-4 h-4 text-primary-500" />
                <h3 className="font-semibold">Assets</h3>
            </div>

            {/* Add Buttons */}
            <div className="p-3 border-b border-dark-700 space-y-2">
                <button
                    className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                    onClick={handleAddVideo}
                >
                    <Video className="w-4 h-4" />
                    Add Video
                </button>

                <button
                    className="btn btn-secondary w-full flex items-center justify-center gap-2 text-sm"
                    onClick={handleAddAudio}
                >
                    <Music className="w-4 h-4" />
                    Add Audio
                </button>

                {/* Voiceover Recording Section */}
                <div className="border-t border-dark-600 pt-2 mt-2">
                    <button
                        className="w-full flex items-center justify-between text-sm text-gray-300 hover:text-white transition-colors py-1"
                        onClick={() => setShowVoiceoverSection(!showVoiceoverSection)}
                    >
                        <span className="flex items-center gap-2">
                            <Mic className="w-4 h-4" />
                            Record Voiceover
                        </span>
                        {showVoiceoverSection ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </button>
                    
                    {showVoiceoverSection && (
                        <div className="mt-2 space-y-2">
                            {/* Device Selection */}
                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Input Device</label>
                                <select
                                    value={selectedDevice}
                                    onChange={(e) => setSelectedDevice(e.target.value)}
                                    disabled={isRecording}
                                    className="w-full bg-dark-700 border border-dark-600 rounded px-2 py-1.5 text-xs text-white focus:border-primary-500 focus:outline-none disabled:opacity-50"
                                >
                                    {audioDevices.length === 0 ? (
                                        <option value="">No devices found</option>
                                    ) : (
                                        audioDevices.map((device) => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>

                            {/* Recording Info */}
                            <div className="text-xs text-gray-400">
                                {isRecording ? (
                                    <span className="flex items-center gap-2 text-red-400">
                                        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                                        Recording: {recordingDuration.toFixed(1)}s
                                    </span>
                                ) : (
                                    <span>
                                        Starts at: {currentTime.toFixed(1)}s on timeline
                                    </span>
                                )}
                            </div>

                            {/* Record/Stop Button */}
                            {!isRecording ? (
                                <button
                                    onClick={startRecording}
                                    disabled={audioDevices.length === 0}
                                    className="btn w-full flex items-center justify-center gap-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Mic className="w-4 h-4" />
                                    Start Recording
                                </button>
                            ) : (
                                <button
                                    onClick={stopRecording}
                                    className="btn w-full flex items-center justify-center gap-2 text-sm bg-gray-600 hover:bg-gray-700"
                                >
                                    <Square className="w-4 h-4" />
                                    Stop Recording
                                </button>
                            )}

                            {/* Error message */}
                            {voiceoverError && (
                                <div className="text-xs text-red-400 mt-1">
                                    {voiceoverError}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Asset List - scrollable with mouse/touchpad */}
            <div className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-dark-600 scrollbar-track-dark-800" style={{ scrollBehavior: 'smooth' }}>
                {/* Generating Tasks Progress */}
                {generatingTasks.length > 0 && (
                    <div className="space-y-2 mb-3">
                        {generatingTasks.map((task) => {
                            // Determine colors based on task type
                            const isRender = task.isRender;
                            const isExport = task.isExport;
                            const borderColor = isExport ? 'border-green-500/50' : isRender ? 'border-purple-500/50' : 'border-yellow-500/50';
                            const bgColor = isExport ? 'bg-green-500/10' : isRender ? 'bg-purple-500/10' : 'bg-yellow-500/10';
                            const textColor = isExport ? 'text-green-400' : isRender ? 'text-purple-400' : 'text-yellow-400';
                            const progressColor = isExport ? 'bg-green-500' : isRender ? 'bg-purple-500' : 'bg-yellow-500';
                            const label = isExport ? 'Exporting...' : isRender ? 'Rendering...' : 'Generating...';
                            
                            return (
                                <div
                                    key={task.taskId}
                                    className={`panel p-3 ${borderColor} ${bgColor}`}
                                >
                                    <div className="flex items-start gap-2">
                                        <Loader2 className={`w-4 h-4 flex-shrink-0 animate-spin ${textColor}`} />
                                        <div className="flex-1 overflow-hidden">
                                            <div className={`text-sm font-medium truncate ${textColor}`}>
                                                {label}
                                            </div>
                                            <div className="text-xs text-gray-400 mt-1 truncate">
                                                {task.prompt?.substring(0, 40)}{task.prompt?.length > 40 ? '...' : ''}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {task.message}
                                            </div>
                                            {/* Progress bar */}
                                            <div className="mt-2 h-1 bg-dark-700 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-300 ${progressColor}`}
                                                    style={{ width: `${task.progress || 0}%` }}
                                                />
                                            </div>
                                        </div>
                                        {onCancelGeneration && (
                                            <button
                                                onClick={() => onCancelGeneration(task.taskId)}
                                                className="text-gray-400 hover:text-red-400 transition-colors"
                                                title={isExport ? 'Cancel export' : isRender ? 'Cancel render' : 'Cancel generation'}
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                
                {clips.length === 0 && generatingTasks.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                        <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No assets yet</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {clips.map((clip) => (
                            <div
                                key={clip.id}
                                onClick={() => onSelectClip(clip)}
                                className={`panel p-3 cursor-pointer hover:border-primary-500 transition-colors group ${
                                    clip.isVoiceover ? 'border-l-2 border-l-red-500' : ''
                                }`}
                            >
                                <div className="flex items-start gap-2">
                                    {clip.type === 'video' ? (
                                        <Video className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    ) : clip.isVoiceover ? (
                                        <Mic className="w-4 h-4 text-red-400 flex-shrink-0" />
                                    ) : (
                                        <Music className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    )}

                                    <div className="flex-1 overflow-hidden">
                                        <div className="text-sm font-medium truncate">
                                            {clip.name}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {clip.isVoiceover ? 'voiceover' : clip.source}
                                            {clip.duration ? ` • ${clip.duration.toFixed(1)}s` : ''}
                                        </div>
                                    </div>

                                    {onRemoveAsset && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveAsset(clip.id, clip.type);
                                            }}
                                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all p-1 rounded hover:bg-dark-700"
                                            title="Delete asset"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AssetPanel;
