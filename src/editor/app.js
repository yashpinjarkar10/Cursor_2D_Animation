
const RULER_MAJOR_INTERVAL=5, RULER_MINOR_INTERVAL=0.5;
const DEFAULT_PPS=60, MIN_PPS=20, MAX_PPS=400;
const PRELOAD_MARGIN=0.6;
const SHOW_RULER_TIME_LABELS=false;
const PROVISIONAL_MIN_DURATION=0.3;
const METADATA_TIMEOUT_MS=8000;
const DURATION_MIN_ACCEPT=0.05;
const IMPORT_DEBUG=true;
const OVERLAY_OFFSET_STEP=30;
const OVERLAY_MAX_AUTO_OFFSET=8;

const project={
  videoClips:[],audioClips:[],overlays:[],
  inPoint:null,outPoint:null,loop:false,
  settings:{pixelsPerSecond:DEFAULT_PPS,frameRate:30},
  ui:{snapTolerance:0.1}
};

let globalTime=0,isPlaying=false,draggingPlayhead=false;
let selectedVideoId=null,selectedOverlayId=null,selectedAudioId=null;
let rippleDelete=false,activeClip=null,nextClip=null;
let currentVideo=null,nextVideo=null,inGapMode=false;
let frameLoopRunning=false,lastPerf=null,pendingVideoFrameCallback=null;
const audioElements=new Map();

const qs=s=>document.querySelector(s);
const videoMain=qs('#videoMain'),overlayStage=qs('#overlayStage');
const videoTrackContent=qs('#videoTrackContent'),overlayTrackContent=qs('#overlayTrackContent');
const audioTrackContent=qs('#audioTrackContent'),layersList=qs('#layersList');
const playheadEl=qs('#playhead'),timeRuler=qs('#timeRuler'),tracksScroller=qs('#tracksScroller');
const inMarker=qs('#inMarker'),outMarker=qs('#outMarker'),rangeFill=qs('#rangeFill');
const tcCurrent=qs('#tcCurrent'),tcDuration=qs('#tcDuration'),tcIn=qs('#tcIn'),tcOut=qs('#tcOut');
const timelineZoom=qs('#timelineZoom'),loopBtn=qs('#loopBtn'),rippleBtn=qs('#rippleBtn');
const clipStartInput=qs('#clipStart'),clipInInput=qs('#clipIn'),clipOutInput=qs('#clipOut');
const ovStartInput=qs('#ovStart'),ovEndInput=qs('#ovEnd'),ovXInput=qs('#ovX'),ovYInput=qs('#ovY');
const ovScaleInput=qs('#ovScale'),ovOpacityInput=qs('#ovOpacity'),ovTextInput=qs('#ovText');
const ovFontSizeInput=qs('#ovFontSize'),ovColorInput=qs('#ovColor');
const audOffsetInput=qs('#audOffset'),audVolumeInput=qs('#audVolume'),audMuteInput=qs('#audMute');
const applyBtn=qs('#applyBtn'),videoClipSection=qs('#videoClipSection'),overlaySection=qs('#overlaySection');
const audioSection=qs('#audioSection'),textFields=qs('#textFields');
const btnClipInSet=qs('#btnClipInSet'),btnClipOutSet=qs('#btnClipOutSet'),btnFitToRange=qs('#btnFitToRange');
const inputVideo=qs('#inputVideo'),inputAudio=qs('#inputAudio'),inputImage=qs('#inputImage');
const addTextBtn=qs('#addTextBtn'),splitBtn=qs('#splitBtn'),deleteBtn=qs('#deleteBtn'),duplicateBtn=qs('#duplicateBtn');
const undoBtn=qs('#undoBtn'),redoBtn=qs('#redoBtn'),playPauseBtn=qs('#playPauseBtn'),replayBtn=qs('#replayBtn');
const frameBackBtn=qs('#frameBackBtn'),frameFwdBtn=qs('#frameFwdBtn'),markInBtn=qs('#markInBtn'),markOutBtn=qs('#markOutBtn');
const exportBtn=qs('#exportBtn'),renderBtn=qs('#renderBtn'),autoFitBtn=qs('#autoFitBtn'),recordVoiceBtn=qs('#recordVoiceBtn');
const voStatus=qs('#voStatus'),voStateSpan=qs('#voState'),voLevelEl=qs('#voLevel'),cancelVoBtn=qs('#cancelVoBtn');
const importStatus = qs('#importStatus');

const genId=p=>p+'_'+Math.random().toString(36).slice(2,9);
const fmt=s=>{ if(s==null||!isFinite(s))return'--:--:--.--'; const ms=Math.floor((s%1)*1000),sec=Math.floor(s)%60,min=Math.floor(s/60)%60,hr=Math.floor(s/3600);return `${String(hr).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`; };
const pps=()=>project.settings.pixelsPerSecond;
const t2x=t=>t*pps(), x2t=x=>x/pps();
function projectDuration(){let m=0;project.videoClips.forEach(c=>{if(c.end>m)m=c.end;});project.audioClips.forEach(a=>{const e=a.offset+a.duration;if(e>m)m=e;});project.overlays.forEach(o=>{if(o.end>m)m=o.end;});return m;}
function boundedStart(){return project.inPoint??0;} function boundedEnd(){return project.outPoint??projectDuration();}
function validateRange(){if(project.inPoint!=null&&project.outPoint!=null&&project.outPoint<=project.inPoint)project.outPoint=project.inPoint+0.05;updateRangeMarkers();}
function findClipAt(t){return project.videoClips.find(c=>t>=c.start&&t<c.end)||null;}
function nextClipAfter(c){if(!c)return null;const i=project.videoClips.indexOf(c);return project.videoClips[i+1]||null;}
const lastTrackEnd=arr=>arr.length?(arr[arr.length-1].end??(arr[arr.length-1].offset+(arr[arr.length-1].duration||0))):0;

const undoStack=[],redoStack=[];let pendingSnapshot=null;
function snapshot(l='change',immediate=false){if(!immediate){pendingSnapshot=l;return;}undoStack.push(JSON.stringify(project));if(undoStack.length>120)undoStack.shift();redoStack.length=0;pendingSnapshot=null;updateUndoRedo();}
function flushSnapshot(){if(pendingSnapshot)snapshot(pendingSnapshot,true);}
function undo(){flushSnapshot();if(!undoStack.length)return;const cur=JSON.stringify(project);const prev=undoStack.pop();redoStack.push(cur);Object.assign(project,JSON.parse(prev));rebuildAll();}
function redo(){flushSnapshot();if(!redoStack.length)return;const cur=JSON.stringify(project);const nxt=redoStack.pop();undoStack.push(cur);Object.assign(project,JSON.parse(nxt));rebuildAll();}
function updateUndoRedo(){undoBtn.disabled=!undoStack.length;redoBtn.disabled=!redoStack.length;}

