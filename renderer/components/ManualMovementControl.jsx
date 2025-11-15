import React from 'react'
import styles from './ManualMovementControl.module.css'

const stepSizes = [
  { value: 0.1, label: '0.1 mm' },
  { value: 1, label: '1 mm' },
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
  const handleJog = React.useCallback(
    (axis, direction) => {
      if (isMoving) return
      onJog(axis, direction, stepSize)
    },
    [onJog, stepSize, isMoving]
  )

  return (
    <article className={styles.controlCard} aria-label="Manual movement controls">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Manual Movement</h2>
        <span className={styles.controlSubtitle}>Jog machine axes manually</span>
      </header>

      <div className={styles.controlBody}>
        {/* Current Position Display */}
        <div className={styles.positionDisplay}>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>X:</span>
            <span className={styles.positionValue}>
              {currentPosition.x !== null && currentPosition.x !== undefined
                ? currentPosition.x.toFixed(2)
                : '--'}
            </span>
            <span className={styles.positionUnit}>mm</span>
          </div>
          <div className={styles.positionRow}>
            <span className={styles.positionLabel}>Y:</span>
            <span className={styles.positionValue}>
              {currentPosition.y !== null && currentPosition.y !== undefined
                ? currentPosition.y.toFixed(2)
                : '--'}
            </span>
            <span className={styles.positionUnit}>mm</span>
          </div>
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
          <select
            id="step-size"
            name="step-size"
            className={styles.stepSizeSelect}
            value={stepSize}
            onChange={(e) => onStepSizeChange(Number.parseFloat(e.target.value))}
            disabled={isMoving}
          >
            {stepSizes.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Jog Controls */}
        <div className={styles.jogControls}>
          {/* X Axis Controls */}
          <div className={styles.axisGroup}>
            <div className={styles.axisLabel}>X Axis</div>
            <div className={styles.axisButtons}>
              <button
                type="button"
                className={styles.jogButton}
                onClick={() => handleJog('x', -1)}
                disabled={isMoving}
                aria-label="Move X axis negative"
              >
                ←
              </button>
              <button
                type="button"
                className={styles.jogButton}
                onClick={() => handleJog('x', 1)}
                disabled={isMoving}
                aria-label="Move X axis positive"
              >
                →
              </button>
            </div>
          </div>

          {/* Y Axis Controls */}
          <div className={styles.axisGroup}>
            <div className={styles.axisLabel}>Y Axis</div>
            <div className={styles.axisButtons}>
              <button
                type="button"
                className={styles.jogButton}
                onClick={() => handleJog('y', -1)}
                disabled={isMoving}
                aria-label="Move Y axis negative"
              >
                ↓
              </button>
              <button
                type="button"
                className={styles.jogButton}
                onClick={() => handleJog('y', 1)}
                disabled={isMoving}
                aria-label="Move Y axis positive"
              >
                ↑
              </button>
            </div>
          </div>

          {/* Z Axis Controls */}
          <div className={styles.axisGroup}>
            <div className={styles.axisLabel}>Z Axis</div>
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
        </div>

        {/* Home Button */}
        <div className={styles.controlRow}>
          <button
            type="button"
            className={styles.homeButton}
            onClick={onHome}
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

