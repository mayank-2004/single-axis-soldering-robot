import React from 'react'
import styles from './JigCalibration.module.css'

export default function JigCalibration({
  jigHeight,
  onJigHeightChange,
  onCalibrate,
  statusMessage,
  isCalibrating = false,
  currentZPosition = null,
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
            Jig calibration sets a reference height for your PCB jig. This ensures the soldering head
            maintains safe clearance above the jig and prevents crashes during sequences.
          </p>
        </div>

        {/* Current Jig Height Display */}
        <div className={styles.currentHeightSection}>
          <label className={styles.currentHeightLabel}>Current Jig Height:</label>
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
            Set Jig Height Manually
          </label>
          <div className={styles.inputGroup}>
            <input
              id="jig-height-input"
              name="jig-height-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={styles.heightInput}
              value={jigHeight !== null && jigHeight !== undefined ? jigHeight.toString() : ''}
              onChange={(e) => {
                const value = e.target.value
                const numeric = value === '' ? null : Number.parseFloat(value)
                onJigHeightChange(numeric)
              }}
              placeholder="e.g. 10.5"
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
          <p className={styles.inputHint}>
            Measure the height from the jig surface to the home position (0.00mm) and enter it here.
          </p>
        </div>

        {/* Auto-Calibration Method */}
        <div className={styles.calibrationSection}>
          <label className={styles.calibrationLabel}>Auto-Calibrate from Current Position</label>
          <div className={styles.calibrationInfo}>
            <p className={styles.calibrationHint}>
              Position the head at the jig surface, then click "Calibrate from Current Position".
              The current Z position will be used as the jig height reference.
            </p>
            {currentZPosition !== null && currentZPosition !== undefined && (
              <div className={styles.positionInfo}>
                <span className={styles.positionLabel}>Current Z Position:</span>
                <span className={styles.positionValue}>
                  {currentZPosition.toFixed(2)} mm
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className={styles.calibrateButton}
            onClick={() => onCalibrate('auto')}
            disabled={isCalibrating || currentZPosition === null}
            title="Use current Z position as jig height reference"
          >
            {isCalibrating ? 'Calibrating...' : 'Calibrate from Current Position'}
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={styles.statusMessage} role="status">
            {statusMessage}
          </div>
        )}

        {/* Safety Note */}
        <div className={styles.safetyNote}>
          <span className={styles.safetyIcon}>⚠️</span>
          <p className={styles.safetyText}>
            <strong>Safety:</strong> The safe retraction height is calculated as: Jig Height + Component Height + 2mm clearance.
            Ensure jig height is accurate to prevent crashes.
          </p>
        </div>
      </div>
    </article>
  )
}
