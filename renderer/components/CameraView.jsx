import React from 'react'
import styles from './CameraView.module.css'

export default function CameraView({ isActive = true }) {
  const videoRef = React.useRef(null)
  const streamRef = React.useRef(null)
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [availableDevices, setAvailableDevices] = React.useState([])
  const [selectedDeviceId, setSelectedDeviceId] = React.useState(null)
  const [facingMode, setFacingMode] = React.useState('environment') // 'user' or 'environment'

  // Get available video devices
  const enumerateDevices = React.useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(device => device.kind === 'videoinput')
      setAvailableDevices(videoDevices)
      
      // Auto-select first device if none selected
      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId)
      }
    } catch (err) {
      console.error('[CameraView] Error enumerating devices:', err)
      setError('Failed to enumerate camera devices')
    }
  }, [selectedDeviceId])

  // Start camera stream
  const startStream = React.useCallback(async () => {
    if (!videoRef.current) return

    try {
      setError(null)

      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }

      const constraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId } }
          : {
              facingMode: facingMode,
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
        audio: false,
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      videoRef.current.srcObject = stream
      setIsStreaming(true)
    } catch (err) {
      console.error('[CameraView] Error starting camera:', err)
      let errorMessage = 'Failed to start camera'
      
      if (err.name === 'NotAllowedError') {
        errorMessage = 'Camera access denied. Please allow camera access.'
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera.'
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is being used by another application.'
      } else if (err.message) {
        errorMessage = err.message
      }
      
      setError(errorMessage)
      setIsStreaming(false)
    }
  }, [selectedDeviceId, facingMode])

  // Stop camera stream
  const stopStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsStreaming(false)
  }, [])

  // Initialize on mount
  React.useEffect(() => {
    if (isActive) {
      enumerateDevices()
    }

    return () => {
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]) // Only run on mount/unmount

  // Start stream when device is selected or active state changes
  React.useEffect(() => {
    if (isActive && (selectedDeviceId || availableDevices.length > 0)) {
      startStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, isActive, availableDevices.length])

  // Handle device selection change
  const handleDeviceChange = React.useCallback((e) => {
    setSelectedDeviceId(e.target.value)
  }, [])

  // Toggle stream
  const handleToggleStream = React.useCallback(() => {
    if (isStreaming) {
      stopStream()
    } else {
      startStream()
    }
  }, [isStreaming, startStream, stopStream])

  // Capture snapshot
  const handleCaptureSnapshot = React.useCallback(() => {
    if (!videoRef.current || !isStreaming) return

    const canvas = document.createElement('canvas')
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(videoRef.current, 0, 0)
    
    // Convert to blob and download
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `camera-snapshot-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [isStreaming])

  return (
    <article className={styles.cameraCard} aria-label="Camera view">
      <header className={styles.cameraHeader}>
        <div className={styles.cameraHeaderInfo}>
          <h2 className={styles.cameraTitle}>Camera View</h2>
          <span className={styles.cameraSubtitle}>
            {isStreaming ? 'Live feed active' : 'Camera inactive'}
          </span>
        </div>
        <div className={styles.cameraActions}>
          {availableDevices.length > 1 && (
            <select
              className={styles.deviceSelect}
              value={selectedDeviceId || ''}
              onChange={handleDeviceChange}
              disabled={isStreaming}
            >
              {availableDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={styles.toggleButton}
            onClick={handleToggleStream}
            aria-label={isStreaming ? 'Stop camera' : 'Start camera'}
          >
            {isStreaming ? '⏸ Stop' : '▶ Start'}
          </button>
          <button
            type="button"
            className={styles.snapshotButton}
            onClick={handleCaptureSnapshot}
            disabled={!isStreaming}
            aria-label="Capture snapshot"
          >
            📷
          </button>
        </div>
      </header>

      <div className={styles.cameraContent}>
        {error && (
          <div className={styles.errorMessage} role="alert">
            <span className={styles.errorIcon}>⚠</span>
            <span>{error}</span>
          </div>
        )}

        <div className={styles.videoContainer}>
          <video
            ref={videoRef}
            className={styles.video}
            autoPlay
            playsInline
            muted
            aria-label="Camera video feed"
          />
          {!isStreaming && !error && (
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}>📹</span>
              <span className={styles.placeholderText}>Camera feed will appear here</span>
            </div>
          )}
        </div>

        {isStreaming && videoRef.current && (
          <div className={styles.videoInfo}>
            <span>
              {videoRef.current.videoWidth} × {videoRef.current.videoHeight}
            </span>
          </div>
        )}
      </div>
    </article>
  )
}

