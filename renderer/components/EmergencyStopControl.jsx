import React from 'react'
import styles from './EmergencyStopControl.module.css'

export default function EmergencyStopControl({
  isActive,
  onReset,
  isConnected,
}) {
  const handleReset = React.useCallback(() => {
    if (onReset) {
      onReset()
    }
  }, [onReset])

  return (
    <article className={styles.controlCard} aria-label="Emergency stop control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Emergency Stop</h2>
        <span className={styles.controlSubtitle}>
          Critical safety system
        </span>
      </header>

      <div className={styles.statusContainer}>
        <div className={`${styles.statusIndicator} ${isActive ? styles.statusActive : styles.statusInactive}`}>
          <div className={styles.statusIcon}>
            {isActive ? '🛑' : '✅'}
          </div>
          <div className={styles.statusText}>
            <span className={styles.statusLabel}>Status</span>
            <span className={styles.statusValue}>
              {isActive ? 'ACTIVE' : 'READY'}
            </span>
          </div>
        </div>

        {isActive && (
          <div className={styles.warningMessage} role="alert">
            <span className={styles.warningIcon}>⚠️</span>
            <div className={styles.warningContent}>
              <strong>EMERGENCY STOP ACTIVE</strong>
              <p>All movements and heaters are disabled. Release the E-stop button and click Reset to resume operation.</p>
            </div>
          </div>
        )}

        {!isActive && (
          <div className={styles.infoMessage}>
            <span className={styles.infoIcon}>ℹ️</span>
            <div className={styles.infoContent}>
              <strong>System Ready</strong>
              <p>Emergency stop is not active. Machine is ready for operation.</p>
            </div>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.resetButton}
          onClick={handleReset}
          disabled={!isActive || !isConnected}
          aria-label="Reset emergency stop"
        >
          {isActive ? 'Reset E-Stop' : 'E-Stop Not Active'}
        </button>
      </div>
    </article>
  )
}

