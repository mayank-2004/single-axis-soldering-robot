import React from 'react'
import styles from './AirJetPressureControl.module.css'

export default function AirJetPressureControl({
  enabled,
  isActive,
  duration,
  pressure,
  autoMode,
  onToggle,
  onActivate,
  onDurationChange,
  onPressureChange,
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

  const handlePressureInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onPressureChange) {
      onPressureChange(value)
    }
  }, [onPressureChange])

  const handlePressureInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      if (onPressureChange) {
        onPressureChange(value)
      }
    } else {
      // Reset to current pressure if invalid
      e.target.value = pressure
    }
  }, [onPressureChange, pressure])

  const handleActivate = React.useCallback(() => {
    if (onActivate) {
      onActivate()
    }
  }, [onActivate])

  return (
    <article className={styles.controlCard} aria-label="Air jet pressure control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Air Jet Pressure</h2>
        <span className={styles.controlSubtitle}>High-pressure air blast to clean soldering tip</span>
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

        <div className={styles.controlRow}>
          <label htmlFor="jet-duration" className={styles.controlLabel}>
            Duration
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="jet-duration"
              name="jet-duration"
              type="number"
              min="50"
              max="1000"
              step="50"
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
          <label htmlFor="jet-pressure" className={styles.controlLabel}>
            Pressure
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="jet-pressure"
              name="jet-pressure"
              type="range"
              min="0"
              max="100"
              step="1"
              className={styles.controlSlider}
              value={pressure}
              onChange={handlePressureInputChange}
              disabled={isActive}
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className={styles.controlInput}
              value={pressure}
              onChange={handlePressureInputChange}
              onBlur={handlePressureInputBlur}
              disabled={isActive}
            />
            <span className={styles.controlUnit}>%</span>
          </div>
        </div>

        <div className={styles.controlRow}>
          <label htmlFor="jet-auto" className={styles.controlLabel}>
            Auto Mode
          </label>
          <div className={styles.controlFieldGroup}>
            <button
              id="jet-auto"
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
              {autoMode ? 'Auto-activates after each soldering operation' : 'Manual control only'}
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
            {isActive ? 'Blasting...' : 'Activate Air Jet'}
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