function rebuildAll(){
  updateTimelineWidths();buildRuler();buildVideoClips();buildOverlayClips();buildAudioClips();buildLayers();updateOverlayZ();
  if(project.videoClips.length&&!activeClip){activateClip(project.videoClips[0],true);globalTime=activeClip.start;}
  updateRangeMarkers();updateTime(true);updateInspector();
}
function updateTimelineWidths(){
  const widthPx=Math.max(400,t2x(projectDuration()+0.1));
  [timeRuler,videoTrackContent,audioTrackContent,overlayTrackContent].forEach(el=>el.style.width=widthPx+'px');
}
function buildRuler(){
  timeRuler.innerHTML='';const dur=projectDuration();
  for(let s=0;s<=dur+1e-6;s+=RULER_MINOR_INTERVAL){
    const isMajor=Math.abs((s/RULER_MAJOR_INTERVAL)-Math.round(s/RULER_MAJOR_INTERVAL))<(RULER_MINOR_INTERVAL/RULER_MAJOR_INTERVAL)*0.51;
    const tick=document.createElement('div');tick.className='ruler-tick '+(isMajor?'major':'minor');tick.style.left=t2x(s)+'px';timeRuler.appendChild(tick);
    if(isMajor && SHOW_RULER_TIME_LABELS){const lbl=document.createElement('div');lbl.className='ruler-label';lbl.style.left=t2x(s)+'px';timeRuler.appendChild(lbl);}
  }
}
function miniRuler(el,start,end){
  const duration=end-start; if(duration<=0)return;
  const root=document.createElement('div');root.className='clip-ruler';el.appendChild(root);
  const firstTick=Math.ceil(start/RULER_MINOR_INTERVAL)*RULER_MINOR_INTERVAL;
  for(let t=firstTick;t<=end+1e-6;t+=RULER_MINOR_INTERVAL){
    const rel=(t-start)/duration;if(rel<0||rel>1)continue;
    const isMajor=Math.abs((t/RULER_MAJOR_INTERVAL)-Math.round(t/RULER_MAJOR_INTERVAL))<(RULER_MINOR_INTERVAL/RULER_MAJOR_INTERVAL)*0.51;
    const div=document.createElement('div');
    Object.assign(div.style,{position:'absolute',left:(rel*100)+'%',top:isMajor?'0':'25%',width:'1px',height:isMajor?'100%':'70%',background:isMajor?'#fff8':'#fff3',transform:'translateX(-0.5px)'});
    root.appendChild(div);
  }
}
function buildVideoClips(){
  videoTrackContent.innerHTML='';
  project.videoClips.forEach(c=>{
    const el=document.createElement('div');el.className='clip video';el.dataset.id=c.id;
    el.style.left=t2x(c.start)+'px';el.style.width=t2x(Math.max(0.05,c.end-c.start))+'px';
    el.innerHTML=`<div class="clip-label">${c.name}</div><div class="handle left" data-edge="left"></div><div class="handle right" data-edge="right"></div>`;
    el.addEventListener('mousedown',e=>startClipDrag(e,c));el.addEventListener('click',e=>{selectVideo(c.id);e.stopPropagation();});
    videoTrackContent.appendChild(el);miniRuler(el,c.start,c.end);
  });updateSelectionHighlights();
}
function buildOverlayClips(){
  overlayTrackContent.innerHTML='';overlayStage.innerHTML='';
  project.overlays.forEach(o=>{
    const clip=document.createElement('div');clip.className='clip overlay';clip.dataset.id=o.id;
    clip.style.left=t2x(o.start)+'px';clip.style.width=t2x(o.end-o.start)+'px';
    clip.innerHTML=`<div class="clip-label">${o.type==='text'?'TEXT':'IMG'}</div><div class="handle left" data-edge="left"></div><div class="handle right" data-edge="right"></div>`;
    clip.addEventListener('mousedown',e=>startOverlayClipDrag(e,o));clip.addEventListener('click',e=>{selectOverlay(o.id);e.stopPropagation();});
    overlayTrackContent.appendChild(clip);miniRuler(clip,o.start,o.end);
    // Stage node that is rendered over the video
    const ov = document.createElement('div');
    ov.className = 'overlay';
    // NEW: absolute positioning and sane defaults
    Object.assign(ov.style, {
      position: 'absolute',
      transformOrigin: 'top left',
      pointerEvents: 'none',
      whiteSpace: 'pre'
    });
    ov.dataset.id = o.id;
    overlayStage.appendChild(ov);
  });
  updateOverlaysVisual();updateSelectionHighlights();
}
function buildAudioClips(){
  audioTrackContent.innerHTML='';
  project.audioClips.forEach(a=>{
    const el=document.createElement('div');el.className='clip audio'+(a.isVO?' voice-over':'');el.dataset.id=a.id;
    el.style.left=t2x(a.offset)+'px';el.style.width=t2x(Math.max(0.05,a.duration))+'px';
    el.innerHTML=`<div class="clip-label">${a.isVO?'VO ':''}${a.name}</div><div class="handle left" data-edge="left"></div><div class="handle right" data-edge="right"></div>`;
    el.addEventListener('mousedown',e=>startAudioClipDrag(e,a));el.addEventListener('click',e=>{selectAudio(a.id);e.stopPropagation();});
    audioTrackContent.appendChild(el);miniRuler(el,a.offset,a.offset+a.duration);
  });updateSelectionHighlights();
}
function buildLayers(){
  layersList.innerHTML='';
  [...project.overlays].slice().reverse().forEach(o=>{
    const li=document.createElement('li');li.className='layer-item';li.dataset.id=o.id;
    li.innerHTML=`<button class="vis-btn">${o.visible?'👁':'🚫'}</button>
      <button class="lock-btn">${o.locked?'🔒':'🔓'}</button>
      <div class="layer-name">${o.type==='text'?'Text':'Image'} ${o.id.slice(-4)}</div>
      <select class="blend">
        <option ${o.blend==='normal'?'selected':''}>normal</option>
        <option ${o.blend==='multiply'?'selected':''}>multiply</option>
        <option ${o.blend==='screen'?'selected':''}>screen</option>
        <option ${o.blend==='overlay'?'selected':''}>overlay</option>
      </select>
      <div class="opacity-row"><span>Op</span><input type="range" min="0" max="1" step="0.01" value="${o.opacity}"></div>`;
    li.addEventListener('click',e=>{
      if(e.target.classList.contains('vis-btn')){o.visible=!o.visible;e.target.textContent=o.visible?'👁':'🚫';updateOverlaysVisual();snapshot('ovVis');return;}
      if(e.target.classList.contains('lock-btn')){o.locked=!o.locked;e.target.textContent=o.locked?'🔒':'🔓';snapshot('ovLock');return;}
      selectOverlay(o.id);
    });
    li.querySelector('.blend').addEventListener('change',ev=>{o.blend=ev.target.value;updateOverlaysVisual();snapshot('blend');});
    li.querySelector('input[type=range]').addEventListener('input',ev=>{o.opacity=parseFloat(ev.target.value);updateOverlaysVisual();});
    layersList.appendChild(li);
  });
  updateOverlayZ();updateSelectionHighlights();
}
function updateOverlayZ(){project.overlays.forEach((o,i)=>{const el=overlayStage.querySelector(`.overlay[data-id="${o.id}"]`);if(el)el.style.zIndex=String(100+i);});}

