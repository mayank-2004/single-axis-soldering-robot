import React from 'react'
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
  isMoving,
}) {
  const [customStepSize, setCustomStepSize] = React.useState(stepSize?.toString() || '1.0')
  const [useCustomStepSize, setUseCustomStepSize] = React.useState(false)

  React.useEffect(() => {
    if (stepSize !== undefined) {
      // Check if current stepSize matches any preset value
      const matchesPreset = stepSizes.some((preset) => Math.abs(preset.value - stepSize) < 0.001)
      setUseCustomStepSize(!matchesPreset)
      if (!matchesPreset) {
        setCustomStepSize(stepSize.toString())
      }
    }
  }, [stepSize])

  const handlePresetStepSizeChange = React.useCallback(
    (value) => {
      setUseCustomStepSize(false)
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
      setCustomStepSize(stepSize?.toString() || '1.0')
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

  return (
    <article className={styles.controlCard} aria-label="Manual movement controls">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Manual Movement</h2>
        <span className={styles.controlSubtitle}>Jog machine axes manually</span>
      </header>

      <div className={styles.controlBody}>
        {/* Current Position Display (Z-axis only - single-axis machine) */}
        <div className={styles.positionDisplay}>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Z:</span>
            <span className={styles.positionValue}>
              {currentPosition.z !== null && currentPosition.z !== undefined
                ? currentPosition.z.toFixed(2)
                : '--'}
            </span>
            <span className={styles.positionUnit}>mm</span>
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

        {/* Home Button */}
        <div className={styles.controlRow}>
          <button
            type="button"
            className={styles.homeButton}
            onClick={handleHome}
            disabled={isMoving}
          >
            Home / Zero Position
          </button>
        </div>

        {isMoving ? (
          <p className={styles.statusMessage}>Moving...</p>
        ) : null}
      </div>
    </article>
  )
}

