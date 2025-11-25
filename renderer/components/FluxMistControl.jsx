import React from 'react'
import styles from './FluxMistControl.module.css'

export default function FluxMistControl({
  isDispensing,
  duration,
  flowRate,
  autoMode,
  onDispense,
  onDurationChange,
  onFlowRateChange,
  onAutoModeToggle,
  statusMessage,
  lastDispensed,
  fluxRemaining,
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

  const handleFlowRateInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onFlowRateChange) {
      onFlowRateChange(value)
    }
  }, [onFlowRateChange])

  const handleFlowRateInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      if (onFlowRateChange) {
        onFlowRateChange(value)
      }
    } else {
      // Reset to current flow rate if invalid
      e.target.value = flowRate
    }
  }, [onFlowRateChange, flowRate])

  const handleDispense = React.useCallback(() => {
    if (onDispense) {
      onDispense()
    }
  }, [onDispense])

  return (
    <article className={styles.controlCard} aria-label="Flux mist control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Flux Mist</h2>
        <span className={styles.controlSubtitle}>Control flux mist dispensing</span>
      </header>
      <div className={styles.controlBody}>
        {/* Input fields commented out - values received from Arduino */}
        {/* <div className={styles.controlRow}>
          <label htmlFor="flux-duration" className={styles.controlLabel}>
            Duration
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="flux-duration"
              name="flux-duration"
              type="number"
              min="100"
              max="5000"
              step="100"
              className={styles.controlInput}
              value={duration}
              onChange={handleDurationInputChange}
              onBlur={handleDurationInputBlur}
              disabled={isDispensing}
            />
            <span className={styles.controlUnit}>ms</span>
          </div>
        </div>

        <div className={styles.controlRow}>
          <label htmlFor="flux-flowrate" className={styles.controlLabel}>
            Flow Rate
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="flux-flowrate"
              name="flux-flowrate"
              type="range"
              min="0"
              max="100"
              step="1"
              className={styles.controlSlider}
              value={flowRate}
              onChange={handleFlowRateInputChange}
              disabled={isDispensing}
            />
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              className={styles.controlInput}
              value={flowRate}
              onChange={handleFlowRateInputChange}
              onBlur={handleFlowRateInputBlur}
              disabled={isDispensing}
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
          <span className={styles.controlLabel}>Flow Rate</span>
          <span className={styles.controlValue}>{flowRate ?? '--'} %</span>
        </div>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Flux Remaining</span>
          <span className={styles.controlValue}>
            {fluxRemaining !== null && fluxRemaining !== undefined 
              ? `${fluxRemaining.toFixed(0)}` 
              : '--'} %
          </span>
        </div>

        <div className={styles.controlRow}>
          <label htmlFor="flux-auto" className={styles.controlLabel}>
            Auto Mode
          </label>
          <div className={styles.controlFieldGroup}>
            <button
              id="flux-auto"
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
              {autoMode ? 'Auto-applies before soldering' : 'Manual control only'}
            </span>
          </div>
        </div>

        <div className={styles.controlRow}>
          <button
            type="button"
            className={[styles.dispenseButton, isDispensing ? styles.dispenseButtonActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={handleDispense}
            disabled={isDispensing}
            aria-pressed={isDispensing}
          >
            {isDispensing ? 'Dispensing...' : 'Dispense Flux Mist'}
          </button>
        </div>

        {lastDispensed && (
          <div className={styles.statusSection}>
            <div className={styles.statusRow}>
              <span className={styles.statusLabel}>Last Dispensed</span>
              <span className={styles.statusValue}>
                {new Date(lastDispensed).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>
      {statusMessage ? <p className={styles.controlStatus}>{statusMessage}</p> : null}
    </article>
  )
}