function selectVideo(id){selectedVideoId=id;selectedOverlayId=null;selectedAudioId=null;updateSelectionHighlights();updateInspector();}
function selectOverlay(id){selectedOverlayId=id;selectedVideoId=null;selectedAudioId=null;updateSelectionHighlights();updateInspector();}
function selectAudio(id){selectedAudioId=id;selectedVideoId=null;selectedOverlayId=null;updateSelectionHighlights();updateInspector();}
function updateSelectionHighlights(){
  document.querySelectorAll('.clip.video').forEach(c=>c.classList.toggle('selected',c.dataset.id===selectedVideoId));
  document.querySelectorAll('.clip.overlay').forEach(c=>c.classList.toggle('selected',c.dataset.id===selectedOverlayId));
  document.querySelectorAll('.clip.audio').forEach(c=>c.classList.toggle('selected',c.dataset.id===selectedAudioId));
  document.querySelectorAll('.overlay').forEach(o=>o.classList.toggle('selected',o.dataset.id===selectedOverlayId));
  document.querySelectorAll('.layer-item').forEach(li=>li.classList.toggle('selected',li.dataset.id===selectedOverlayId));
}
function updateOverlaysVisual(){
  const t = globalTime;
  project.overlays.forEach(o=>{
    const el = overlayStage.querySelector(`.overlay[data-id="${o.id}"]`);
    if(!el) return;

    el.style.left = o.x + 'px';
    el.style.top = o.y + 'px';
    el.style.transform = `scale(${o.scale})`;
    el.style.opacity = o.opacity;
    el.style.mixBlendMode = o.blend || 'normal';

    const show = t >= o.start && t < o.end && o.visible;
    el.style.display = show ? 'block' : 'none';

    if(o.type === 'text'){
      el.textContent = o.text;
      el.style.fontSize = o.fontSize + 'px';
      el.style.color = o.color;
    } else if (!el.dataset.img) {
      el.innerHTML = '';
      const img = document.createElement('img');
      img.src = o.imageSrc;
      // NEW: let the image be visible and not collapse
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.display = 'block';
      el.appendChild(img);
      el.dataset.img = '1';
    }
  });
  updateOverlayZ();
}
function updateInspector(){
  [videoClipSection,overlaySection,audioSection,applyBtn].forEach(e=>e.classList.add('hidden'));
  if(selectedVideoId){
    const c=project.videoClips.find(v=>v.id===selectedVideoId); if(!c)return;
    videoClipSection.classList.remove('hidden'); applyBtn.classList.remove('hidden');
    clipStartInput.value=c.start.toFixed(3); clipInInput.value=c.in.toFixed(3); clipOutInput.value=c.out.toFixed(3);
  } else if(selectedOverlayId){
    const o=project.overlays.find(v=>v.id===selectedOverlayId); if(!o)return;
    overlaySection.classList.remove('hidden'); applyBtn.classList.remove('hidden');
    ovStartInput.value=o.start.toFixed(3); ovEndInput.value=o.end.toFixed(3);
    ovXInput.value=o.x; ovYInput.value=o.y; ovScaleInput.value=o.scale; ovOpacityInput.value=o.opacity;
    textFields.classList.toggle('hidden',o.type!=='text');
    if(o.type==='text'){ ovTextInput.value=o.text; ovFontSizeInput.value=o.fontSize; ovColorInput.value=o.color; }
  } else if(selectedAudioId){
    const a=project.audioClips.find(v=>v.id===selectedAudioId); if(!a)return;
    audioSection.classList.remove('hidden'); applyBtn.classList.remove('hidden');
    audOffsetInput.value=a.offset.toFixed(3); audVolumeInput.value=a.volume; audMuteInput.checked=a.mute;
  }
}
applyBtn.addEventListener('click',()=>{
  if(selectedVideoId){
    const c=project.videoClips.find(v=>v.id===selectedVideoId);
    c.start=parseFloat(clipStartInput.value)||0; c.in=parseFloat(clipInInput.value)||0;
    c.out=parseFloat(clipOutInput.value)||c.in+0.05; if(c.out>c.duration)c.out=c.duration; if(c.out<=c.in+0.05)c.out=c.in+0.05;
    c.end=c.start+(c.out-c.in); snapshot('applyClip'); rebuildAll();
  } else if(selectedOverlayId){
    const o=project.overlays.find(v=>v.id===selectedOverlayId);
    o.start=parseFloat(ovStartInput.value)||0; o.end=parseFloat(ovEndInput.value)||o.start+0.05;
    if(o.end<=o.start+0.05)o.end=o.start+0.05;
    o.x=parseFloat(ovXInput.value)||0; o.y=parseFloat(ovYInput.value)||0;
    o.scale=parseFloat(ovScaleInput.value)||1; o.opacity=parseFloat(ovOpacityInput.value)||1;
    if(o.type==='text'){ o.text=ovTextInput.value; o.fontSize=parseInt(ovFontSizeInput.value,10)||32; o.color=ovColorInput.value||'#ffffff'; }
    snapshot('applyOverlay'); rebuildAll();
  } else if(selectedAudioId){
    const a=project.audioClips.find(v=>v.id===selectedAudioId);
    a.offset=parseFloat(audOffsetInput.value)||0; a.volume=parseFloat(audVolumeInput.value)||1; a.mute=audMuteInput.checked;
    snapshot('applyAudio'); rebuildAll();
  }
});

