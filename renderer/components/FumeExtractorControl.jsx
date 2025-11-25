import React from 'react'
import styles from './FumeExtractorControl.module.css'

export default function FumeExtractorControl({
  enabled,
  speed,
  autoMode,
  onToggle,
  onSpeedChange,
  onAutoModeToggle,
  statusMessage,
}) {
  const handleSpeedInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onSpeedChange) {
      onSpeedChange(value)
    }
  }, [onSpeedChange])

  const handleSpeedInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      if (onSpeedChange) {
        onSpeedChange(value)
      }
    } else {
      // Reset to current speed if invalid
      e.target.value = speed
    }
  }, [onSpeedChange, speed])

  return (
    <article className={styles.controlCard} aria-label="Fume extractor control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Fume Extractor</h2>
        <span className={styles.controlSubtitle}>Control fume extraction during soldering</span>
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
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Input field commented out - value received from Arduino */}
        {/* <div className={styles.controlRow}>
          <label htmlFor="fume-speed" className={styles.controlLabel}>
            Speed
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="fume-speed"
              name="fume-speed"
              type="range"
              min="0"
              max="100"
              step="1"
              className={styles.controlSlider}
              value={speed}
              onChange={handleSpeedInputChange}
              disabled={!enabled}
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className={styles.controlInput}
              value={speed}
              onChange={handleSpeedInputChange}
              onBlur={handleSpeedInputBlur}
              disabled={!enabled}
            />
            <span className={styles.controlUnit}>%</span>
          </div>
        </div> */}
        
        {/* Display only - value received from Arduino */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Speed</span>
          <span className={styles.controlValue}>{speed ?? '--'} %</span>
        </div>

        <div className={styles.controlRow}>
          <label htmlFor="fume-auto" className={styles.controlLabel}>
            Auto Mode
          </label>
          <div className={styles.controlFieldGroup}>
            <button
              id="fume-auto"
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
              {autoMode ? 'Auto-activates during soldering' : 'Manual control only'}
            </span>
          </div>
        </div>

        {enabled && (
          <div className={styles.statusSection}>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Current Speed</span>
              <span className={styles.statusValue}>{speed}%</span>
            </div>
          </div>
        )}
      </div>
      {statusMessage ? <p className={styles.controlStatus}>{statusMessage}</p> : null}
    </article>
  )
}

