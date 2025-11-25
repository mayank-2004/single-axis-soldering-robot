import React from 'react'
import styles from './AirBreezeControl.module.css'

export default function AirBreezeControl({
  enabled,
  isActive,
  duration,
  intensity,
  autoMode,
  onToggle,
  onActivate,
  onDurationChange,
  onIntensityChange,
  onAutoModeToggle,
  statusMessage,
  lastActivated,
}) {
  const handleDurationInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onDurationChange) {
      onDurationChange(value)
    }
  }, [onDurationChange])

  const handleDurationInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value > 0) {
      if (onDurationChange) {
        onDurationChange(value)
      }
    } else {
      // Reset to current duration if invalid
      e.target.value = duration
    }
  }, [onDurationChange, duration])

  const handleIntensityInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onIntensityChange) {
      onIntensityChange(value)
    }
  }, [onIntensityChange])

  const handleIntensityInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      if (onIntensityChange) {
        onIntensityChange(value)
      }
    } else {
      // Reset to current intensity if invalid
      e.target.value = intensity
    }
  }, [onIntensityChange, intensity])

  const handleActivate = React.useCallback(() => {
    if (onActivate) {
      onActivate()
    }
  }, [onActivate])

  return (
    <article className={styles.controlCard} aria-label="Air breeze control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Air Breeze</h2>
        <span className={styles.controlSubtitle}>Control cooling air flow after soldering</span>
      </header>
      <div className={styles.controlBody}>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Status</span>
          <button
            type="button"
            className={[styles.controlToggle, enabled ? styles.controlToggleActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={onToggle}
            aria-pressed={enabled}
            disabled={isActive}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
          {isActive && (
            <span className={styles.activeIndicator}>
              <span className={styles.activeDot}></span>
              Active
            </span>
          )}
        </div>

        {/* Input fields commented out - values received from Arduino */}
        {/* <div className={styles.controlRow}>
          <label htmlFor="air-duration" className={styles.controlLabel}>
            Duration
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="air-duration"
              name="air-duration"
              type="number"
              min="500"
              max="10000"
              step="100"
              className={styles.controlInput}
              value={duration}
              onChange={handleDurationInputChange}
              onBlur={handleDurationInputBlur}
              disabled={isActive}
            />
            <span className={styles.controlUnit}>ms</span>
          </div>
        </div>

        <div className={styles.controlRow}>
          <label htmlFor="air-intensity" className={styles.controlLabel}>
            Intensity
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="air-intensity"
              name="air-intensity"
              type="range"
              min="0"
              max="100"
              step="1"
              className={styles.controlSlider}
              value={intensity}
              onChange={handleIntensityInputChange}
              disabled={isActive}
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className={styles.controlInput}
              value={intensity}
              onChange={handleIntensityInputChange}
              onBlur={handleIntensityInputBlur}
              disabled={isActive}
            />
            <span className={styles.controlUnit}>%</span>
          </div>
        </div> */}
        
        {/* Display only - values received from Arduino */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Duration</span>
          <span className={styles.controlValue}>{duration ?? '--'} ms</span>
        </div>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Intensity</span>
          <span className={styles.controlValue}>{intensity ?? '--'} %</span>
        </div>

        <div className={styles.controlRow}>
          <label htmlFor="air-auto" className={styles.controlLabel}>
            Auto Mode
          </label>
          <div className={styles.controlFieldGroup}>
            <button
              id="air-auto"
              type="button"
              className={[styles.controlToggle, autoMode ? styles.controlToggleActive : '']
                .filter(Boolean)
                .join(' ')}
              onClick={onAutoModeToggle}
              aria-pressed={autoMode}
            >
              {autoMode ? 'Enabled' : 'Disabled'}
            </button>
            <span className={styles.controlHint}>
              {autoMode ? 'Auto-activates after soldering' : 'Manual control only'}
            </span>
          </div>
        </div>

        <div className={styles.controlRow}>
          <button
            type="button"
            className={[styles.activateButton, isActive ? styles.activateButtonActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={handleActivate}
            disabled={isActive}
            aria-pressed={isActive}
          >
            {isActive ? 'Cooling...' : 'Activate Air Breeze'}
          </button>
        </div>

        {lastActivated && (
          <div className={styles.statusSection}>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Last Activated</span>
              <span className={styles.statusValue}>
                {new Date(lastActivated).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>
      {statusMessage ? <p className={styles.controlStatus}>{statusMessage}</p> : null}
    </article>
  )
}