function updateTime(force){
  tcCurrent.textContent=fmt(globalTime); tcDuration.textContent=fmt(projectDuration());
  playheadEl.style.left=t2x(globalTime)+'px'; keepPlayheadVisible();
  updateOverlaysVisual(); // always refresh overlays
}
function keepPlayheadVisible(){
  const px=t2x(globalTime),left=tracksScroller.scrollLeft,right=left+tracksScroller.clientWidth;
  if(px<left+40)tracksScroller.scrollLeft=Math.max(0,px-40);
  else if(px>right-80)tracksScroller.scrollLeft=px-tracksScroller.clientWidth+80;
}
function updateRangeMarkers(){
  if(project.inPoint==null) inMarker.classList.add('hidden'); else {inMarker.classList.remove('hidden');inMarker.style.left=t2x(project.inPoint)+'px';}
  if(project.outPoint==null) outMarker.classList.add('hidden'); else {outMarker.classList.remove('hidden');outMarker.style.left=t2x(project.outPoint)+'px';}
  if(project.inPoint!=null&&project.outPoint!=null){rangeFill.classList.remove('hidden');rangeFill.style.left=t2x(project.inPoint)+'px';rangeFill.style.width=t2x(project.outPoint-project.inPoint)+'px';}
  else rangeFill.classList.add('hidden');
  tcIn.textContent=fmt(project.inPoint); tcOut.textContent=fmt(project.outPoint);
}

function ensureOverlayLayerStacking(){
  const parent = videoMain?.parentElement;
  if (!parent || !overlayStage || !videoMain) return;

  // Ensure parent is a positioned container and clips content
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.style.overflow = 'hidden';

  // Current (visible) video
  Object.assign(videoMain.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '10'
  });

  // Preloaded (next) video stays under overlay as well
  if (nextVideo) {
    Object.assign(nextVideo.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '9',
      pointerEvents: 'none',
      opacity: '0'
    });
  }

  // Overlay stage above both videos
  Object.assign(overlayStage.style, {
    position: 'absolute',
    inset: '0',
    zIndex: '20',
    pointerEvents: 'none'
  });
}

function ensureVideoElements(){
  if(!currentVideo){
    currentVideo = videoMain;
    currentVideo.playsInline = true;
    currentVideo.muted = true;
    currentVideo.crossOrigin = 'anonymous';
  }
  if(!nextVideo){
    nextVideo = document.createElement('video');
    Object.assign(nextVideo, { playsInline: true, muted: true, crossOrigin: 'anonymous' });
    Object.assign(nextVideo.style, { position: 'absolute', inset: '0', opacity: '0', pointerEvents: 'none' });
    currentVideo.parentElement.appendChild(nextVideo);
  }
  // NEW: enforce correct stacking each time
  ensureOverlayLayerStacking();
}
function activateClip(clip,forceStart=false){
  ensureVideoElements();inGapMode=false;activeClip=clip;currentVideo.pause();currentVideo.src=clip.src;
  currentVideo.onloadedmetadata=()=>{const rel=clip.in+(forceStart?0:Math.max(0,globalTime-clip.start));try{currentVideo.currentTime=Math.min(rel,currentVideo.duration||rel);}catch{} if(isPlaying)currentVideo.play().catch(()=>{});attachVideoFrameCallback();};
  currentVideo.load();schedulePreload();
}
function schedulePreload(){
  if(!activeClip)return; nextClip=nextClipAfter(activeClip);
  if(!nextClip){nextVideo.src='';return;}
  const remaining=activeClip.end-globalTime;
  if(remaining<=PRELOAD_MARGIN && (!nextVideo.src||nextVideo.dataset.clipId!==nextClip.id)){
    nextVideo.pause();nextVideo.src=nextClip.src;nextVideo.dataset.clipId=nextClip.id;
    nextVideo.onloadedmetadata=()=>{const rel=nextClip.in;try{nextVideo.currentTime=Math.min(rel,nextVideo.duration||rel);}catch{};};
    nextVideo.load();
  }
}

playPauseBtn.addEventListener('click',()=>isPlaying?pause():play());
replayBtn.addEventListener('click',()=>{
  pause();globalTime=boundedStart();
  const c=findClipAt(globalTime);if(c)activateClip(c,true);else enterGapMode();
  updateAudioPlay(globalTime);updateTime(true);play();
});
frameBackBtn.addEventListener('click',()=>stepFrame(-1));
frameFwdBtn.addEventListener('click',()=>stepFrame(1));

function play(){
  const end=boundedEnd(); if(globalTime>=end-1e-6)globalTime=boundedStart();
  const clip=findClipAt(globalTime);
  if(clip){
    if(activeClip && activeClip.id===clip.id && currentVideo && currentVideo.src){
      const desired=clip.in+(globalTime-clip.start); if(Math.abs(currentVideo.currentTime-desired)>0.06){try{currentVideo.currentTime=desired;}catch{}}
      isPlaying=true;playPauseBtn.textContent='Pause';currentVideo.play().catch(()=>{});attachVideoFrameCallback();updateAudioPlay(globalTime);startPlayheadLoop();return;
    } else activateClip(clip,false);
  } else enterGapMode();
  isPlaying=true;playPauseBtn.textContent='Pause';updateAudioPlay(globalTime);startPlayheadLoop();
}
function pause(){isPlaying=false;playPauseBtn.textContent='Play';if(currentVideo)currentVideo.pause();if(nextVideo)nextVideo.pause();stopAllAudio();cancelVideoFrameCallback();}
function stepFrame(dir){
  pause();const frame=1/project.settings.frameRate;
  globalTime=Math.max(0,Math.min(boundedEnd(),globalTime+dir*frame));
  const c=findClipAt(globalTime); if(c){activateClip(c,true);currentVideo.pause();currentVideo.currentTime=c.in+(globalTime-c.start);} else enterGapMode();
  updateAudioPlay(globalTime);updateTime(true);
}
function enterGapMode(){inGapMode=true;activeClip=null;if(currentVideo)currentVideo.pause();cancelVideoFrameCallback();}
function handlePlaybackEnd(){
  const end=boundedEnd();globalTime=end;
  if(project.loop){globalTime=boundedStart();const c=findClipAt(globalTime);if(c)activateClip(c,true);else enterGapMode();updateAudioPlay(globalTime);}
  else pause();updateTime(true);
}

