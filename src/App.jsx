import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteRequest,
  getJson,
  postJson,
  setAuthToken,
  subscribeToDashboard,
  uploadVideo
} from './api';
import { connectRtcPreview } from './rtcClient';
import {
  formatJson,
  formatLoopMode,
  formatNumber,
  formatSpeed,
  formatTimeMs
} from './formatters';

const defaultState = {
  session: null,
  activeSource: null,
  metrics: null,
  sources: [],
  instantSwitch: null,
  rtc: null
};

const speedOptions = [0.5, 1, 1.25, 1.5, 2];
const loopModes = [
  { label: 'Loop', value: 1 },
  { label: 'Hold', value: 2 }
];

function App() {
  const [dashboard, setDashboard] = useState(defaultState);
  const [streamStatus, setStreamStatus] = useState('Connecting...');
  const [actionStatus, setActionStatus] = useState('Ready');
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [viewerSession, setViewerSession] = useState(null);
  const [loginMode, setLoginMode] = useState('viewer');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [viewerName, setViewerName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [preprocessPath, setPreprocessPath] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [preprocessStatus, setPreprocessStatus] = useState('Choose a file to import');
  const [busyAction, setBusyAction] = useState('');
  const [seekValue, setSeekValue] = useState(0);
  const [frameInput, setFrameInput] = useState('');
  const [rtcStatus, setRtcStatus] = useState('Not connected');
  const [rtcStream, setRtcStream] = useState(null);
  const [rtcConnecting, setRtcConnecting] = useState(false);
  const videoRef = useRef(null);
  const rtcVideoRef = useRef(null);

  useEffect(() => {
    const unsubscribe = subscribeToDashboard(
      (payload) => {
        setDashboard(payload);
        const nextFrame = payload.session?.frameIndex ?? 0;
        setSeekValue(nextFrame);
        setStreamStatus('Live');
      },
      (error) => {
        setStreamStatus(error.message);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuth() {
      const token = localStorage.getItem('dataviv-auth-token');
      if (!token) {
        setAuthReady(true);
        return;
      }

      setAuthToken(token);

      try {
        const response = await getJson('/auth/me');
        if (cancelled) {
          return;
        }

        setAuthUser(response.user);
        setLoginMode(response.user?.role || 'viewer');
        if (response.user?.role === 'viewer') {
          setViewerSession(response.viewerSession || null);
        }
      } catch {
        if (!cancelled) {
          setAuthToken('');
          setAuthUser(null);
          setViewerSession(null);
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    hydrateAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeSource = dashboard.activeSource;
  const session = dashboard.session;
  const metrics = dashboard.metrics;
  const rtc = dashboard.rtc;
  const hasPlayableVideo = Boolean(activeSource?.videoUrl);
  const totalFrames = activeSource?.totalFrames ?? 1;
  const currentTimestamp = (authUser?.role === 'viewer' ? viewerSession : session)?.timestamp ?? 0;
  const durationMs = activeSource?.fps ? (totalFrames / activeSource.fps) * 1000 : 0;
  const frameDurationMs = activeSource?.fps ? 1000 / activeSource.fps : 0;
  const progressSource = authUser?.role === 'viewer' ? viewerSession : session;
  const progress = progressSource ? ((progressSource.frameIndex ?? 0) / Math.max(totalFrames - 1, 1)) * 100 : 0;
  const isAdmin = authUser?.role === 'admin';
  const displaySession = authUser?.role === 'viewer' ? viewerSession : session;
  const controlBase = authUser?.role === 'viewer' ? '/viewer/session' : '/session/default';

  useEffect(() => {
    if (authUser?.role !== 'viewer') {
      return;
    }

    let cancelled = false;

    async function refreshViewerSession() {
      try {
        const response = await getJson('/viewer/session');
        if (!cancelled) {
          setViewerSession(response.session);
        }
      } catch (error) {
        if (!cancelled) {
          setActionStatus(error.message);
        }
      }
    }

    refreshViewerSession();

    return () => {
      cancelled = true;
    };
  }, [authUser?.role, activeSource?.sourceId]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video || !hasPlayableVideo || rtcStream) {
      return;
    }

    video.playbackRate = displaySession?.playbackSpeed ?? 1;

    const targetTime = (displaySession?.timestamp ?? 0) / 1000;
    if (Math.abs(video.currentTime - targetTime) > 0.35) {
      video.currentTime = targetTime;
    }

    if (displaySession?.playing) {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
    } else {
      video.pause();
    }
  }, [currentTimestamp, hasPlayableVideo, rtcStream, displaySession?.playbackSpeed, displaySession?.playing, activeSource?.videoUrl]);

  useEffect(() => {
    if (rtcVideoRef.current) {
      rtcVideoRef.current.srcObject = rtcStream;
    }
  }, [rtcStream]);

  useEffect(() => {
    if (!rtc?.routerReady || !rtc?.canConsumeRemotely || !activeSource?.videoUrl || rtcStream || rtcConnecting) {
      return;
    }

    let cancelled = false;

    async function autoConnectRtc() {
      setRtcConnecting(true);
      setRtcStatus('Connecting...');

      try {
        const preview = await connectRtcPreview();
        if (cancelled) {
          preview.stream.getTracks().forEach((track) => track.stop());
          return;
        }

        setRtcStream(preview.stream);
        setRtcStatus('RTC connected');
      } catch (error) {
        if (!cancelled) {
          setRtcStatus(error.message);
        }
      } finally {
        if (!cancelled) {
          setRtcConnecting(false);
        }
      }
    }

    autoConnectRtc();

    return () => {
      cancelled = true;
    };
  }, [activeSource?.sourceId, activeSource?.videoUrl, rtc?.routerReady, rtc?.canConsumeRemotely, rtcStream, rtcConnecting]);

  useEffect(() => {
    setRtcStream(null);
    setRtcStatus('Not connected');
  }, [activeSource?.sourceId]);

  const summaryItems = useMemo(
    () => [
      { label: 'State', value: displaySession?.playing ? 'Playing' : 'Paused' },
      { label: 'Time', value: formatTimeMs(currentTimestamp) },
      { label: 'Speed', value: formatSpeed(displaySession?.playbackSpeed) },
      { label: 'Mode', value: formatLoopMode(displaySession?.loopMode) },
      { label: 'FPS', value: activeSource?.fps ?? '--' },
      { label: 'Latency', value: `${formatNumber(metrics?.lastSwitchLatencyMs)} ms` }
    ],
    [displaySession, currentTimestamp, activeSource, metrics?.lastSwitchLatencyMs]
  );

  async function performAction(actionId, request, successMessage) {
    setBusyAction(actionId);
    setActionStatus('Working...');

    try {
      await request();
      setActionStatus(successMessage);
    } catch (error) {
      setActionStatus(error.message);
    } finally {
      setBusyAction('');
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError('');

    try {
      if (loginMode === 'admin') {
        const response = await postJson('/auth/login', {
          username: adminUsername,
          password: adminPassword
        });
        setAuthToken(response.token);
        setAuthUser(response.user);
        setViewerSession(null);
      } else {
        const response = await postJson('/auth/viewer', {
          displayName: viewerName || 'Viewer'
        });
        setAuthToken(response.token);
        setAuthUser(response.user);
        setViewerSession(response.viewerSession);
      }
      setAuthReady(true);
    } catch (error) {
      setLoginError(error.message);
    }
  }

  async function handleLogout() {
    try {
      await postJson('/auth/logout');
    } catch {
      // Ignore logout errors.
    } finally {
      setAuthToken('');
      setAuthUser(null);
      setViewerSession(null);
      setAdminPassword('');
      setLoginError('');
    }
  }

  async function handlePlaybackToggle() {
    if (displaySession?.playing) {
      await performAction(
        'pause',
        () => postJson(`${controlBase}/pause`),
        'Paused'
      );
      return;
    }

    const endpoint = currentTimestamp > 0 ? `${controlBase}/resume` : `${controlBase}/play`;
    const body = endpoint.endsWith('play') ? { timestamp: 0 } : {};
    await performAction('playback', () => postJson(endpoint, body), 'Playing');
  }

  async function handleSeekCommit(nextFrame) {
    const nextTimestamp = Math.round(nextFrame * frameDurationMs);

    await performAction(
      'seek',
      () => postJson(`${controlBase}/seek`, { frameIndex: nextFrame, timestamp: nextTimestamp }),
      `Seeked to frame ${nextFrame}`
    );
  }

  async function handleFrameJump() {
    if (!activeSource) {
      return;
    }

    const parsedFrame = Number(frameInput);
    const safeFrame = Number.isFinite(parsedFrame)
      ? Math.min(Math.max(Math.round(parsedFrame), 0), Math.max(totalFrames - 1, 0))
      : 0;

    setSeekValue(safeFrame);
    await handleSeekCommit(safeFrame);
    setFrameInput('');
  }

  async function switchSource(sourceId) {
    if (!isAdmin) {
      return;
    }

    await performAction(
      `switch-${sourceId}`,
      () => postJson(`/session/default/switch/${sourceId}`, { frameIndex: 0 }),
      `Switched to source ${sourceId}`
    );
  }

  async function deleteSource(sourceId) {
    if (!isAdmin) {
      return;
    }

    await performAction(
      `delete-${sourceId}`,
      () => deleteRequest(`/sources/${sourceId}`),
      `Deleted source ${sourceId}`
    );
  }

  async function connectRtc() {
    setBusyAction('rtc-connect');
    setRtcConnecting(true);
    setRtcStatus('Connecting...');

    try {
      const preview = await connectRtcPreview();
      setRtcStream(preview.stream);
      setRtcStatus('RTC connected');
    } catch (error) {
      setRtcStream(null);
      setRtcStatus(error.message);
    } finally {
      setRtcConnecting(false);
      setBusyAction('');
    }
  }

  async function updateSpeed(value) {
    await performAction(
      `speed-${value}`,
      () => postJson(`${controlBase}/speed`, { speed: value }),
      `Speed ${value}x`
    );
  }

  async function updateLoopMode(value) {
    await performAction(
      `loop-${value}`,
      () => postJson(`${controlBase}/loop-mode`, { loopMode: value }),
      formatLoopMode(value)
    );
  }

  async function handlePreprocess(event) {
    event.preventDefault();

    if (!isAdmin) {
      setPreprocessStatus('Admin access required');
      return;
    }

    if (!selectedFile && !preprocessPath.trim()) {
      setPreprocessStatus('Choose a file or backend path');
      return;
    }

    setBusyAction('preprocess');

    try {
      const sourceId = Date.now();

      if (selectedFile) {
        setPreprocessStatus('Uploading...');
        await uploadVideo('/upload-source', {
          file: selectedFile,
          sourceId,
          name: selectedFile.name
        });
      } else {
        setPreprocessStatus('Importing...');
        await postJson('/preprocess', {
          sourceId,
          inputPath: preprocessPath.trim(),
          name: `Imported ${sourceId}`
        });
      }

      setPreprocessStatus(`Imported #${sourceId}`);
      setPreprocessPath('');
      setSelectedFile(null);
    } catch (error) {
      setPreprocessStatus(error.message);
    } finally {
      setBusyAction('');
    }
  }

  if (!authReady) {
    return (
      <div className="app-shell">
        <main className="layout">
          <section className="card auth-card">
            <div className="section-title">Loading</div>
            <div className="helper-text">Checking your saved session...</div>
          </section>
        </main>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="app-shell">
        <main className="layout">
          <section className="card auth-card">
            <div className="section-title">Sign In</div>
            <form className="auth-form" onSubmit={handleLogin}>
              <div className="button-row chips">
                <button
                  type="button"
                  className={`chip ${loginMode === 'viewer' ? 'chip-active' : ''}`}
                  onClick={() => setLoginMode('viewer')}
                >
                  Viewer
                </button>
                <button
                  type="button"
                  className={`chip ${loginMode === 'admin' ? 'chip-active' : ''}`}
                  onClick={() => setLoginMode('admin')}
                >
                  Admin
                </button>
              </div>

              {loginMode === 'admin' ? (
                <>
                  <input
                    type="text"
                    placeholder="Admin username"
                    value={adminUsername}
                    onChange={(event) => setAdminUsername(event.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Admin password"
                    value={adminPassword}
                    onChange={(event) => setAdminPassword(event.target.value)}
                  />
                </>
              ) : (
                <input
                  type="text"
                  placeholder="Display name"
                  value={viewerName}
                  onChange={(event) => setViewerName(event.target.value)}
                />
              )}

              <button type="submit" className="primary-button">
                {loginMode === 'admin' ? 'Open Admin Dashboard' : 'Join as Viewer'}
              </button>
            </form>
            {loginError ? <div className="error-text">{loginError}</div> : null}
            <div className="helper-text">
              Admin can upload and control the broadcast. Viewers get their own local playback state.
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="layout">
        <header className="topbar">
          <div>
            <div className="topbar-title">Player</div>
            <div className="topbar-subtitle">{activeSource?.name || 'No source selected'}</div>
          </div>
          <div className="status-row">
            <span className={`pill ${displaySession?.playing ? 'pill-live' : ''}`}>{streamStatus}</span>
            <span className="pill">{rtcStream ? 'RTC' : 'File'}</span>
            <span className="pill">
              {authUser ? `${authUser.role.toUpperCase()} · ${actionStatus}` : actionStatus}
            </span>
            <button type="button" className="secondary-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        <section className="main-grid">
          <section className="player-panel card">
            <div className="player-frame">
              {rtcStream ? (
                <video ref={rtcVideoRef} className="player-video" autoPlay playsInline controls />
              ) : hasPlayableVideo ? (
                <video
                  key={activeSource.videoUrl}
                  ref={videoRef}
                  className="player-video"
                  src={activeSource.videoUrl}
                  poster={activeSource.posterUrl || undefined}
                  preload="metadata"
                  controls
                  playsInline
                />
              ) : (
                <div className="empty-state">Import a video to start playback</div>
              )}
            </div>

            <div className="control-bar">
              <button
                type="button"
                className="primary-button"
                disabled={Boolean(busyAction)}
                onClick={handlePlaybackToggle}
              >
                {displaySession?.playing ? 'Pause' : 'Play'}
              </button>

              <div className="timeline-block">
                <div className="timeline-info">
                  <span>{formatTimeMs(currentTimestamp)}</span>
                  <span>
                    Frame {formatNumber(displaySession?.frameIndex)} / {formatNumber(totalFrames - 1)}
                  </span>
                  <span>{formatTimeMs(durationMs)}</span>
                </div>
                <div className="timeline-track">
                  <div className="timeline-progress" style={{ width: `${progress}%` }} />
                </div>
                <input
                  className="timeline-slider"
                  type="range"
                  min="0"
                  max={Math.max(totalFrames - 1, 0)}
                  value={Math.min(seekValue, Math.max(totalFrames - 1, 0))}
                  onChange={(event) => setSeekValue(Number(event.target.value))}
                  onMouseUp={(event) => handleSeekCommit(Number(event.currentTarget.value))}
                  onTouchEnd={(event) => handleSeekCommit(Number(event.currentTarget.value))}
                  disabled={!activeSource || Boolean(busyAction)}
                />
              </div>
            </div>

            <div className="summary-grid">
              {summaryItems.map((item) => (
                <div key={item.label} className="summary-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <aside className="sidebar">
            <section className="card compact-card">
              <div className="section-title">RTC</div>
              <div className="mini-list">
                <div>State: {rtcStatus}</div>
                <div>Router: {rtc?.routerReady ? 'Ready' : 'Offline'}</div>
                <div>Video producer: {rtc?.hasVideoProducer ? 'Yes' : 'No'}</div>
                <div>Audio producer: {rtc?.hasAudioProducer ? 'Yes' : 'No'}</div>
                <div>Sender: {rtc?.senderActive ? `Active #${rtc?.currentSourceId ?? '--'}` : 'Idle'}</div>
              </div>
              {rtc?.lastSenderError ? <div className="error-text">{rtc.lastSenderError}</div> : null}
              <button
                type="button"
                className="secondary-button"
                disabled={Boolean(busyAction) || !rtc?.routerReady || rtcConnecting}
                onClick={connectRtc}
              >
                {rtcConnecting ? 'Connecting...' : 'Connect RTC'}
              </button>
            </section>

            <section className="card compact-card">
              <div className="section-title">Playback</div>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(busyAction)}
                  onClick={() =>
                    performAction('resume', () => postJson(`${controlBase}/resume`), 'Resumed')
                  }
                >
                  Resume
                </button>
              </div>
              <div className="button-row chips">
                {speedOptions.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${displaySession?.playbackSpeed === value ? 'chip-active' : ''}`}
                    disabled={Boolean(busyAction)}
                    onClick={() => updateSpeed(value)}
                  >
                    {value}x
                  </button>
                ))}
              </div>
              <div className="button-row chips">
                {loopModes.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`chip ${displaySession?.loopMode === mode.value ? 'chip-active' : ''}`}
                    disabled={Boolean(busyAction)}
                    onClick={() => updateLoopMode(mode.value)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="card compact-card">
              <div className="section-title">Jump To Frame</div>
              <div className="frame-jump-panel">
                <div className="frame-live-box">
                  <span className="frame-live-label">Live frame</span>
                  <strong>{formatNumber(displaySession?.frameIndex)}</strong>
                </div>
                <input
                  id="frame-jump-input"
                  className="frame-jump-input"
                  type="number"
                  min="0"
                  max={Math.max(totalFrames - 1, 0)}
                  value={frameInput}
                  onChange={(event) => setFrameInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleFrameJump();
                    }
                  }}
                  disabled={!activeSource || Boolean(busyAction)}
                  placeholder="Enter frame number"
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!activeSource || Boolean(busyAction)}
                  onClick={handleFrameJump}
                >
                  Go To Frame
                </button>
              </div>
              <div className="helper-text">
                Range: 0 to {formatNumber(Math.max(totalFrames - 1, 0))}
              </div>
            </section>

            {isAdmin ? (
              <section className="card compact-card">
                <div className="section-title">Import</div>
                <form className="import-form" onSubmit={handlePreprocess}>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime,video/*"
                    onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  />
                  <input
                    type="text"
                    placeholder="Optional backend path"
                    value={preprocessPath}
                    onChange={(event) => setPreprocessPath(event.target.value)}
                  />
                  <button type="submit" className="primary-button" disabled={busyAction === 'preprocess'}>
                    {busyAction === 'preprocess' ? 'Importing...' : 'Import'}
                  </button>
                </form>
                <div className="helper-text">{selectedFile ? selectedFile.name : preprocessStatus}</div>
              </section>
            ) : null}
          </aside>
        </section>

        <section className="bottom-grid">
          <section className="card">
            <div className="section-title">Playlist</div>
            <div className="playlist-table">
              {dashboard.sources.map((source) => {
                const isActive = source.sourceId === activeSource?.sourceId;

                return (
                  <div key={source.sourceId} className={`playlist-row ${isActive ? 'playlist-row-active' : ''}`}>
                    <div className="playlist-main">
                      <strong>{source.name}</strong>
                      <span>
                        #{source.sourceId} - {source.fps} fps - {formatNumber(source.totalFrames)} frames
                      </span>
                    </div>
                    <div className="playlist-side">
                      <span className="row-label">
                        {source.isSynthetic ? 'Built-in' : source.videoUrl ? 'Playable' : 'Synthetic'}
                      </span>
                      {isAdmin ? (
                        <>
                          <button type="button" className="secondary-button" disabled={Boolean(busyAction)} onClick={() => switchSource(source.sourceId)}>
                            {isActive ? 'Active' : 'Open'}
                          </button>
                          <button
                            type="button"
                            className="danger-button"
                            disabled={Boolean(busyAction) || source.isSynthetic}
                            onClick={() => deleteSource(source.sourceId)}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <span className="row-label">{isActive ? 'Watching Now' : 'Available'}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="section-title">Dashboard</div>
            <div className="diagnostic-grid">
              <section>
                <div className="mini-title">Session</div>
                <pre>{formatJson(displaySession)}</pre>
              </section>
              <section>
                <div className="mini-title">Metrics</div>
                <pre>{formatJson(metrics)}</pre>
              </section>
              <section>
                <div className="mini-title">Source</div>
                <pre>{formatJson(activeSource)}</pre>
              </section>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default App;
