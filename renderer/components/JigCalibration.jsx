import React from 'react'
import styles from './JigCalibration.module.css'

export default function JigCalibration({
  jigHeight,
  onJigHeightChange,
  onCalibrate,
  statusMessage,
  isCalibrating = false,
  bedHeight = 280.0, // Total height from home to bed surface
  safeTravelSpace = null, // Calculated safe travel space
}) {
  return (
    <article className={styles.controlCard} aria-label="Jig calibration controls">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Jig Calibration</h2>
        <span className={styles.controlSubtitle}>Set jig reference height for safe positioning</span>
      </header>

      <div className={styles.controlBody}>
        {/* Explanation */}
        <div className={styles.infoSection}>
          <p className={styles.infoText}>
            Jig calibration sets the thickness of your PCB jig. The <strong>bed surface</strong> (where the jig is placed) 
            is <strong>{bedHeight.toFixed(0)}mm</strong> from the home position (upper limit switch). 
            The <strong>jig</strong> is a tool/plate that sits on the bed, and the <strong>jig surface</strong> (where the PCB sits) 
            is on top of the jig. Set the <strong>jig height</strong> (thickness from bed surface to jig surface), 
            and the safe travel space ({safeTravelSpace !== null ? safeTravelSpace.toFixed(2) : '---'}mm) from home to jig surface 
            will be available for safe head movement.
          </p>
        </div>

        {/* Height Information Display */}
        <div className={styles.heightInfoSection}>
          <div className={styles.heightInfoRow}>
            <span className={styles.heightInfoLabel}>Bed Surface (from home):</span>
            <span className={styles.heightInfoValue}>{bedHeight.toFixed(2)} mm</span>
          </div>
          {jigHeight !== null && jigHeight !== undefined && (
            <>
              <div className={styles.heightInfoRow}>
                <span className={styles.heightInfoLabel}>Jig Height (thickness):</span>
                <span className={styles.heightInfoValue}>{jigHeight.toFixed(2)} mm</span>
              </div>
              <div className={styles.heightInfoRow}>
                <span className={styles.heightInfoLabel}>Jig Surface (from home):</span>
                <span className={styles.heightInfoValue}>{(bedHeight - jigHeight).toFixed(2)} mm</span>
              </div>
              {safeTravelSpace !== null && (
                <div className={styles.heightInfoRow}>
                  <span className={styles.heightInfoLabel}>Safe Travel Space:</span>
                  <span className={styles.heightInfoValue}>{safeTravelSpace.toFixed(2)} mm</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Current Jig Height Display */}
        <div className={styles.currentHeightSection}>
          <label className={styles.currentHeightLabel}>Current Jig Height (thickness):</label>
          <div className={styles.currentHeightValue}>
            <span className={styles.heightNumber}>
              {jigHeight !== null && jigHeight !== undefined ? jigHeight.toFixed(2) : '--'}
            </span>
            <span className={styles.heightUnit}>mm</span>
          </div>
        </div>

        {/* Manual Input Method */}
        <div className={styles.inputSection}>
          <label htmlFor="jig-height-input" className={styles.inputLabel}>
            Set Jig Height (Thickness) Manually
          </label>
          <div className={styles.inputGroup}>
            <input
              id="jig-height-input"
              name="jig-height-input"
              type="number"
              min="0"
              max={bedHeight}
              step="0.01"
              inputMode="decimal"
              className={styles.heightInput}
              value={jigHeight !== null && jigHeight !== undefined ? jigHeight.toString() : ''}
              onChange={(e) => {
                const value = e.target.value
                const numeric = value === '' ? null : Number.parseFloat(value)
                onJigHeightChange(numeric)
              }}
              placeholder={`e.g. 10.5 (thickness, max: ${bedHeight.toFixed(0)}mm)`}
              disabled={isCalibrating}
            />
            <span className={styles.inputUnit}>mm</span>
            <button
              type="button"
              className={styles.setButton}
              onClick={() => onCalibrate('manual')}
              disabled={isCalibrating || (jigHeight === null || jigHeight === undefined || jigHeight < 0)}
              title="Save manually entered jig height"
            >
              Set Height
            </button>
          </div>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={styles.statusMessage} role="status">
            {statusMessage}
          </div>
        )}
      </div>
    </article>
  )
}
