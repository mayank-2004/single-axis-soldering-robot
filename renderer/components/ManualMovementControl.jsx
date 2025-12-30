import React, { useEffect, useState } from 'react'
import styles from './ManualMovementControl.module.css'

const stepSizes = [
  { value: 0.1, label: '0.1 mm' },
  { value: 0.5, label: '0.5 mm' },
  { value: 1, label: '1 mm' },
  { value: 5, label: '5 mm' },
  { value: 10, label: '10 mm' },
]

export default function ManualMovementControl({
  currentPosition,
  stepSize,
  onStepSizeChange,
  onJog,
  onHome,
  onSave,
  isMoving,
  statusMessage,
  limitSwitchAlert = false,
  isSerialConnected = false,
  isReceivingArduinoData = false,
  zAxisSpeed = 95,
  onSpeedChange,
}) {
  const [customStepSize, setCustomStepSize] = useState(stepSize?.toString() || '1.0')
  const [useCustomStepSize, setUseCustomStepSize] = useState(false)
  const [userSelectedCustomMode, setUserSelectedCustomMode] = useState(false)

  useEffect(() => {
    if (stepSize !== undefined) {
      if (!userSelectedCustomMode) {
        const matchesPreset = stepSizes.some((preset) => Math.abs(preset.value - stepSize) < 0.001)
        setUseCustomStepSize(!matchesPreset)
        if (!matchesPreset) {
          setCustomStepSize(stepSize.toString())
        }
      } else {
        setCustomStepSize(stepSize.toString())
      }
    }
  }, [stepSize, userSelectedCustomMode])

  const handlePresetStepSizeChange = React.useCallback(
    (value) => {
      setUseCustomStepSize(false)
      setUserSelectedCustomMode(false) // User selected preset mode
      onStepSizeChange(value)
    },
    [onStepSizeChange]
  )

  const handleCustomStepSizeChange = React.useCallback(
    (e) => {
      const value = e.target.value
      setCustomStepSize(value)
      
      const numeric = Number.parseFloat(value)
      if (Number.isFinite(numeric) && numeric > 0) {
        onStepSizeChange(numeric)
      }
    },
    [onStepSizeChange]
  )

  const handleToggleCustomStepSize = React.useCallback(() => {
    if (!useCustomStepSize) {
      // Switching TO custom mode - mark that user selected it
      setCustomStepSize(stepSize?.toString() || '1.0')
      setUserSelectedCustomMode(true)
    } else {
      // Switching FROM custom mode - allow auto-detection again
      setUserSelectedCustomMode(false)
    }
    setUseCustomStepSize(!useCustomStepSize)
  }, [useCustomStepSize, stepSize])

  const currentStepSize = useCustomStepSize ? Number.parseFloat(customStepSize) || stepSize : stepSize

  const handleJog = React.useCallback(
    (axis, direction) => {
      if (isMoving) {
        console.warn('[ManualMovementControl] Cannot jog - machine is already moving')
        return
      }
      console.log('[ManualMovementControl] Jog button clicked:', { axis, direction, stepSize: currentStepSize })
      onJog(axis, direction, currentStepSize)
    },
    [onJog, currentStepSize, isMoving]
  )

  const handleHome = React.useCallback(() => {
    if (isMoving) {
      console.warn('[ManualMovementControl] Cannot home - machine is already moving')
      return
    }
    console.log('[ManualMovementControl] Home button clicked')
    onHome()
  }, [onHome, isMoving])

  const handleSave = React.useCallback(() => {
    if (isMoving) {
      console.warn('[ManualMovementControl] Cannot save - machine is already moving')
      return
    }
    console.log('[ManualMovementControl] Save button clicked')
    onSave?.()
  }, [onSave, isMoving])

  return (
    <article className={styles.controlCard} aria-label="Manual movement controls">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Manual Movement</h2>
        <span className={styles.controlSubtitle}>Jog machine axes manually</span>
      </header>

      <div className={styles.controlBody}>
        {/* Connection Status Indicator */}
        <div className={styles.connectionStatus}>
          <div className={styles.connectionStatusRow}>
            <span className={styles.connectionStatusLabel}>Mode:</span>
            <div className={styles.connectionStatusBadge}>
              {isSerialConnected ? (
                <>
                  <span className={`${styles.statusDot} ${styles.statusDotConnected}`} />
                  <span className={styles.statusText}>
                    {isReceivingArduinoData ? 'Hardware (Active)' : 'Hardware (Connected)'}
                  </span>
                </>
              ) : (
                <>
                  <span className={`${styles.statusDot} ${styles.statusDotSimulation}`} />
                  <span className={styles.statusText}>Simulation</span>
                </>
              )}
            </div>
          </div>
          {isSerialConnected && (
            <div className={styles.connectionInfo}>
              <span className={styles.connectionInfoText}>
                Commands are being sent to Arduino
              </span>
            </div>
          )}
          {!isSerialConnected && (
            <div className={styles.connectionInfo}>
              <span className={styles.connectionInfoText}>
                Commands are simulated (not sent to hardware)
              </span>
            </div>
          )}
        </div>

        {/* Current Position Display (Z-axis only - single-axis machine) */}
        <div className={styles.positionDisplay}>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Z:</span>
            <span className={styles.positionValue}>
              {currentPosition.z !== null && currentPosition.z !== undefined ? (() => {
                // Format to match LcdDisplay: handle negatives and pad with zeros
                const isNegative = currentPosition.z < 0
                const absPos = Math.abs(currentPosition.z)
                const parts = absPos.toFixed(2).split('.')
                const integer = parts[0].padStart(3, '0')
                const decimal = parts[1] || '00'
                const sign = isNegative ? '-' : ''
                return `${sign}${integer}.${decimal}`
              })() : '000.00'}
            </span>
            <span className={styles.positionUnit}>mm</span>
          </div>
        </div>

        {/* Speed Control */}
        <div className={styles.controlRow}>
          <label htmlFor="z-axis-speed" className={styles.controlLabel}>
            Movement Speed
            {zAxisSpeed > 100 && (
              <span style={{ marginLeft: '8px', color: '#fbbf24', fontSize: '10px', fontWeight: 'bold' }}>
                ⚡ TURBO
              </span>
            )}
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="z-axis-speed-slider"
              name="z-axis-speed-slider"
              type="range"
              min="1"
              max="200"
              step="1"
              className={styles.controlSlider}
              value={zAxisSpeed}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10)
                if (onSpeedChange) {
                  onSpeedChange(value)
                }
              }}
              disabled={isMoving || !isSerialConnected}
              title={`Z-axis movement speed: ${zAxisSpeed}% ${zAxisSpeed > 100 ? '(Turbo Mode)' : zAxisSpeed === 100 ? '(Fastest Normal)' : zAxisSpeed === 1 ? '(Slowest)' : ''}`}
            />
            <input
              id="z-axis-speed"
              name="z-axis-speed"
              type="number"
              min="1"
              max="200"
              step="1"
              className={styles.controlInput}
              value={zAxisSpeed}
              onChange={(e) => {
                const value = Number.parseInt(e.target.value, 10)
                if (!Number.isNaN(value) && value >= 1 && value <= 200) {
                  if (onSpeedChange) {
                    onSpeedChange(value)
                  }
                }
              }}
              onBlur={(e) => {
                const value = Number.parseInt(e.target.value, 10)
                if (Number.isNaN(value) || value < 1) {
                  if (onSpeedChange) {
                    onSpeedChange(1)
                  }
                } else if (value > 200) {
                  if (onSpeedChange) {
                    onSpeedChange(200)
                  }
                }
              }}
              disabled={isMoving || !isSerialConnected}
            />
            <span className={styles.controlUnit}>%</span>
          </div>
        </div>

        {/* Step Size Selection */}
        <div className={styles.controlRow}>
          <label htmlFor="step-size" className={styles.controlLabel}>
            Step Size
          </label>
          <div className={styles.stepSizeContainer}>
            {!useCustomStepSize ? (
              <select
                id="step-size"
                name="step-size"
                className={styles.stepSizeSelect}
                value={stepSize}
                onChange={(e) => handlePresetStepSizeChange(Number.parseFloat(e.target.value))}
                disabled={isMoving}
              >
                {stepSizes.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <div className={styles.customStepSizeInput}>
                <input
                  id="step-size-custom"
                  name="step-size-custom"
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  className={styles.stepSizeInput}
                  value={customStepSize}
                  onChange={handleCustomStepSizeChange}
                  disabled={isMoving}
                  placeholder="Enter step size"
                />
                <span className={styles.stepSizeUnit}>mm</span>
              </div>
            )}
            <button
              type="button"
              className={styles.customStepSizeToggle}
              onClick={handleToggleCustomStepSize}
              disabled={isMoving}
              title={useCustomStepSize ? 'Use preset step sizes' : 'Enter custom step size'}
            >
              {useCustomStepSize ? '📋' : '✏️'}
            </button>
          </div>
        </div>

        {/* Jog Controls (Z-axis only - single-axis machine) */}
        <div className={styles.jogControls}>
          <div className={styles.axisGroup}>
            <div className={styles.axisLabel}>Z Axis (Up/Down)</div>
            <div className={styles.axisButtons}>
              <button
                type="button"
                className={styles.jogButton}
                onClick={() => handleJog('z', -1)}
                disabled={isMoving}
                aria-label="Move Z axis down"
              >
                ↓
              </button>
              <button
                type="button"
                className={styles.jogButton}
                onClick={() => handleJog('z', 1)}
                disabled={isMoving}
                aria-label="Move Z axis up"
              >
                ↑
              </button>
            </div>
          </div>
          <p className={styles.helpText} style={{ fontSize: '0.85em', color: '#666', marginTop: '10px' }}>
            Note: This is a single-axis machine. PCB is moved manually by the operator.
          </p>
        </div>

        {/* Home and Save Buttons */}
        <div className={styles.controlRow} style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className={styles.homeButton}
            onClick={handleHome}
            disabled={isMoving}
            title="Home to 0.00mm (top limit switch position)"
          >
            Home
          </button>
          <button
            type="button"
            className={styles.saveButton || styles.homeButton}
            onClick={handleSave}
            disabled={isMoving}
            title="Save movement sequence from home position to current position"
          >
            Save
          </button>
        </div>

        {/* Limit Switch Alert */}
        {limitSwitchAlert && (
          <div className={styles.limitAlert} role="alert">
            <span className={styles.limitAlertIcon}>⚠️</span>
            <span className={styles.limitAlertMessage}>
              {statusMessage || 'Limit switch reached'}
            </span>
          </div>
        )}

        {isMoving ? (
          <p className={styles.statusMessage}>Moving...</p>
        ) : statusMessage && !limitSwitchAlert ? (
          <p className={styles.statusMessage}>{statusMessage}</p>
        ) : null}
      </div>
    </article>
  )
}

