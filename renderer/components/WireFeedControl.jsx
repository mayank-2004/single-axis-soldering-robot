import React from 'react'
import styles from './WireFeedControl.module.css'

export default function WireFeedControl({
  calculatedLength,
  wireDiameter,
  volumePerMm,
  status,
  message,
  onWireDiameterChange,
  onStart,
}) {
  return (
    <article className={styles.controlCard} aria-label="Wire feed control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Wire Feed</h2>
        <span className={styles.controlSubtitle}>Advance solder wire automatically</span>
      </header>
      <div className={styles.controlBody}>
        {/* Input field commented out - value received from Arduino */}
        {/* <div className={styles.controlRow}>
          <label htmlFor="wire-diameter" className={styles.controlLabel}>
            Wire Diameter
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="wire-diameter"
              name="wire-diameter"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={styles.controlInput}
              value={wireDiameter}
              onChange={onWireDiameterChange}
              placeholder="e.g. 0.7"
            />
            <span className={styles.controlUnit}>mm</span>
          </div>
        </div> */}

        {/* Display only - value received from Arduino */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Wire Diameter</span>
          <span className={styles.controlValue}>{wireDiameter ?? '--'} mm</span>
        </div>
        {volumePerMm !== null && volumePerMm > 0 && (
          <div className={styles.volumeDisplay}>
            <span className={styles.volumeLabel}>Volume per 1mm:</span>
            <span className={styles.volumeValue}>
              {volumePerMm.toFixed(4)} mm³
            </span>
          </div>
        )}
        {calculatedLength !== null && calculatedLength > 0 && (
          <>
            <div className={styles.controlRow}>
              <label className={styles.controlLabel}>
                Calculated Length
              </label>
              <div className={styles.controlFieldGroup}>
                <div className={styles.calculatedLengthDisplay}>
                  <span className={styles.calculatedLengthValue}>
                    {calculatedLength.toFixed(2)} mm
                  </span>
                  <span className={styles.calculatedLengthLabel}>From Pad Metrics</span>
                </div>
              </div>
            </div>
            {volumePerMm !== null && volumePerMm > 0 && (
              <div className={styles.volumeDisplay}>
                <span className={styles.volumeLabel}>Total Volume:</span>
                <span className={styles.volumeValue}>
                  {(volumePerMm * calculatedLength).toFixed(4)} mm³
                </span>
              </div>
            )}
          </>
        )}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Status</span>
          <span className={styles.controlValue}>{status}</span>
        </div>
        <div className={styles.controlRow}>
          <button
            type="button"
            className={styles.controlButtonWide}
            onClick={onStart}
            disabled={!calculatedLength || calculatedLength <= 0}
          >
            Feed Wire
          </button>
        </div>
      </div>
      {message ? <p className={styles.controlStatus}>{message}</p> : null}
      <p className={styles.infoText}>
        {calculatedLength !== null && calculatedLength > 0
          ? 'Calculated wire length from Pad Soldering Metrics will be used for feeding. Enter wire diameter when inserting a new wire type.'
          : 'Calculate wire length in Pad Soldering Metrics first. Enter wire diameter when inserting a new wire type.'
        }
      </p>
    </article>
  )
}


