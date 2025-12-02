import { useState, useEffect, useCallback, useMemo } from 'react';
import './index.css';
import VideoPlayer from './components/VideoPlayer';
import CodeEditor from './components/CodeEditor';
import Timeline from './components/Timeline';
import Toolbar from './components/Toolbar';
import AssetPanel from './components/AssetPanel';
import PropertiesPanel from './components/PropertiesPanel';
import { v4 as uuidv4 } from 'uuid';

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-blue-600';

  return (
    <div className={`fixed top-4 right-4 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3 animate-slide-in`}>
      <span>{message}</span>
      <button onClick={onClose} className="text-white hover:text-gray-200">×</button>
    </div>
  );
};

function App() {
  // Restore session ID from sessionStorage if available (for soft refresh)
  const [sessionId, setSessionId] = useState(() => {
    const savedSessionId = sessionStorage.getItem('video-editor-session-id');
    if (savedSessionId) {
      // Clear it after reading so it doesn't persist across browser restarts
      sessionStorage.removeItem('video-editor-session-id');
      return savedSessionId;
    }
    return uuidv4();
  });
  const [currentVideo, setCurrentVideo] = useState(null);
  const [currentCode, setCurrentCode] = useState('');
  const [clips, setClips] = useState([]);
  const [audioClips, setAudioClips] = useState([]);
  const [textOverlays, setTextOverlays] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [selectedTextOverlay, setSelectedTextOverlay] = useState(null);
  const [isRendering, setIsRendering] = useState(false);
  const [config, setConfig] = useState(null);
  const [toast, setToast] = useState(null);
  const [renderProgress, setRenderProgress] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [seekToTime, setSeekToTime] = useState(null);
  
  // Non-blocking generation tracking
  const [generatingTasks, setGeneratingTasks] = useState([]);
  
  // Layout state for resizable video player (pixel-based for smooth resizing)
  const [playerHeight, setPlayerHeight] = useState(350); // pixels
  const [showCodeEditor, setShowCodeEditor] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(288);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCodeEditorFullscreen, setIsCodeEditorFullscreen] = useState(false);
  
  // Check if selected clip is trimmed (code shouldn't be shown for trimmed clips)
  const isSelectedClipTrimmed = useMemo(() => {
    if (!selectedClip || selectedClip.type !== 'video') return false;
    const hasTrimStart = selectedClip.trimStart && selectedClip.trimStart > 0;
    const hasTrimEnd = selectedClip.trimEnd && selectedClip.duration && selectedClip.trimEnd < selectedClip.duration;
    return hasTrimStart || hasTrimEnd;
  }, [selectedClip]);
  
  // Code to display - empty if selected clip is trimmed
  const displayCode = useMemo(() => {
    if (isSelectedClipTrimmed) return '';
    return currentCode;
  }, [currentCode, isSelectedClipTrimmed]);
  
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  // Handle Escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
        if (isCodeEditorFullscreen) setIsCodeEditorFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isCodeEditorFullscreen]);

  useEffect(() => {
    // Initialize session and load existing files
    const initSession = async () => {
      try {
        const cfg = await window.electronAPI.getConfig();
        setConfig(cfg);
        await window.electronAPI.createSession(sessionId);
        
        // Load existing files from session directory
        const sessionFiles = await window.electronAPI.loadSessionFiles(sessionId);
        if (sessionFiles.success) {
          // Load videos as clips
          const videoClips = sessionFiles.videos.map(video => ({
            id: uuidv4(),
            type: 'video',
            source: 'backend',
            videoPath: video.path,
            name: video.name,
            duration: 0,
            trimStart: 0,
            trimEnd: 0, // Will be set when video loads
          }));
          
          // Load rendered videos as clips
          const renderClips = sessionFiles.renders.map(render => ({
            id: uuidv4(),
            type: 'video',
            source: 'local',
            videoPath: render.path,
            name: render.name,
            duration: 0,
            trimStart: 0,
            trimEnd: 0, // Will be set when video loads
          }));
          
          if (videoClips.length > 0 || renderClips.length > 0) {
            const allClips = [...videoClips, ...renderClips];
            setClips(allClips);
            // Set the first video as current and auto-select it
            if (videoClips.length > 0) {
              setCurrentVideo(videoClips[0].videoPath);
              setSelectedClip(videoClips[0]);
            } else if (renderClips.length > 0) {
              setCurrentVideo(renderClips[0].videoPath);
              setSelectedClip(renderClips[0]);
            }
          }
          
          // Load the most recent code file
          if (sessionFiles.code.length > 0) {
            const latestCode = sessionFiles.code[sessionFiles.code.length - 1];
            setCurrentCode(latestCode.content);
          }
          
          const totalFiles = videoClips.length + renderClips.length + sessionFiles.code.length;
          if (totalFiles > 0) {
            showToast(`Session restored: ${totalFiles} file(s) loaded`, 'success');
          } else {
            showToast('Session initialized successfully', 'success');
          }
        } else {
          showToast('Session initialized successfully', 'success');
        }
      } catch (error) {
        showToast(`Failed to initialize session: ${error.message}`, 'error');
      }
    };

    // Listen for manim render progress updates
    const handleProgress = (event, progress) => {
      setRenderProgress(progress);
    };

    // Listen for generation progress updates (non-blocking)
    const handleGenerationProgress = (event, data) => {
      setGeneratingTasks(prev => 
        prev.map(task => 
          task.taskId === data.taskId 
            ? { ...task, ...data }
            : task
        )
      );
    };

    // Listen for generation completion
    const handleGenerationComplete = async (event, data) => {
      // Remove from generating tasks
      setGeneratingTasks(prev => prev.filter(task => task.taskId !== data.taskId));
      
      if (data.success) {
        // Load code from local file if available, otherwise fetch from backend
        if (data.localCodePath) {
          // Code was already saved locally by main process
          try {
            const codeResult = await window.electronAPI.readLocalFile(data.localCodePath);
            if (codeResult.success) {
              setCurrentCode(codeResult.content);
            }
          } catch (codeError) {
            console.warn('Could not read local code file:', codeError);
          }
        } else if (data.codeFilename) {
          // Fallback: fetch from backend
          try {
            const codeResult = await window.electronAPI.getCodeFile(data.codeFilename);
            if (codeResult.success) {
              setCurrentCode(codeResult.code);
            }
          } catch (codeError) {
            console.warn('Could not fetch code file:', codeError);
          }
        }

        // Add to clips - backend returns videoPath (local file path)
        const newClip = {
          id: uuidv4(),
          type: 'video',
          source: 'backend',
          videoPath: data.videoPath,
          name: `Generated: ${data.prompt?.substring(0, 30)}...`,
          duration: 0, // Will be set when video loads
          trimStart: 0,
          trimEnd: 0, // Will be set when video loads
        };

        setClips(prev => [...prev, newClip]);
        setSelectedClip(newClip); // Auto-select the new clip
        setCurrentVideo(data.videoPath);
        showToast('Video generated successfully!', 'success');
      } else {
        showToast(`Failed to generate video: ${data.error}`, 'error');
      }
    };

    // Listen for session refresh from menu
    const handleSessionRefresh = async (event, { keepSession }) => {
      if (keepSession) {
        // Soft refresh - reload session files without clearing
        // Store sessionId in sessionStorage before reload so it persists
        sessionStorage.setItem('video-editor-session-id', sessionId);
        window.location.reload();
      } else {
        // Hard refresh - clear current session and create new one
        try {
          await window.electronAPI.clearSession(sessionId);
        } catch (e) {
          console.warn('Could not clear old session:', e);
        }
        const newId = uuidv4();
        setSessionId(newId);
        setClips([]);
        setAudioClips([]);
        setTextOverlays([]);
        setCurrentVideo(null);
        setCurrentCode('');
        setSelectedClip(null);
        setGeneratingTasks([]);
        // Initialize new session
        await window.electronAPI.createSession(newId);
        showToast('New session started', 'success');
      }
    };

    // Listen for clear generated videos from menu
    const handleClearGeneratedVideos = async () => {
      try {
        await window.electronAPI.clearGeneratedVideos();
        showToast('Generated videos cleared', 'success');
      } catch (error) {
        showToast(`Failed to clear videos: ${error.message}`, 'error');
      }
    };

    // Handle render progress updates
    const handleRenderProgress = (event, data) => {
      setGeneratingTasks(prev => {
        const existing = prev.find(t => t.taskId === data.taskId);
        if (existing) {
          return prev.map(t => t.taskId === data.taskId 
            ? { ...t, status: data.status, message: data.message, progress: data.progress }
            : t
          );
        }
        return prev;
      });
    };

    // Handle render completion
    const handleRenderComplete = (event, data) => {
      // Remove from generating tasks first
      setGeneratingTasks(prev => prev.filter(task => task.taskId !== data.taskId));
      
      if (data.success) {
        const newClip = {
          id: uuidv4(),
          type: 'video',
          source: 'local',
          videoPath: data.videoPath,
          name: `Rendered: ${data.sceneName}`,
          duration: 0,
          trimStart: 0,
          trimEnd: 0,
        };

        setClips(prev => [...prev, newClip]);
        setSelectedClip(newClip);
        setCurrentVideo(data.videoPath);
        showToast(`Successfully rendered scene: ${data.sceneName}`, 'success');
      } else {
        showToast(`Render failed: ${data.error}`, 'error');
      }
    };

    window.electronAPI.onManimProgress(handleProgress);
    window.electronAPI.onGenerationProgress(handleGenerationProgress);
    window.electronAPI.onGenerationComplete(handleGenerationComplete);
    window.electronAPI.onRenderProgress(handleRenderProgress);
    window.electronAPI.onRenderComplete(handleRenderComplete);
    window.electronAPI.onSessionRefresh(handleSessionRefresh);
    window.electronAPI.onClearGeneratedVideos(handleClearGeneratedVideos);
    initSession();

    return () => {
      // Cleanup listeners
      window.electronAPI.removeGenerationListeners?.();
      window.electronAPI.removeRenderListeners?.();
    };
  }, [sessionId, showToast]);

  // Non-blocking video generation - starts generation and returns immediately
  const handleGenerateVideo = async (prompt) => {
    try {
      const generationId = uuidv4();
      const result = await window.electronAPI.generateVideo(prompt, generationId, sessionId);
      
      if (result.status === 'started') {
        // Add to generating tasks - progress updates will come via events
        setGeneratingTasks(prev => [...prev, {
          taskId: result.taskId,
          prompt: prompt,
          status: 'generating',
          message: 'Starting generation...',
          progress: 0
        }]);
        showToast('Video generation started', 'info');
      } else {
        showToast(`Failed to start generation: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Error starting video generation:', error);
      showToast(`Error starting video generation: ${error.message}`, 'error');
    }
  };

  // Cancel a generation task
  const handleCancelGeneration = async (taskId) => {
    try {
      await window.electronAPI.cancelGeneration(taskId);
      setGeneratingTasks(prev => prev.filter(task => task.taskId !== taskId));
      showToast('Generation cancelled', 'info');
    } catch (error) {
      showToast(`Failed to cancel: ${error.message}`, 'error');
    }
  };

  const handleRenderCode = async (code, sceneName = 'CreateCircle') => {
    try {
      const result = await window.electronAPI.renderManim(sessionId, code, sceneName);
      
      if (result.status === 'started') {
        // Add to generating tasks - progress updates will come via events
        setGeneratingTasks(prev => [...prev, {
          taskId: result.taskId,
          prompt: `Render: ${sceneName}`,
          status: 'rendering',
          message: 'Starting render...',
          progress: 0,
          isRender: true
        }]);
        showToast('Render started', 'info');
      } else {
        showToast(`Failed to start render: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Error starting render:', error);
      showToast(`Error starting render: ${error.message || error.error || 'Unknown error'}`, 'error');
    }
  };

  const handleAddClip = (clip) => {
    setClips(prev => [...prev, { ...clip, id: uuidv4() }]);
    showToast(`Added clip: ${clip.name}`, 'success');
  };

  const handleRemoveClip = (clipId) => {
    const clipToRemove = clips.find(c => c.id === clipId);
    setClips(prev => prev.filter(c => c.id !== clipId));
    if (selectedClip?.id === clipId) {
      setSelectedClip(null);
      setCurrentVideo(null);
    }
    if (clipToRemove) {
      showToast(`Removed clip: ${clipToRemove.name}`, 'info');
    }
  };

  const handleExport = async (options) => {
    if (clips.length === 0) {
      showToast('No clips to export', 'error');
      return;
    }

    setIsRendering(true);
    setRenderProgress('Exporting video...');
    try {
      // If multiple clips, join them first
      if (clips.length > 1) {
        const videoPaths = clips.map(c => c.videoPath || c.videoUrl).filter(Boolean);
        if (videoPaths.length === 0) {
          showToast('No valid video paths found', 'error');
          return;
        }

        const sessionPath = await window.electronAPI.getSessionPath?.(sessionId) || '';
        const joinedPath = `${sessionPath}${sessionId}_joined.mp4`;
        
        setRenderProgress('Joining videos...');
        await window.electronAPI.joinVideos(videoPaths, joinedPath);

        // Then export
        const result = await window.electronAPI.saveFile({
          title: 'Export Video',
          defaultPath: 'video.mp4',
          filters: [{ name: 'Video', extensions: ['mp4'] }],
        });

        if (!result.canceled && result.filePath) {
          setRenderProgress('Exporting final video...');
          await window.electronAPI.exportVideo(joinedPath, result.filePath, options);
          showToast(`Video exported successfully to ${result.filePath}`, 'success');
        }
      } else {
        // Export single clip
        const result = await window.electronAPI.saveFile({
          title: 'Export Video',
          defaultPath: 'video.mp4',
          filters: [{ name: 'Video', extensions: ['mp4'] }],
        });

        if (!result.canceled && result.filePath) {
          const videoPath = clips[0].videoPath || clips[0].videoUrl;
          if (!videoPath) {
            showToast('No valid video path for export', 'error');
            return;
          }
          setRenderProgress('Exporting video...');
          await window.electronAPI.exportVideo(videoPath, result.filePath, options);
          showToast(`Video exported successfully to ${result.filePath}`, 'success');
        }
      }
    } catch (error) {
      console.error('Error exporting video:', error);
      showToast(`Error exporting video: ${error.message}`, 'error');
    } finally {
      setIsRendering(false);
      setRenderProgress('');
    }
  };

  const handleDurationChange = useCallback((clipId, duration) => {
    setClips(prev => prev.map(c => {
      if (c.id === clipId) {
        // Update duration and set trimEnd to full duration if not already trimmed
        const newClip = { ...c, duration };
        // Only set trimEnd if it hasn't been manually trimmed yet (trimEnd is 0 or undefined)
        if (!c.trimEnd || c.trimEnd === 0) {
          newClip.trimEnd = duration;
        }
        // Ensure trimStart is set
        if (c.trimStart === undefined) {
          newClip.trimStart = 0;
        }
        return newClip;
      }
      return c;
    }));
  }, []);

  // Handle adding a new clip (from trimmed videos, etc.)
  const handleAddNewClip = useCallback((clipData) => {
    const newClip = { ...clipData, id: uuidv4() };
    setClips(prev => [...prev, newClip]);
    showToast(`Created clip: ${newClip.name}`, 'success');
  }, [showToast]);

  // Handle trimming a clip on timeline via drag
  const handleTrimClip = useCallback((clipId, trimStart, trimEnd) => {
    setClips(prev => prev.map(c => {
      if (c.id === clipId) {
        return { ...c, trimStart, trimEnd };
      }
      return c;
    }));
  }, []);

  // Add audio clip to timeline
  const handleAddAudioToTimeline = useCallback((audioClip) => {
    const newAudioClip = {
      ...audioClip,
      id: uuidv4(),
      startTime: 0,
      timelineId: uuidv4(),
      trimStart: 0,
      trimEnd: audioClip.duration || 10,
    };
    setAudioClips(prev => [...prev, newAudioClip]);
    showToast(`Added audio to timeline: ${audioClip.name}`, 'success');
  }, [showToast]);

  // Remove audio from timeline
  const handleRemoveAudio = useCallback((audioId) => {
    setAudioClips(prev => prev.filter(a => a.timelineId !== audioId));
    showToast('Removed audio from timeline', 'info');
  }, [showToast]);

  // Add text overlay
  const handleAddText = useCallback((textData) => {
    const newText = {
      ...textData,
      id: uuidv4(),
    };
    setTextOverlays(prev => [...prev, newText]);
    showToast(`Added text overlay: "${textData.text.substring(0, 20)}..."`, 'success');
  }, [showToast]);

  // Remove text overlay
  const handleRemoveText = useCallback((textId) => {
    setTextOverlays(prev => prev.filter(t => t.id !== textId));
    if (selectedTextOverlay?.id === textId) {
      setSelectedTextOverlay(null);
    }
    showToast('Removed text overlay', 'info');
  }, [selectedTextOverlay, showToast]);

  // Select text overlay
  const handleSelectText = useCallback((textId) => {
    const text = textOverlays.find(t => t.id === textId);
    setSelectedTextOverlay(text || null);
  }, [textOverlays]);

  // Handle timeline seek - select correct clip and seek within it
  const handleSeek = useCallback((globalTime) => {
    setCurrentTime(globalTime);
    
    // Find which clip should be playing at this global time
    const videoClips = clips.filter(c => c.type === 'video');
    let accumulatedTime = 0;
    
    for (const clip of videoClips) {
      const clipDuration = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
      if (globalTime < accumulatedTime + clipDuration) {
        // This clip should be selected
        const localTime = (clip.trimStart || 0) + (globalTime - accumulatedTime);
        
        if (selectedClip?.id !== clip.id) {
          setSelectedClip(clip);
          setCurrentVideo(clip.videoPath || clip.videoUrl);
        }
        
        // Set seek time for VideoPlayer
        setSeekToTime(localTime);
        return;
      }
      accumulatedTime += clipDuration;
    }
    
    // If past all clips, select last clip at end
    const lastClip = videoClips[videoClips.length - 1];
    if (lastClip) {
      if (selectedClip?.id !== lastClip.id) {
        setSelectedClip(lastClip);
        setCurrentVideo(lastClip.videoPath || lastClip.videoUrl);
      }
      setSeekToTime(lastClip.trimEnd || lastClip.duration || 0);
    }
  }, [clips, selectedClip]);

  // Calculate which clip is at a given global timeline time
  const getClipAtTime = useCallback((globalTime) => {
    const videoClips = clips.filter(c => c.type === 'video');
    let accumulatedTime = 0;
    
    for (const clip of videoClips) {
      const clipDuration = (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
      if (globalTime < accumulatedTime + clipDuration) {
        return {
          clip,
          clipStartOnTimeline: accumulatedTime,
          localTime: (clip.trimStart || 0) + (globalTime - accumulatedTime)
        };
      }
      accumulatedTime += clipDuration;
    }
    
    // Return last clip if past end
    const lastClip = videoClips[videoClips.length - 1];
    if (lastClip) {
      return {
        clip: lastClip,
        clipStartOnTimeline: accumulatedTime - ((lastClip.trimEnd || lastClip.duration || 0) - (lastClip.trimStart || 0)),
        localTime: lastClip.trimEnd || lastClip.duration || 0
      };
    }
    return null;
  }, [clips]);

  // Calculate global timeline position for a clip
  const getClipTimelineStart = useCallback((clipId) => {
    const videoClips = clips.filter(c => c.type === 'video');
    let accumulatedTime = 0;
    
    for (const clip of videoClips) {
      if (clip.id === clipId) {
        return accumulatedTime;
      }
      accumulatedTime += (clip.trimEnd || clip.duration || 0) - (clip.trimStart || 0);
    }
    return 0;
  }, [clips]);

  // Handle time update from video player - convert to global timeline time
  const handleTimeUpdate = useCallback((localTime, clipId) => {
    if (!clipId) {
      setCurrentTime(localTime);
      return;
    }
    // Convert clip's local time to global timeline time
    const timelineStart = getClipTimelineStart(clipId);
    const clip = clips.find(c => c.id === clipId);
    if (clip) {
      const relativeTime = localTime - (clip.trimStart || 0);
      setCurrentTime(timelineStart + relativeTime);
    }
  }, [getClipTimelineStart, clips]);

  // Handle play state change
  const handlePlayStateChange = useCallback((playing) => {
    setIsPlaying(playing);
  }, []);

  // Handle clip ended - auto-play next clip seamlessly
  const handleClipEnded = useCallback((nextClip) => {
    setSelectedClip(nextClip);
    setCurrentVideo(nextClip.videoPath || nextClip.videoUrl);
    // isPlaying stays true for seamless transition
  }, []);

  // Handle audio trim
  const handleTrimAudio = useCallback((audioId, trimStart, trimEnd) => {
    setAudioClips(prev => prev.map(a => {
      if ((a.timelineId || a.id) === audioId) {
        return { ...a, trimStart, trimEnd };
      }
      return a;
    }));
  }, []);

  // Handle video player resize - smooth pixel-based resizing
  const handlePlayerResize = useCallback((deltaY) => {
    setPlayerHeight(prev => {
      // Calculate available height: window height - toolbar(50) - timeline(180) - code editor min(120) - padding
      const maxHeight = window.innerHeight - 350;
      // Allow minimum of 150px for player (controls are ~60px, so video area gets ~90px min)
      const newHeight = Math.max(150, Math.min(maxHeight, prev + deltaY));
      return newHeight;
    });
  }, []);

  // Toggle code editor visibility
  const toggleCodeEditor = useCallback(() => {
    setShowCodeEditor(prev => !prev);
  }, []);

  // Toggle right panel visibility
  const toggleRightPanel = useCallback(() => {
    setShowRightPanel(prev => !prev);
  }, []);

  // Toggle video-only fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Split video clip at position
  const handleSplitClip = useCallback((clipId, splitTime) => {
    setClips(prev => {
      const clipIndex = prev.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return prev;
      
      const clip = prev[clipIndex];
      const clipStart = clip.trimStart || 0;
      const clipEnd = clip.trimEnd || clip.duration || 0;
      
      // Create first part (from start to split point)
      const firstPart = {
        ...clip,
        id: uuidv4(),
        name: clip.name.replace(/ \(part \d+\)$/, '') + ' (part 1)',
        trimStart: clipStart,
        trimEnd: splitTime,
        // Don't set startTime - let timeline position consecutively
      };
      
      // Create second part (from split point to end)
      const secondPart = {
        ...clip,
        id: uuidv4(),
        name: clip.name.replace(/ \(part \d+\)$/, '') + ' (part 2)',
        trimStart: splitTime,
        trimEnd: clipEnd,
        // Don't set startTime - let timeline position consecutively
      };
      
      // Replace original with two parts
      const newClips = [...prev];
      newClips.splice(clipIndex, 1, firstPart, secondPart);
      return newClips;
    });
    showToast('Video clip split into two parts', 'success');
  }, [showToast]);

  // Split audio clip at position
  const handleSplitAudio = useCallback((audioId, splitTime) => {
    setAudioClips(prev => {
      const audioIndex = prev.findIndex(a => (a.timelineId || a.id) === audioId);
      if (audioIndex === -1) return prev;
      
      const audio = prev[audioIndex];
      const audioStart = audio.trimStart || 0;
      const audioEnd = audio.trimEnd || audio.duration || 0;
      
      // Create first part
      const firstPart = {
        ...audio,
        id: uuidv4(),
        timelineId: uuidv4(),
        name: audio.name.replace(/ \(part \d+\)$/, '') + ' (part 1)',
        trimStart: audioStart,
        trimEnd: splitTime,
        // Don't set startTime - let timeline position consecutively
      };
      
      // Create second part
      const secondPart = {
        ...audio,
        id: uuidv4(),
        timelineId: uuidv4(),
        name: audio.name.replace(/ \(part \d+\)$/, '') + ' (part 2)',
        trimStart: splitTime,
        trimEnd: audioEnd,
        // Don't set startTime - let timeline position consecutively
      };
      
      // Replace original with two parts
      const newAudioClips = [...prev];
      newAudioClips.splice(audioIndex, 1, firstPart, secondPart);
      return newAudioClips;
    });
    showToast('Audio clip split into two parts', 'success');
  }, [showToast]);

  return (
    <div className="flex flex-col h-screen bg-dark-900 text-white">
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}

      {/* Render Progress Overlay */}
      {isRendering && renderProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-white">{renderProgress}</p>
          </div>
        </div>
      )}

      {/* Video-Only Fullscreen Overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <VideoPlayer
            videoUrl={currentVideo}
            selectedClip={selectedClip}
            onDurationChange={handleDurationChange}
            onTimeUpdate={handleTimeUpdate}
            onPlayStateChange={handlePlayStateChange}
            currentTime={currentTime}
            audioClips={audioClips}
            textOverlays={textOverlays}
            isPlaying={isPlaying}
            clips={clips}
            onClipEnded={handleClipEnded}
            seekToTime={currentTime}
            onSeekComplete={() => {}}
            playerHeight={window.innerHeight}
            onResize={() => {}}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            showCodeEditor={false}
            onToggleCodeEditor={() => {}}
            showRightPanel={false}
            onToggleRightPanel={() => {}}
            autoPlayOnMount={isPlaying}
          />
        </div>
      )}

      {/* Code Editor Fullscreen Overlay */}
      {isCodeEditorFullscreen && (
        <div className="fixed inset-0 bg-dark-900 z-50 flex flex-col">
          <CodeEditor
            code={displayCode}
            onChange={isSelectedClipTrimmed ? undefined : setCurrentCode}
            onRender={handleRenderCode}
            isRendering={isRendering}
            isFullscreen={true}
            onToggleFullscreen={() => setIsCodeEditorFullscreen(false)}
            readOnly={isSelectedClipTrimmed}
            placeholder={isSelectedClipTrimmed ? "Code not available for trimmed clips" : undefined}
          />
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        onGenerateVideo={handleGenerateVideo}
        onExport={handleExport}
        isRendering={isRendering}
      />

      {/* Main Content Area - fixed height excluding toolbar(50px) and timeline(180px) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel - Assets */}
        <AssetPanel
          clips={clips}
          onAddClip={handleAddClip}
          onSelectClip={setSelectedClip}
          generatingTasks={generatingTasks}
          onCancelGeneration={handleCancelGeneration}
        />

        {/* Center Panel - Video Player & Code Editor (vertical stack) */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {/* Video Player Container - expands to fill space when code editor is hidden */}
          <div 
            className={`relative z-10 overflow-hidden ${showCodeEditor ? 'flex-shrink-0' : 'flex-1'}`}
            style={showCodeEditor ? { height: `${playerHeight}px`, minHeight: '150px' } : { minHeight: '150px' }}
          >
            <VideoPlayer
              videoUrl={currentVideo}
              selectedClip={selectedClip}
              onDurationChange={handleDurationChange}
              onTimeUpdate={handleTimeUpdate}
              onPlayStateChange={handlePlayStateChange}
              currentTime={currentTime}
              audioClips={audioClips}
              textOverlays={textOverlays}
              isPlaying={isPlaying}
              clips={clips}
              onClipEnded={handleClipEnded}
              seekToTime={seekToTime}
              onSeekComplete={() => setSeekToTime(null)}
              playerHeight={playerHeight}
              onResize={handlePlayerResize}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
              showCodeEditor={showCodeEditor}
              onToggleCodeEditor={toggleCodeEditor}
              showRightPanel={showRightPanel}
              onToggleRightPanel={toggleRightPanel}
            />
          </div>

          {/* Code Editor - below video player, above timeline */}
          {showCodeEditor && (
            <div className="flex-1 min-h-[120px] overflow-hidden border-t border-dark-700">
              <CodeEditor
                code={displayCode}
                onChange={isSelectedClipTrimmed ? undefined : setCurrentCode}
                onRender={handleRenderCode}
                isRendering={isRendering}
                isFullscreen={false}
                onToggleFullscreen={() => setIsCodeEditorFullscreen(true)}
                readOnly={isSelectedClipTrimmed}
                placeholder={isSelectedClipTrimmed ? "Code not available for trimmed clips" : undefined}
              />
            </div>
          )}
        </div>

        {/* Right Panel - Properties (conditionally rendered) */}
        {showRightPanel && (
          <div style={{ width: `${rightPanelWidth}px` }} className="flex-shrink-0 transition-all duration-200">
            <PropertiesPanel
              selectedClip={selectedClip}
              onUpdateClip={(updatedClip) => {
                setClips(prev => prev.map(c => c.id === updatedClip.id ? updatedClip : c));
              }}
              onAddClip={handleAddNewClip}
              onAddText={handleAddText}
              onAddAudioToTimeline={handleAddAudioToTimeline}
              currentTime={currentTime}
              selectedTextOverlay={selectedTextOverlay}
              onUpdateText={(updatedText) => {
                setTextOverlays(prev => prev.map(t => t.id === updatedText.id ? updatedText : t));
              }}
              compact={rightPanelWidth < 250}
            />
          </div>
        )}
      </div>

      {/* Bottom Panel - Timeline */}
      <Timeline
        clips={clips}
        selectedClip={selectedClip}
        onSelectClip={setSelectedClip}
        onRemoveClip={handleRemoveClip}
        onReorderClips={setClips}
        audioClips={audioClips}
        textOverlays={textOverlays}
        onTrimClip={handleTrimClip}
        onTrimAudio={handleTrimAudio}
        onSplitClip={handleSplitClip}
        onSplitAudio={handleSplitAudio}
        onRemoveAudio={handleRemoveAudio}
        onRemoveText={handleRemoveText}
        onSelectText={handleSelectText}
        currentTime={currentTime}
        onSeek={handleSeek}
      />
    </div>
  );
}

export default App;
