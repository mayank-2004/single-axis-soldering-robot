import React from 'react'
import styles from './AirControl.module.css'

export default function AirControl({
  // Air Breeze props
  airBreezeEnabled,
  airBreezeActive,
  airBreezeDuration,
  airBreezeIntensity,
  airBreezeAutoMode,
  onAirBreezeToggle,
  onAirBreezeActivate,
  onAirBreezeDurationChange,
  onAirBreezeIntensityChange,
  onAirBreezeAutoModeToggle,
  airBreezeLastActivated,
  // Air Jet Pressure props
  airJetEnabled,
  airJetActive,
  airJetDuration,
  airJetPressure,
  airJetAutoMode,
  onAirJetToggle,
  onAirJetActivate,
  onAirJetDurationChange,
  onAirJetPressureChange,
  onAirJetAutoModeToggle,
  airJetLastActivated,
  // Status messages
  airBreezeStatusMessage,
  airJetStatusMessage,
}) {
  // Air Breeze handlers
  const handleAirBreezeDurationInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onAirBreezeDurationChange) {
      onAirBreezeDurationChange(value)
    }
  }, [onAirBreezeDurationChange])

  const handleAirBreezeDurationInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value > 0) {
      if (onAirBreezeDurationChange) {
        onAirBreezeDurationChange(value)
      }
    } else {
      e.target.value = airBreezeDuration
    }
  }, [onAirBreezeDurationChange, airBreezeDuration])

  const handleAirBreezeIntensityInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onAirBreezeIntensityChange) {
      onAirBreezeIntensityChange(value)
    }
  }, [onAirBreezeIntensityChange])

  const handleAirBreezeIntensityInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      if (onAirBreezeIntensityChange) {
        onAirBreezeIntensityChange(value)
      }
    } else {
      e.target.value = airBreezeIntensity
    }
  }, [onAirBreezeIntensityChange, airBreezeIntensity])

  // Air Jet Pressure handlers
  const handleAirJetDurationInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onAirJetDurationChange) {
      onAirJetDurationChange(value)
    }
  }, [onAirJetDurationChange])

  const handleAirJetDurationInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value > 0) {
      if (onAirJetDurationChange) {
        onAirJetDurationChange(value)
      }
    } else {
      e.target.value = airJetDuration
    }
  }, [onAirJetDurationChange, airJetDuration])

  const handleAirJetPressureInputChange = React.useCallback((e) => {
    const value = e.target.value
    if (onAirJetPressureChange) {
      onAirJetPressureChange(value)
    }
  }, [onAirJetPressureChange])

  const handleAirJetPressureInputBlur = React.useCallback((e) => {
    const value = Number.parseFloat(e.target.value)
    if (Number.isFinite(value) && value >= 0 && value <= 100) {
      if (onAirJetPressureChange) {
        onAirJetPressureChange(value)
      }
    } else {
      e.target.value = airJetPressure
    }
  }, [onAirJetPressureChange, airJetPressure])

  return (
    <article className={styles.controlCard} aria-label="Air control system">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Air Control System</h2>
        <span className={styles.controlSubtitle}>Dual valve control from single air cylinder</span>
      </header>

      <div className={styles.controlBody}>
        {/* Air Source Indicator */}
        <div className={styles.airSourceIndicator}>
          <div className={styles.airSourceIcon}>💨</div>
          <div className={styles.airSourceText}>
            <span className={styles.airSourceLabel}>Air Source:</span>
            <span className={styles.airSourceValue}>Cylinder Container</span>
          </div>
        </div>

        {/* Air Jet Pressure Section - Tip Cleaning */}
        <div className={styles.valveSection}>
          <div className={styles.valveHeader}>
            <h3 className={styles.valveTitle}>Valve 1: Air Jet Pressure</h3>
            <span className={styles.valveSubtitle}>High-pressure blast for tip cleaning</span>
          </div>

          <div className={styles.valveControls}>
            <div className={styles.controlRow}>
              <span className={styles.controlLabel}>Status</span>
              <button
                type="button"
                className={[styles.controlToggle, airJetEnabled ? styles.controlToggleActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={onAirJetToggle}
                aria-pressed={airJetEnabled}
                disabled={airJetActive}
              >
                {airJetEnabled ? 'ON' : 'OFF'}
              </button>
              {airJetActive && (
                <span className={[styles.activeIndicator, styles.activeIndicatorJet].join(' ')}>
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
                  value={airJetDuration}
                  onChange={handleAirJetDurationInputChange}
                  onBlur={handleAirJetDurationInputBlur}
                  disabled={airJetActive}
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
                  value={airJetPressure}
                  onChange={handleAirJetPressureInputChange}
                  disabled={airJetActive}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className={styles.controlInput}
                  value={airJetPressure}
                  onChange={handleAirJetPressureInputChange}
                  onBlur={handleAirJetPressureInputBlur}
                  disabled={airJetActive}
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
                  className={[styles.controlToggle, airJetAutoMode ? styles.controlToggleActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={onAirJetAutoModeToggle}
                  aria-pressed={airJetAutoMode}
                >
                  {airJetAutoMode ? 'Enabled' : 'Disabled'}
                </button>
                <span className={styles.controlHint}>
                  {airJetAutoMode ? 'Auto-activates after soldering' : 'Manual control only'}
                </span>
              </div>
            </div>

            <div className={styles.controlRow}>
              <button
                type="button"
                className={[styles.activateButton, styles.activateButtonJet, airJetActive ? styles.activateButtonActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={onAirJetActivate}
                disabled={airJetActive || airBreezeActive}
                aria-pressed={airJetActive}
              >
                {airJetActive ? 'Blasting...' : 'Activate Air Jet'}
              </button>
            </div>

            {airJetLastActivated && (
              <div className={styles.statusSection}>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>Last Activated</span>
                  <span className={styles.statusValue}>
                    {new Date(airJetLastActivated).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}

            {airJetStatusMessage && (
              <p className={styles.controlStatus}>{airJetStatusMessage}</p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className={styles.valveDivider}></div>

        {/* Air Breeze Section - Cooling */}
        <div className={styles.valveSection}>
          <div className={styles.valveHeader}>
            <h3 className={styles.valveTitle}>Valve 2: Air Breeze</h3>
            <span className={styles.valveSubtitle}>Cooling air flow after soldering</span>
          </div>

          <div className={styles.valveControls}>
            <div className={styles.controlRow}>
              <span className={styles.controlLabel}>Status</span>
              <button
                type="button"
                className={[styles.controlToggle, airBreezeEnabled ? styles.controlToggleActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={onAirBreezeToggle}
                aria-pressed={airBreezeEnabled}
                disabled={airBreezeActive}
              >
                {airBreezeEnabled ? 'ON' : 'OFF'}
              </button>
              {airBreezeActive && (
                <span className={[styles.activeIndicator, styles.activeIndicatorBreeze].join(' ')}>
                  <span className={styles.activeDot}></span>
                  Active
                </span>
              )}
            </div>

            <div className={styles.controlRow}>
              <label htmlFor="breeze-duration" className={styles.controlLabel}>
                Duration
              </label>
              <div className={styles.controlFieldGroup}>
                <input
                  id="breeze-duration"
                  name="breeze-duration"
                  type="number"
                  min="500"
                  max="10000"
                  step="100"
                  className={styles.controlInput}
                  value={airBreezeDuration}
                  onChange={handleAirBreezeDurationInputChange}
                  onBlur={handleAirBreezeDurationInputBlur}
                  disabled={airBreezeActive}
                />
                <span className={styles.controlUnit}>ms</span>
              </div>
            </div>

            <div className={styles.controlRow}>
              <label htmlFor="breeze-intensity" className={styles.controlLabel}>
                Intensity
              </label>
              <div className={styles.controlFieldGroup}>
                <input
                  id="breeze-intensity"
                  name="breeze-intensity"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  className={styles.controlSlider}
                  value={airBreezeIntensity}
                  onChange={handleAirBreezeIntensityInputChange}
                  disabled={airBreezeActive}
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  className={styles.controlInput}
                  value={airBreezeIntensity}
                  onChange={handleAirBreezeIntensityInputChange}
                  onBlur={handleAirBreezeIntensityInputBlur}
                  disabled={airBreezeActive}
                />
                <span className={styles.controlUnit}>%</span>
              </div>
            </div>

            <div className={styles.controlRow}>
              <label htmlFor="breeze-auto" className={styles.controlLabel}>
                Auto Mode
              </label>
              <div className={styles.controlFieldGroup}>
                <button
                  id="breeze-auto"
                  type="button"
                  className={[styles.controlToggle, airBreezeAutoMode ? styles.controlToggleActive : '']
                    .filter(Boolean)
                    .join(' ')}
                  onClick={onAirBreezeAutoModeToggle}
                  aria-pressed={airBreezeAutoMode}
                >
                  {airBreezeAutoMode ? 'Enabled' : 'Disabled'}
                </button>
                <span className={styles.controlHint}>
                  {airBreezeAutoMode ? 'Auto-activates after retraction' : 'Manual control only'}
                </span>
              </div>
            </div>

            <div className={styles.controlRow}>
              <button
                type="button"
                className={[styles.activateButton, styles.activateButtonBreeze, airBreezeActive ? styles.activateButtonActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={onAirBreezeActivate}
                disabled={airBreezeActive || airJetActive}
                aria-pressed={airBreezeActive}
              >
                {airBreezeActive ? 'Cooling...' : 'Activate Air Breeze'}
              </button>
            </div>

            {airBreezeLastActivated && (
              <div className={styles.statusSection}>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>Last Activated</span>
                  <span className={styles.statusValue}>
                    {new Date(airBreezeLastActivated).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}

            {airBreezeStatusMessage && (
              <p className={styles.controlStatus}>{airBreezeStatusMessage}</p>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

