import React, { useState, useEffect, useCallback } from 'react'
import styles from './PIDTuningControl.module.css'

export default function PIDTuningControl({
  pidEnabled,
  pidKp,
  pidKi,
  pidKd,
  pidPower,
  pidOutput,
  isConnected,
  onPIDParametersSet,
  onPIDEnabledSet,
}) {
  const [kp, setKp] = useState(pidKp?.toString() || '5.0')
  const [ki, setKi] = useState(pidKi?.toString() || '0.1')
  const [kd, setKd] = useState(pidKd?.toString() || '1.0')
  const [isTuning, setIsTuning] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // Update local state when props change
  useEffect(() => {
    if (pidKp !== undefined) setKp(pidKp.toString())
    if (pidKi !== undefined) setKi(pidKi.toString())
    if (pidKd !== undefined) setKd(pidKd.toString())
  }, [pidKp, pidKi, pidKd])

  const handleApply = useCallback(() => {
    const kpValue = parseFloat(kp)
    const kiValue = parseFloat(ki)
    const kdValue = parseFloat(kd)

    if (isNaN(kpValue) || isNaN(kiValue) || isNaN(kdValue)) {
      setStatusMessage('Error: All values must be valid numbers')
      return
    }

    if (kpValue < 0 || kpValue > 100) {
      setStatusMessage('Error: Kp must be between 0 and 100')
      return
    }

    if (kiValue < 0 || kiValue > 10) {
      setStatusMessage('Error: Ki must be between 0 and 10')
      return
    }

    if (kdValue < 0 || kdValue > 10) {
      setStatusMessage('Error: Kd must be between 0 and 10')
      return
    }

    setIsTuning(true)
    setStatusMessage('Applying PID parameters...')

    if (onPIDParametersSet) {
      onPIDParametersSet(kpValue, kiValue, kdValue)
        .then(() => {
          setStatusMessage(`PID tuned: Kp=${kpValue.toFixed(2)}, Ki=${kiValue.toFixed(3)}, Kd=${kdValue.toFixed(2)}`)
          setTimeout(() => setStatusMessage(''), 3000)
        })
        .catch((error) => {
          setStatusMessage(`Error: ${error.message || 'Failed to set PID parameters'}`)
        })
        .finally(() => {
          setIsTuning(false)
        })
    }
  }, [kp, ki, kd, onPIDParametersSet])

  const handleTogglePID = useCallback(() => {
    if (onPIDEnabledSet) {
      onPIDEnabledSet(!pidEnabled)
    }
  }, [pidEnabled, onPIDEnabledSet])

  return (
    <article className={styles.controlCard} aria-label="PID Temperature Control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>PID Temperature Control</h2>
        <div className={styles.toggleContainer}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={pidEnabled}
              onChange={handleTogglePID}
              disabled={!isConnected}
              className={styles.toggleInput}
            />
            <span className={styles.toggleSlider} />
            <span className={styles.toggleText}>
              {pidEnabled ? 'PID Enabled' : 'PID Disabled (ON/OFF)'}
            </span>
          </label>
        </div>
      </header>

      {pidEnabled && (
        <>
          <div className={styles.pidParameters}>
            <div className={styles.parameterGroup}>
              <label className={styles.parameterLabel}>
                Kp (Proportional)
                <span className={styles.parameterHint}>Response to current error</span>
              </label>
              <input
                type="number"
                value={kp}
                onChange={(e) => setKp(e.target.value)}
                min="0"
                max="100"
                step="0.1"
                className={styles.parameterInput}
                disabled={!isConnected || isTuning}
              />
            </div>

            <div className={styles.parameterGroup}>
              <label className={styles.parameterLabel}>
                Ki (Integral)
                <span className={styles.parameterHint}>Eliminates steady-state error</span>
              </label>
              <input
                type="number"
                value={ki}
                onChange={(e) => setKi(e.target.value)}
                min="0"
                max="10"
                step="0.01"
                className={styles.parameterInput}
                disabled={!isConnected || isTuning}
              />
            </div>

            <div className={styles.parameterGroup}>
              <label className={styles.parameterLabel}>
                Kd (Derivative)
                <span className={styles.parameterHint}>Reduces overshoot</span>
              </label>
              <input
                type="number"
                value={kd}
                onChange={(e) => setKd(e.target.value)}
                min="0"
                max="10"
                step="0.01"
                className={styles.parameterInput}
                disabled={!isConnected || isTuning}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              onClick={handleApply}
              disabled={!isConnected || isTuning}
              className={styles.applyButton}
            >
              {isTuning ? 'Applying...' : 'Apply PID Parameters'}
            </button>
          </div>

          {pidPower !== undefined && (
            <div className={styles.pidStatus}>
              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>Heater Power:</span>
                <span className={styles.statusValue}>{pidPower.toFixed(1)}%</span>
              </div>
              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>PWM Output:</span>
                <span className={styles.statusValue}>{pidOutput?.toFixed(0) || 0} / 255</span>
              </div>
              <div className={styles.powerBar}>
                <div
                  className={styles.powerBarFill}
                  style={{ width: `${Math.min(100, Math.max(0, pidPower))}%` }}
                />
              </div>
            </div>
          )}

          {statusMessage && (
            <p className={styles.statusMessage}>{statusMessage}</p>
          )}

          <div className={styles.infoBox}>
            <h3 className={styles.infoTitle}>PID Tuning Tips:</h3>
            <ul className={styles.infoList}>
              <li>Start with default values: Kp=5.0, Ki=0.1, Kd=1.0</li>
              <li>Increase Kp for faster response (but may cause overshoot)</li>
              <li>Increase Ki to eliminate steady-state error</li>
              <li>Increase Kd to reduce oscillations and overshoot</li>
              <li>Monitor temperature stability and adjust gradually</li>
            </ul>
          </div>
        </>
      )}

      {!pidEnabled && (
        <div className={styles.disabledMessage}>
          <p>PID control is disabled. Using simple ON/OFF control with hysteresis.</p>
          <p className={styles.disabledHint}>
            Enable PID control above for smoother, more stable temperature control.
          </p>
        </div>
      )}
    </article>
  )
}