function startPlayheadLoop(){
  if(!frameLoopRunning){frameLoopRunning=true;lastPerf=performance.now();playheadRAF();}
  attachVideoFrameCallback();
}
function playheadRAF(){
  if(!frameLoopRunning)return;
  const now=performance.now(),dt=(now-lastPerf)/1000;lastPerf=now;
  if(isPlaying){
    if(activeClip&&currentVideo&&!inGapMode){
      globalTime=activeClip.start+(currentVideo.currentTime-activeClip.in);
      if(globalTime>=activeClip.end-1e-4){
        const nxt=nextClipAfter(activeClip);
        if(nxt)activateClip(nxt,true);else if(globalTime>=boundedEnd())handlePlaybackEnd();else enterGapMode();
      } else schedulePreload();
    } else {
      globalTime+=dt;if(globalTime>=boundedEnd())handlePlaybackEnd();
    }
    updateAudioPlay(globalTime);updateTime(false);
  }
  requestAnimationFrame(playheadRAF);
}
function attachVideoFrameCallback(){
  cancelVideoFrameCallback();
  if(!currentVideo||!currentVideo.requestVideoFrameCallback)return;
  const cb=()=>{
    if(isPlaying&&activeClip&&!inGapMode){
      globalTime=activeClip.start+(currentVideo.currentTime-activeClip.in);
      updateAudioPlay(globalTime);updateTime(false);
    }
    if(isPlaying)pendingVideoFrameCallback=currentVideo.requestVideoFrameCallback(cb);
  };
  pendingVideoFrameCallback=currentVideo.requestVideoFrameCallback(cb);
}
function cancelVideoFrameCallback(){
  if(pendingVideoFrameCallback&&currentVideo?.cancelVideoFrameCallback){try{currentVideo.cancelVideoFrameCallback(pendingVideoFrameCallback);}catch{}}
  pendingVideoFrameCallback=null;
}

function updateAudioPlay(t){
  project.audioClips.forEach(a=>{
    const active=t>=a.offset&&t<a.offset+a.duration;
    let el=audioElements.get(a.id);
    if(active){
      if(!el){
        el=new Audio(a.src);el.crossOrigin='anonymous';el.volume=a.mute?0:a.volume;el.currentTime=t-a.offset;
        audioElements.set(a.id,el);if(isPlaying)el.play().catch(()=>{});
      }else{
        const target=t-a.offset;if(Math.abs(el.currentTime-target)>0.25)el.currentTime=target;
        el.volume=a.mute?0:a.volume;if(isPlaying&&el.paused)el.play().catch(()=>{});
      }
    }else if(el){el.pause();audioElements.delete(a.id);}
  });
}
function stopAllAudio(){audioElements.forEach(a=>a.pause());audioElements.clear();}

let dragObj=null;
function snapTime(raw){
  const targets=[];project.videoClips.forEach(c=>targets.push(c.start,c.end));
  project.overlays.forEach(o=>targets.push(o.start,o.end));
  project.audioClips.forEach(a=>targets.push(a.offset,a.offset+a.duration));
  targets.push(globalTime);
  let best=raw,min=project.ui.snapTolerance;
  targets.forEach(t=>{const d=Math.abs(t-raw);if(d<min){min=d;best=t;}});
  return best;
}
function startClipDrag(e,clip){
  const edge=e.target.classList.contains('handle')?e.target.dataset.edge:null;
  dragObj={type:'video',id:clip.id,edge,startX:e.clientX,startStart:clip.start,startIn:clip.in,startOut:clip.out};
  snapshot('clipDrag');document.addEventListener('mousemove',clipDragMove);document.addEventListener('mouseup',clipDragEnd);selectVideo(clip.id);pause();
}
function clipDragMove(e){
  if(!dragObj)return;const clip=project.videoClips.find(c=>c.id===dragObj.id);
  const dt=(e.clientX-dragObj.startX)/pps();
  if(dragObj.edge==='left'){
    const newIn=Math.min(clip.out-0.1,Math.max(0,dragObj.startIn+dt));const delta=newIn-clip.in;
    clip.in=newIn;clip.start=snapTime(dragObj.startStart+delta);clip.end=clip.start+(clip.out-clip.in);
  }else if(dragObj.edge==='right'){
    clip.out=Math.max(clip.in+0.1,dragObj.startOut+dt);if(clip.out>clip.duration)clip.out=clip.duration;clip.end=clip.start+(clip.out-clip.in);
  }else{clip.start=snapTime(dragObj.startStart+dt);clip.end=clip.start+(clip.out-clip.in);}
  rebuildAll();
}
function clipDragEnd(){dragObj=null;flushSnapshot();document.removeEventListener('mousemove',clipDragMove);document.removeEventListener('mouseup',clipDragEnd);}
function startOverlayClipDrag(e,o){
  const edge=e.target.classList.contains('handle')?e.target.dataset.edge:null;
  dragObj={type:'overlay',id:o.id,edge,startX:e.clientX,startStart:o.start,startEnd:o.end};
  snapshot('ovDrag');document.addEventListener('mousemove',overlayClipMove);document.addEventListener('mouseup',overlayClipEnd);selectOverlay(o.id);pause();
}
function overlayClipMove(e){
  if(!dragObj)return;const o=project.overlays.find(x=>x.id===dragObj.id);if(o.locked)return;
  const dt=(e.clientX-dragObj.startX)/pps();
  if(dragObj.edge==='left'){o.start=snapTime(Math.max(0,dragObj.startStart+dt));if(o.start>o.end-0.05)o.start=o.end-0.05;}
  else if(dragObj.edge==='right'){o.end=snapTime(Math.max(o.start+0.05,dragObj.startEnd+dt));}
  else {const len=o.end-o.start;o.start=snapTime(Math.max(0,dragObj.startStart+dt));o.end=o.start+len;}
  rebuildAll();
}
function overlayClipEnd(){dragObj=null;flushSnapshot();document.removeEventListener('mousemove',overlayClipMove);document.removeEventListener('mouseup',overlayClipEnd);}
function startAudioClipDrag(e,a){
  const edge=e.target.classList.contains('handle')?e.target.dataset.edge:null;
  dragObj={type:'audio',id:a.id,edge,startX:e.clientX,startOffset:a.offset,startDuration:a.duration};
  snapshot('audDrag');document.addEventListener('mousemove',audioDragMove);document.addEventListener('mouseup',audioDragEnd);selectAudio(a.id);pause();
}
function audioDragMove(e){
  if(!dragObj)return;const a=project.audioClips.find(x=>x.id===dragObj.id);
  const dt=(e.clientX-dragObj.startX)/pps();
  if(dragObj.edge==='left')a.offset=snapTime(Math.max(0,dragObj.startOffset+dt));
  else if(dragObj.edge==='right')a.duration=Math.max(0.2,dragObj.startDuration+dt);
  else a.offset=snapTime(Math.max(0,dragObj.startOffset+dt));
  rebuildAll();
}
function audioDragEnd(){dragObj=null;flushSnapshot();document.removeEventListener('mousemove',audioDragMove);document.removeEventListener('mouseup',audioDragEnd);}

