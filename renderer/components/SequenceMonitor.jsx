import React from 'react'
import styles from './SequenceMonitor.module.css'

export default function SequenceMonitor({ 
  sequenceState,
  onStart,
  onStop,
  onPause,
  onResume,
  padPositions = [],
}) {
  const { 
    stage, 
    isActive, 
    isPaused,
    lastCompleted, 
    currentPad,
    totalPads,
    progress,
    error,
  } = sequenceState || {}

  const handleStart = React.useCallback(() => {
    if (onStart) {
      onStart(padPositions)
    }
  }, [onStart, padPositions])

  const handleStop = React.useCallback(() => {
    if (onStop) {
      onStop()
    }
  }, [onStop])

  const handlePause = React.useCallback(() => {
    if (onPause) {
      onPause()
    }
  }, [onPause])

  const handleResume = React.useCallback(() => {
    if (onResume) {
      onResume()
    }
  }, [onResume])

  return (
    <article className={styles.controlCard} aria-label="Soldering sequence overview">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Sequence Monitor</h2>
        <span className={styles.controlSubtitle}>
          {totalPads > 0 ? `${totalPads} pad${totalPads > 1 ? 's' : ''} configured` : 'Control soldering sequence'}
        </span>
      </header>

      {error && (
        <div className={styles.errorMessage} role="alert">
          <span className={styles.errorIcon}>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.sequenceGrid}>
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Current stage</span>
          <span className={styles.sequenceValue}>{stage ?? 'idle'}</span>
        </div>
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Status</span>
          <span className={styles.sequenceValue}>
            {isPaused ? 'Paused' : isActive ? 'Running' : 'Idle'}
          </span>
        </div>
        {totalPads > 0 && (
          <div className={styles.sequenceItem}>
            <span className={styles.sequenceLabel}>Progress</span>
            <span className={styles.sequenceValue}>
              Pad {currentPad + 1} of {totalPads} ({progress}%)
            </span>
          </div>
        )}
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Last completed</span>
          <span className={styles.sequenceValue}>{lastCompleted ?? '--'}</span>
        </div>
      </div>

      {totalPads > 0 && progress > 0 && (
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      <div className={styles.sequenceActions}>
        {!isActive ? (
          <button
            type="button"
            className={styles.startButton}
            onClick={handleStart}
            disabled={padPositions.length === 0}
          >
            Start Sequence
          </button>
        ) : (
          <>
            {isPaused ? (
              <button
                type="button"
                className={styles.resumeButton}
                onClick={handleResume}
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                className={styles.pauseButton}
                onClick={handlePause}
              >
                Pause
              </button>
            )}
            <button
              type="button"
              className={styles.stopButton}
              onClick={handleStop}
            >
              Stop
            </button>
          </>
        )}
      </div>
    </article>
  )
}

