import React, { useCallback, useEffect, useRef, useState } from 'react'
import styles from './CameraView.module.css'

export default function CameraView({ isActive = true }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const videoContainerRef = useRef(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [availableDevices, setAvailableDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' or 'environment'

  // Zoom functionality state
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = no zoom, >1 = zoomed in
  const [panX, setPanX] = useState(0) // Pan offset X (pixels)
  const [panY, setPanY] = useState(0) // Pan offset Y (pixels)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Request camera permission first, then enumerate devices
  const requestPermissionAndEnumerate = useCallback(async () => {
    try {
      // First, request permission by trying to get user media with minimal constraints
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        })
        // Stop the temporary stream immediately - we just needed it for permission
        tempStream.getTracks().forEach(track => track.stop())
        console.log('[CameraView] Camera permission granted')
      } catch (permErr) {
        console.error('[CameraView] Permission error:', permErr)
        if (permErr.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access in your system settings.')
          return
        }
        throw permErr
      }

      // Now enumerate devices (should work after permission is granted)
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter(device => device.kind === 'videoinput')
      console.log('[CameraView] Found video devices:', videoDevices.length)
      setAvailableDevices(videoDevices)

      // Auto-select first device if none selected
      if (!selectedDeviceId && videoDevices.length > 0) {
        setSelectedDeviceId(videoDevices[0].deviceId)
      }
    } catch (err) {
      console.error('[CameraView] Error enumerating devices:', err)
      setError('Failed to enumerate camera devices: ' + err.message)
    }
  }, [selectedDeviceId])

  // Get available video devices (legacy method - kept for fallback)
  const enumerateDevices = useCallback(async () => {
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
  const startStream = useCallback(async () => {
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
        errorMessage = 'Camera access denied. Please allow camera access in Windows Settings → Privacy → Camera, then restart the app.'
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No camera found. Please connect a camera and refresh.'
      } else if (err.name === 'NotReadableError') {
        errorMessage = 'Camera is being used by another application. Please close other apps using the camera.'
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Camera does not support requested settings. Try selecting a different camera.'
      } else if (err.message) {
        errorMessage = err.message
      }

      console.error('[CameraView] Full error details:', {
        name: err.name,
        message: err.message,
        constraint: err.constraint,
        stack: err.stack
      })

      setError(errorMessage)
      setIsStreaming(false)
    }
  }, [selectedDeviceId, facingMode])

  // Stop camera stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsStreaming(false)
  }, [])

  // Initialize on mount - request permission first
  useEffect(() => {
    if (isActive) {
      // Use the new method that requests permission first
      requestPermissionAndEnumerate()
    }

    return () => {
      stopStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]) // Only run on mount/unmount

  // Start stream when device is selected or active state changes
  useEffect(() => {
    if (isActive && (selectedDeviceId || availableDevices.length > 0)) {
      startStream()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, isActive, availableDevices.length])

  // Handle device selection change
  const handleDeviceChange = useCallback((e) => {
    setSelectedDeviceId(e.target.value)
  }, [])

  // Toggle stream
  const handleToggleStream = useCallback(() => {
    if (isStreaming) {
      stopStream()
    } else {
      startStream()
    }
  }, [isStreaming, startStream, stopStream])

  // Capture snapshot
  const handleCaptureSnapshot = useCallback(() => {
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

  // Handle double-click to zoom
  const handleDoubleClick = useCallback((e) => {
    if (!videoRef.current || !videoContainerRef.current || !isStreaming) return

    const container = videoContainerRef.current

    // Get container bounds
    const containerRect = container.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    // Get click position relative to container
    const clickX = e.clientX - containerRect.left
    const clickY = e.clientY - containerRect.top
    const centerX = containerWidth / 2
    const centerY = containerHeight / 2

    // Calculate the clicked point's position in "unzoomed image equivalent space" relative to center
    // Formula: (ScreenPos - Center - Pan) / Zoom = ImageOffset 
    const imgOffsetX = (clickX - centerX - panX) / zoomLevel
    const imgOffsetY = (clickY - centerY - panY) / zoomLevel

    // Determine new zoom level
    // Cycle: 1 -> 2 -> 4 -> 6 -> 8 -> 10 -> 1
    let newZoomLevel = zoomLevel
    if (zoomLevel === 1) {
      newZoomLevel = 2
    } else {
      newZoomLevel += 2
    }

    if (newZoomLevel > 10) {
      // Reset to 1x
      setZoomLevel(1)
      setPanX(0)
      setPanY(0)
      return
    }

    setZoomLevel(newZoomLevel)

    // Calculate new pan to CENTER the clicked point
    // We want the point at ImageOffset to be at Center (0,0) on screen
    // 0 = ImageOffset * NewZoom + NewPan
    // NewPan = -(ImageOffset * NewZoom)

    setPanX(-(imgOffsetX * newZoomLevel))
    setPanY(-(imgOffsetY * newZoomLevel))
  }, [isStreaming, zoomLevel, panX, panY])

  // Handle mouse down for dragging
  const handleMouseDown = useCallback((e) => {
    if (zoomLevel <= 1) return // Only allow dragging when zoomed
    setIsDragging(true)
    setDragStart({
      x: e.clientX - panX,
      y: e.clientY - panY
    })
    e.preventDefault()
  }, [zoomLevel, panX, panY])

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e) => {
    if (!isDragging || zoomLevel <= 1) return

    const newPanX = e.clientX - dragStart.x
    const newPanY = e.clientY - dragStart.y

    // Constrain panning to keep video within bounds
    if (!videoContainerRef.current || !videoRef.current) return

    const container = videoContainerRef.current
    const containerRect = container.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    // Calculate max pan based on zoom level
    const maxPanX = (containerWidth * (zoomLevel - 1)) / 2
    const maxPanY = (containerHeight * (zoomLevel - 1)) / 2

    setPanX(Math.max(-maxPanX, Math.min(maxPanX, newPanX)))
    setPanY(Math.max(-maxPanY, Math.min(maxPanY, newPanY)))
  }, [isDragging, zoomLevel, dragStart])

  // Handle mouse up to stop dragging
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Reset zoom
  const handleResetZoom = useCallback(() => {
    setZoomLevel(1)
    setPanX(0)
    setPanY(0)
  }, [])

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

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

        <div
          ref={videoContainerRef}
          className={styles.videoContainer}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          <video
            ref={videoRef}
            className={styles.video}
            style={{
              transform: `scale(${zoomLevel}) translate(${panX / zoomLevel}px, ${panY / zoomLevel}px)`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.3s ease-out',
            }}
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
          {zoomLevel > 1 && (
            <button
              type="button"
              className={styles.zoomResetButton}
              onClick={handleResetZoom}
              aria-label="Reset zoom"
              title="Reset zoom (or double-click)"
            >
              🔍 {zoomLevel.toFixed(1)}×
            </button>
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