function splitSelected(){if(!selectedVideoId)return;const clip=project.videoClips.find(c=>c.id===selectedVideoId);const t=globalTime;if(!clip||t<=clip.start+0.05||t>=clip.end-0.05)return;const rel=clip.in+(t-clip.start);const first={...clip,id:genId('v1'),out:rel,end:clip.start+(rel-clip.in)};const second={...clip,id:genId('v2'),in:rel,start:first.end,end:first.end+(clip.out-rel)};const idx=project.videoClips.indexOf(clip);project.videoClips.splice(idx,1,first,second);snapshot('split');rebuildAll();selectVideo(first.id);}
function deleteSelected(){
  if(selectedVideoId){const clip=project.videoClips.find(c=>c.id===selectedVideoId);if(!clip)return;const idx=project.videoClips.indexOf(clip);const removed=clip.end-clip.start;URL.revokeObjectURL(clip.src);project.videoClips.splice(idx,1);if(rippleDelete){for(let i=idx;i<project.videoClips.length;i++){project.videoClips[i].start-=removed;project.videoClips[i].end-=removed;}}snapshot('delClip');selectedVideoId=null;rebuildAll();}
  else if(selectedOverlayId){const i=project.overlays.findIndex(o=>o.id===selectedOverlayId);if(i>=0){if(project.overlays[i].type==='image')URL.revokeObjectURL(project.overlays[i].imageSrc);project.overlays.splice(i,1);snapshot('delOverlay');selectedOverlayId=null;rebuildAll();}}
  else if(selectedAudioId){const i=project.audioClips.findIndex(a=>a.id===selectedAudioId);if(i>=0){URL.revokeObjectURL(project.audioClips[i].src);project.audioClips.splice(i,1);snapshot('delAudio');selectedAudioId=null;rebuildAll();}}
}
function duplicateSelected(){
  if(selectedVideoId){const c=project.videoClips.find(v=>v.id===selectedVideoId);if(!c)return;const len=c.out-c.in,start=lastTrackEnd(project.videoClips);const dup={...c,id:genId('vdup'),start,end:start+len};project.videoClips.push(dup);snapshot('dupVid');rebuildAll();selectVideo(dup.id);}
  else if(selectedOverlayId){const o=project.overlays.find(v=>v.id===selectedOverlayId);if(!o)return;const dup={...o,id:genId('ovdup'),x:o.x+OVERLAY_OFFSET_STEP,y:o.y+OVERLAY_OFFSET_STEP};project.overlays.push(dup);snapshot('dupOv');rebuildAll();selectOverlay(dup.id);}
}

btnClipInSet.addEventListener('click',()=>{if(!selectedVideoId)return;const c=project.videoClips.find(v=>v.id===selectedVideoId);const rel=c.in+(globalTime-c.start);if(rel>=c.out-0.05)return;c.in=rel;c.end=c.start+(c.out-c.in);snapshot('trimIn');rebuildAll();});
btnClipOutSet.addEventListener('click',()=>{if(!selectedVideoId)return;const c=project.videoClips.find(v=>v.id===selectedVideoId);const rel=c.in+(globalTime-c.start);if(rel<=c.in+0.05||rel>c.duration)return;c.out=rel;c.end=c.start+(c.out-c.in);snapshot('trimOut');rebuildAll();});
btnFitToRange.addEventListener('click',()=>{if(!selectedVideoId)return;if(project.inPoint==null||project.outPoint==null)return;const c=project.videoClips.find(v=>v.id===selectedVideoId);const len=project.outPoint-project.inPoint;if(len<0.05)return;c.in=Math.min(c.duration-len,c.in);c.out=c.in+len;c.start=project.inPoint;c.end=c.start+(c.out-c.in);snapshot('fitRange');rebuildAll();selectVideo(c.id);});

/* ---- Import Status Helper ---- */
function setImportStatus(msg,color='#9aa'){if(importStatus){importStatus.textContent=msg;importStatus.style.color=color;}if(IMPORT_DEBUG)console.log('[Import][Status]',msg);}

/* ---- Import Guards ---- */
let importReady=false;
function ensureInputsEnabled(){[inputVideo,inputAudio,inputImage].forEach(inp=>{if(!inp)return;inp.disabled=false;inp.removeAttribute('disabled');});}

/* ---- Video Import ---- */
function importVideoFiles(files){
  if(!files||!files.length){setImportStatus('No video files');return;}
  setImportStatus(`Video files: ${files.length}`);
  let processed=0;
  [...files].forEach(file=>{
    let url;
    try{url=URL.createObjectURL(file);}catch(e){console.error('[Import][Video] URL create failed',e);return;}
    const start=lastTrackEnd(project.videoClips);
    const clip={id:genId('v'),src:url,name:file.name,duration:PROVISIONAL_MIN_DURATION,in:0,out:PROVISIONAL_MIN_DURATION,start,end:start+PROVISIONAL_MIN_DURATION,_provisional:true};
    project.videoClips.push(clip); rebuildAll();
    const vid=document.createElement('video'); vid.preload='metadata'; vid.src=url; vid.crossOrigin='anonymous';
    let resolved=false;
    const finalize=durRaw=>{
      if(resolved)return; resolved=true;
      let dur=durRaw; if(!isFinite(dur)||dur<DURATION_MIN_ACCEPT){dur=clip.duration;console.warn('[Import][Video] fallback duration for',file.name);}
      clip.duration=dur; clip.out=dur; clip.end=clip.start+(clip.out-clip.in); delete clip._provisional;
      processed++; rebuildAll(); setImportStatus(`Video ${processed}/${files.length}`);
      if(processed===files.length){snapshot('importVideo');selectVideo(clip.id);updateTime(true);}
    };
    const timeout=setTimeout(()=>finalize(NaN),METADATA_TIMEOUT_MS);
    function poll(){ if(vid.readyState>=1&&!resolved) finalize(vid.duration); else if(!resolved) setTimeout(poll,450); }
    vid.addEventListener('loadedmetadata',()=>{clearTimeout(timeout);finalize(vid.duration);},{once:true});
    vid.addEventListener('durationchange',()=>{ if(!resolved&&isFinite(vid.duration)&&vid.duration>DURATION_MIN_ACCEPT)finalize(vid.duration); });
    vid.addEventListener('canplay',()=>{ if(!resolved) finalize(vid.duration); });
    vid.addEventListener('error',()=>{clearTimeout(timeout);console.error('[Import][Video] error',file.name,vid.error);finalize(NaN);},{once:true});
    try{vid.load();}catch{} poll();
  });
}

