import React, { useCallback, useEffect, useRef, useState } from 'react'
import styles from './CameraView.module.css'
import Script from 'next/script' // Next.js Script component

export default function CameraView({ isActive = true }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const videoContainerRef = useRef(null)
  const canvasRef = useRef(null) // Ref for the overlay canvas
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [availableDevices, setAvailableDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // 'user' or 'environment'

  // OpenCV state
  const [isOpenCvReady, setIsOpenCvReady] = useState(false)
  const [cvProcessingEnabled, setCvProcessingEnabled] = useState(false)

  // Zoom functionality state
  const [zoomLevel, setZoomLevel] = useState(1) // 1 = no zoom, >1 = zoomed in
  const [panX, setPanX] = useState(0) // Pan offset X (pixels)
  const [panY, setPanY] = useState(0) // Pan offset Y (pixels)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // OpenCV Loaded Callback
  const onOpenCvReady = () => {
    // OpenCV.js (Emscripten) might not be fully initialized when the script loads.
    // We must check if 'cv' is ready or wait for onRuntimeInitialized.
    if (window.cv && window.cv.Mat && window.cv.onRuntimeInitialized) {
      // Already appeared ready, but let's be safe and allow the callback or confirm
      console.log('[CameraView] OpenCV.js loaded, waiting for runtime...')
      // We can't overwrite onRuntimeInitialized if it already passed, 
      // but usually one sets it before loading. 
      // Since we load async, we might catch it mid-flight or after.

      // Setup a check loop or trust the callback if we could set it earlier.
      // But effectively, if window.cv.Mat works, we are good? Not always with Emscripten.

      // Safe pattern for async loading:
      if (window.cv.getBuildInformation) {
        console.log('[CameraView] OpenCV.js already initialized')
        setIsOpenCvReady(true)
      } else {
        // Hook callback
        window.cv.onRuntimeInitialized = () => {
          console.log('[CameraView] OpenCV.js Runtime Initialized')
          setIsOpenCvReady(true)
        }
      }
    } else if (window.cv) {
      // Some versions, or if we missed the window.
      // Let's assume if we can assign onRuntimeInitialized we should.
      window.cv.onRuntimeInitialized = () => {
        console.log('[CameraView] OpenCV.js Runtime Initialized')
        setIsOpenCvReady(true)
      }

      // Check if it happened already?
      try {
        new window.cv.Mat()
        console.log('[CameraView] OpenCV.js appears ready immediately')
        setIsOpenCvReady(true)
      } catch (e) {
        console.log('[CameraView] OpenCV.js not ready yet, waiting...')
      }
    } else {
      console.error('window.cv not found')
    }
  }

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
        video: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode }),
          width: { ideal: 1920 }, // Request Full HD for clarity
          height: { ideal: 1080 }
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

  // Ensure canvas matches video size and container aspect ratio matches video to fix alignment
  useEffect(() => {
    if (isStreaming && videoRef.current && canvasRef.current && videoContainerRef.current) {
      const updateCanvasSize = () => {
        const video = videoRef.current
        const container = videoContainerRef.current
        const canvas = canvasRef.current

        if (video && canvas && container) {
          // Match canvas resolution to video
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight

          // Fix Alignment: Force container to match video aspect ratio exactly
          // This prevents object-fit: contain from creating black bars that offset the overlay
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            container.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`
          }
        }
      }

      videoRef.current.addEventListener('loadedmetadata', updateCanvasSize)
      videoRef.current.addEventListener('resize', updateCanvasSize)

      return () => {
        if (videoRef.current) {
          videoRef.current.removeEventListener('loadedmetadata', updateCanvasSize)
          videoRef.current.removeEventListener('resize', updateCanvasSize)
        }
      }
    }
  }, [isStreaming])

  // OpenCV Processing Loop
  const processingRef = useRef(null)

  useEffect(() => {
    // Stop processing if disabled or not ready
    if (!cvProcessingEnabled || !isOpenCvReady || !isStreaming || !videoRef.current || !canvasRef.current) {
      if (processingRef.current) {
        cancelAnimationFrame(processingRef.current)
        processingRef.current = null
      }
      // Clear canvas when processing stops
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d')
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    // Initialize OpenCV objects once per session if possible, but for safety in React 
    // we'll create/delete inside the loop or use a ref to hold them to avoid memory leaks.
    // For simplicity and safety against leaks, we'll try to keep them in the loop frame for now
    // but optimized.

    // --- ALLOCATION (Once per session) ---
    // We allocate objects HERE, outside the loop, so we don't spam the heap.
    let src = null
    let hsv = null
    let mask = null
    // We need Mats for inRange bounds (standard approach in JS OpenCV)
    let low = null
    let high = null

    let contours = null
    let hierarchy = null

    try {
      src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4)
      hsv = new cv.Mat()
      mask = new cv.Mat()

      // Bounds for "Silver/Gold" (Low Saturation, High Value)
      // Note: For CV_8UC3, we need 3 values? H(0-180), S(0-255), V(0-255)
      // But src is CV_8UC4 (RGBA) -> Converted to RGB -> HSV
      low = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC3, [0, 0, 150, 0])
      high = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC3, [180, 80, 255, 0])

      contours = new cv.MatVector()
      hierarchy = new cv.Mat()
    } catch (e) {
      console.error('Failed to initialize CV objects:', e)
      return // Abort if we can't allocate
    }

    const processFrame = () => {
      try {
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
          // console.log('Video not ready') // Reduced log spam
          processingRef.current = requestAnimationFrame(processFrame)
          return
        }

        // Sync canvas size if needed (and resize Mat if video size changed - rare but possible)
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          // If video size changed, we'd technically need to resize 'src'. 
          // For simplicity in this robot, we assume constant resolution.
        }

        // 1. Capture Frame directly into 'src' via temp canvas

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        src.data.set(imgData.data)

        // 3. Process - COLOR BASED
        cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB) // Drop Alpha
        cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV)  // RGB -> HSV

        // Threshold (Find Metallic colors: Low Saturation, High Value)
        cv.inRange(hsv, low, high, mask)

        // Find Contours on the MASK
        cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

        // 4. Draw Output
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const minArea = 1000
        const maxArea = (video.videoWidth * video.videoHeight) * 0.9

        for (let i = 0; i < contours.size(); ++i) {
          const contour = contours.get(i)
          if (!contour) continue

          const area = cv.contourArea(contour)

          if (area > minArea && area < maxArea) {
            const rect = cv.boundingRect(contour)

            ctx.strokeStyle = '#00ff00' // Green
            ctx.lineWidth = 2
            ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)

            const centerX = rect.x + rect.width / 2
            const centerY = rect.y + rect.height / 2

            ctx.beginPath()
            ctx.moveTo(centerX - 5, centerY)
            ctx.lineTo(centerX + 5, centerY)
            ctx.moveTo(centerX, centerY - 5)
            ctx.lineTo(centerX, centerY + 5)
            ctx.stroke()

            ctx.fillStyle = '#00ff00'
            ctx.font = '12px monospace'
            ctx.fillText(`${rect.width}x${rect.height}`, rect.x, rect.y - 5)
          }
          // CRITICAL MEMORY FIX: Delete the handle returned by .get()
          contour.delete()
        }

      } catch (err) {
        console.error('CV Loop Error:', err)
      }

      processingRef.current = requestAnimationFrame(processFrame)
    }

    // Start Loop
    processingRef.current = requestAnimationFrame(processFrame)

    // Cleanup Function (Runs only when component unmounts or CV disabled)
    return () => {
      if (processingRef.current) {
        cancelAnimationFrame(processingRef.current)
      }

      // DEALLOCATION (Once at end)
      try {
        if (src && !src.isDeleted()) src.delete()
        if (hsv && !hsv.isDeleted()) hsv.delete()
        if (mask && !mask.isDeleted()) mask.delete()
        if (low && !low.isDeleted()) low.delete()
        if (high && !high.isDeleted()) high.delete()

        if (contours && !contours.isDeleted()) contours.delete()
        if (hierarchy && !hierarchy.isDeleted()) hierarchy.delete()
      } catch (e) {
        console.error('Cleanup error:', e)
      }
    }
  }, [cvProcessingEnabled, isOpenCvReady, isStreaming])

  return (
    <article className={styles.cameraCard} aria-label="Camera view">
      {/* Load OpenCV.js asynchronously */}
      <Script
        src="/opencv.js"
        onLoad={onOpenCvReady}
        onError={() => setError('Failed to load OpenCV library')}
        strategy="afterInteractive"
      />

      <header className={styles.cameraHeader}>
        <div className={styles.cameraHeaderInfo}>
          <h2 className={styles.cameraTitle}>Camera View</h2>
          <span className={styles.cameraSubtitle}>
            {isStreaming ? (isOpenCvReady ? 'Live feed + CV Ready' : 'Live feed active') : 'Camera inactive'}
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

          {isOpenCvReady && (
            <button
              type="button"
              className={styles.toggleButton}
              onClick={() => setCvProcessingEnabled(!cvProcessingEnabled)}
              style={{ backgroundColor: cvProcessingEnabled ? '#10b981' : undefined }}
              title="Toggle Computer Vision Processing"
            >
              {cvProcessingEnabled ? '👁 CV On' : '👁 CV Off'}
            </button>
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
          {/* Video Element (Bottom Layer) */}
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

          {/* Canvas Overlay (Top Layer) - Moves with video zoom/pan */}
          <canvas
            ref={canvasRef}
            className={styles.overlayCanvas}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none', // Allow clicks to pass through to container
              transform: `scale(${zoomLevel}) translate(${panX / zoomLevel}px, ${panY / zoomLevel}px)`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.3s ease-out',
              zIndex: 10
            }}
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
              {cvProcessingEnabled ? ' • CV Active' : ''}
            </span>
          </div>
        )}
      </div>
    </article>
  )
}