/* ---- Audio Import ---- */
function importAudioFiles(files){
  if(!files||!files.length){setImportStatus('No audio files');return;}
  let done=0;
  [...files].forEach(file=>{
    let url;try{url=URL.createObjectURL(file);}catch(e){console.error('[Import][Audio] URL fail',e);return;}
    const audio=new Audio(); audio.src=url; audio.preload='metadata'; audio.crossOrigin='anonymous';
    let resolved=false;
    const start=lastTrackEnd(project.audioClips.map(a=>({end:a.offset+a.duration})));
    const finalize=dur=>{
      if(resolved)return; resolved=true;
      if(!isFinite(dur)||dur<=0) dur=1;
      project.audioClips.push({id:genId('a'),src:url,name:file.name,duration:dur,offset:start+done,volume:1,mute:false});
      done++; rebuildAll(); setImportStatus(`Audio ${done}/${files.length}`,'#9ec');
      if(done===files.length) snapshot('importAudio');
    };
    const timeout=setTimeout(()=>finalize(NaN),METADATA_TIMEOUT_MS);
    audio.addEventListener('loadedmetadata',()=>{clearTimeout(timeout);finalize(audio.duration);},{once:true});
    audio.addEventListener('canplaythrough',()=>{ if(!resolved) finalize(audio.duration); });
    audio.addEventListener('error',()=>{clearTimeout(timeout);console.error('[Import][Audio] error',file.name);finalize(NaN);},{once:true});
  });
}

/* ---- Image Import ---- */
function importImageFiles(files){
  if(!files||!files.length){setImportStatus('No images');return;}
  [...files].forEach((file,i)=>{
    let url;try{url=URL.createObjectURL(file);}catch(e){console.error('[Import][Img] URL fail',e);return;}
    project.overlays.push({
      id:genId('img'),type:'image',imageSrc:url,start:globalTime,end:globalTime+5,
      x:120+i*OVERLAY_OFFSET_STEP,y:120+i*OVERLAY_OFFSET_STEP,scale:1,opacity:1,fontSize:32,color:'#ffffff',
      fontFamily:'Arial',visible:true,locked:false,blend:'normal'
    });
  });
  snapshot('importImages'); rebuildAll(); setImportStatus(`Images: ${files.length}`,'#7fb');
}

inputVideo.addEventListener('change',e=>{setImportStatus('Video input change');importVideoFiles(e.target.files);e.target.value='';});
inputAudio.addEventListener('change',e=>{setImportStatus('Audio input change');importAudioFiles(e.target.files);e.target.value='';});
inputImage.addEventListener('change',e=>{setImportStatus('Image input change');importImageFiles(e.target.files);e.target.value='';});

window.addEventListener('dragover',e=>{e.preventDefault();});
window.addEventListener('drop',e=>{
  e.preventDefault(); const files=[...e.dataTransfer.files];
  importVideoFiles(files.filter(f=>f.type.startsWith('video/')));
  importAudioFiles(files.filter(f=>f.type.startsWith('audio/')));
  importImageFiles(files.filter(f=>f.type.startsWith('image/')));
});

addTextBtn.addEventListener('click',()=>{
  const countAtTime=project.overlays.filter(o=>Math.abs(o.start-globalTime)<0.001).length;
  const idx=Math.min(countAtTime,OVERLAY_MAX_AUTO_OFFSET);
  const o={id:genId('txt'),type:'text',text:'New Text',start:globalTime,end:globalTime+5,
    x:100+idx*OVERLAY_OFFSET_STEP,y:100+idx*OVERLAY_OFFSET_STEP,scale:1,opacity:1,fontSize:32,color:'#ffffff',
    fontFamily:'Arial',visible:true,locked:false,blend:'normal'};
  project.overlays.push(o); snapshot('addText'); rebuildAll(); selectOverlay(o.id);
});


/* Buttons & shortcuts*/
splitBtn.addEventListener('click',splitSelected);
deleteBtn.addEventListener('click',deleteSelected);
duplicateBtn.addEventListener('click',duplicateSelected);
undoBtn.addEventListener('click',undo);
redoBtn.addEventListener('click',redo);
timelineZoom.addEventListener('input',e=>{project.settings.pixelsPerSecond=parseInt(e.target.value,10);rebuildAll();snapshot('zoom');});
markInBtn.addEventListener('click',()=>{project.inPoint=globalTime;validateRange();snapshot('setIn');});
markOutBtn.addEventListener('click',()=>{project.outPoint=globalTime;validateRange();snapshot('setOut');});
loopBtn.addEventListener('click',()=>{project.loop=!project.loop;loopBtn.textContent='Loop: '+(project.loop?'On':'Off');snapshot('loop');});
rippleBtn.addEventListener('click',()=>{rippleDelete=!rippleDelete;rippleBtn.textContent='Ripple: '+(rippleDelete?'On':'Off');});
autoFitBtn.addEventListener('click',autoFitTimeline);
function autoFitTimeline(){
  const dur=projectDuration();
  if(dur<=0){project.settings.pixelsPerSecond=DEFAULT_PPS;timelineZoom.value=DEFAULT_PPS;rebuildAll();return;}
  const viewWidth=tracksScroller.clientWidth||800;
  let newPps=Math.min(MAX_PPS,Math.max(MIN_PPS,(viewWidth-160)/Math.max(0.1,dur)));
  project.settings.pixelsPerSecond=Math.round(newPps);timelineZoom.value=project.settings.pixelsPerSecond;rebuildAll();
}

playheadEl.addEventListener('mousedown',()=>{
  draggingPlayhead=true;pause();document.addEventListener('mousemove',playheadMove);document.addEventListener('mouseup',playheadUp);
});
function playheadMove(e){
  const rect=timeRuler.getBoundingClientRect();let x=e.clientX-rect.left;if(x<0)x=0;
  const maxPx=t2x(projectDuration());if(x>maxPx)x=maxPx;globalTime=x2t(x);
  const c=findClipAt(globalTime);if(c){activateClip(c,true);currentVideo.pause();currentVideo.currentTime=c.in+(globalTime-c.start);}else enterGapMode();
  updateAudioPlay(globalTime);updateTime(true);
}
function playheadUp(){draggingPlayhead=false;document.removeEventListener('mousemove',playheadMove);document.removeEventListener('mouseup',playheadUp);}

exportBtn.addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='project.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
});

renderBtn.addEventListener('click',()=>alert('Render pipeline omitted.'));

window.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea'))return;
  switch(e.key.toLowerCase()){
    case ' ':e.preventDefault();isPlaying?pause():play();break;
    case 'i':project.inPoint=globalTime;validateRange();snapshot('in');break;
    case 'o':project.outPoint=globalTime;validateRange();snapshot('out');break;
    case 'l':project.loop=!project.loop;loopBtn.textContent='Loop: '+(project.loop?'On':'Off');snapshot('loop');break;
    case 'c':splitSelected();break;
    case 'delete':case 'backspace':deleteSelected();break;
    case 'd':if(e.ctrlKey||e.metaKey){e.preventDefault();duplicateSelected();}break;
    case 'arrowleft':stepFrame(-1);break;
    case 'arrowright':stepFrame(1);break;
    case 'z':if(e.ctrlKey||e.metaKey){e.preventDefault();undo();}break;
    case 'y':if(e.ctrlKey||e.metaKey){e.preventDefault();redo();}break;
    case 'r':if(e.shiftKey){e.preventDefault();replayBtn.click();}break;
    case 'v':if(!e.repeat){e.preventDefault();toggleVoiceOverRecording();}break;
  }
});

/* Voice Over */
let voRecorder=null,voStream=null,voChunks=[],voRecording=false,voStartOffset=0,voAnalyser=null,voAudioCtx=null,voMeterRAF=null,lastVoClipId=null;
function setVOState(text,mode){
  if(!voStatus||!voStateSpan)return;
  voStatus.className='vo-status';if(mode)voStatus.classList.add(mode);
  voStateSpan.textContent=text;voStatus.classList.remove('hidden');if(cancelVoBtn)cancelVoBtn.classList.add('hidden');
}
async function startVoiceOver(){
  if(voRecording)return;pause();
  if(!navigator.mediaDevices){setVOState('No media','error');return;}
  try{voStream=await navigator.mediaDevices.getUserMedia({audio:true});}catch(e){setVOState('Mic blocked','error');return;}
  voAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
  const src=voAudioCtx.createMediaStreamSource(voStream);
  voAnalyser=voAudioCtx.createAnalyser();voAnalyser.fftSize=1024;src.connect(voAnalyser);
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm','audio/ogg'].find(m=>MediaRecorder.isTypeSupported(m))||'';
  voRecorder=new MediaRecorder(voStream,mime?{mimeType:mime}:{});
  voChunks=[];voStartOffset=lastTrackEnd(project.audioClips.map(a=>({end:a.offset+a.duration})));
  voRecorder.ondataavailable=e=>{if(e.data.size>0)voChunks.push(e.data);};
  voRecorder.onstop=finishVoiceOver;voRecorder.start();voRecording=true;recordVoiceBtn.textContent='Stop VO';setVOState('Recording','recording');startVOMeter();
}
function stopVoiceOver(){if(!voRecording)return;voRecording=false;try{voRecorder.stop();}catch{}setVOState('Processing...','processing');recordVoiceBtn.textContent='Record VO';stopVOMeter();}
function toggleVoiceOverRecording(){voRecording?stopVoiceOver():startVoiceOver();}
async function finishVoiceOver(){
  if(voStream)voStream.getTracks().forEach(t=>t.stop());cleanupVO();
  const blob=new Blob(voChunks,{type:voChunks[0]?.type||'audio/webm'});
  const aEl=new Audio(URL.createObjectURL(blob));
  await new Promise(r=>{aEl.addEventListener('loadedmetadata',()=>r(),{once:true});setTimeout(r,1200);});
  const dur=isFinite(aEl.duration)?aEl.duration:Math.max(1,voChunks.length*0.2);
  const url=aEl.src;
  const clip={id:genId('a_vo'),src:url,name:'VoiceOver',duration:dur,offset:voStartOffset,volume:1,mute:false,isVO:true};
  project.audioClips.push(clip);lastVoClipId=clip.id;snapshot('voAdd');rebuildAll();setVOState('Recorded','');if(cancelVoBtn)cancelVoBtn.classList.remove('hidden');
}
function cleanupVO(){if(voAudioCtx){try{voAudioCtx.close();}catch{}voAudioCtx=null;}voRecorder=null;voAnalyser=null;voStream=null;}
function startVOMeter(){
  if(!voAnalyser||!voLevelEl)return;
  const data=new Uint8Array(voAnalyser.fftSize);
  (function loop(){if(!voAnalyser){voLevelEl.style.width='0%';return;}voAnalyser.getByteTimeDomainData(data);let sum=0;for(let i=0;i<data.length;i++){const v=(data[i]-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/data.length);voLevelEl.style.width=Math.min(100,Math.max(0,rms*300))+'%';voMeterRAF=requestAnimationFrame(loop);})();
}
function stopVOMeter(){if(voMeterRAF)cancelAnimationFrame(voMeterRAF);voMeterRAF=null;voLevelEl.style.width='0%';}
recordVoiceBtn.addEventListener('click',toggleVoiceOverRecording);
cancelVoBtn?.addEventListener('click',()=>{
  if(!lastVoClipId)return;const i=project.audioClips.findIndex(a=>a.id===lastVoClipId);
  if(i>=0){URL.revokeObjectURL(project.audioClips[i].src);project.audioClips.splice(i,1);snapshot('voDiscard');rebuildAll();}
  lastVoClipId=null;cancelVoBtn.classList.add('hidden');setVOState('Idle','');
});

/* INIT */
function init(){
  if(importReady) return;
  importReady = true;

  ensureInputsEnabled();
  timelineZoom.value = project.settings.pixelsPerSecond;

  snapshot('init', true);
  rebuildAll();
  updateUndoRedo();
  setVOState('Idle','');
  setImportStatus('Ready');

  // NEW: make sure overlays sit above the video from the beginning
  ensureOverlayLayerStacking();

  if(location.protocol==='file:')
    console.warn('[Import] Running over file:// - use a local server for best reliability.');
}
init();
window.project=project;