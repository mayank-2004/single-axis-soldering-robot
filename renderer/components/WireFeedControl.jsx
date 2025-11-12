import React from 'react'
import styles from './WireFeedControl.module.css'

export default function WireFeedControl({
  length,
  rate,
  status,
  message,
  onLengthChange,
  onRateChange,
  onStart,
}) {
  return (
    <article className={styles.controlCard} aria-label="Wire feed control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Wire Feed</h2>
        <span className={styles.controlSubtitle}>Advance solder wire automatically</span>
      </header>
      <div className={styles.controlBody}>
        <div className={styles.controlRow}>
          <label htmlFor="wire-length" className={styles.controlLabel}>
            Length per feed
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="wire-length"
              name="wire-length"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              className={styles.controlInput}
              value={length}
              onChange={onLengthChange}
            />
            <span className={styles.controlUnit}>mm</span>
          </div>
        </div>
        <div className={styles.controlRow}>
          <label htmlFor="wire-rate" className={styles.controlLabel}>
            Feed rate
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="wire-rate"
              name="wire-rate"
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              className={styles.controlInput}
              value={rate}
              onChange={onRateChange}
            />
            <span className={styles.controlUnit}>mm/s</span>
          </div>
        </div>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Status</span>
          <span className={styles.controlValue}>{status}</span>
        </div>
        <div className={styles.controlRow}>
          <button type="button" className={styles.controlButtonWide} onClick={onStart}>
            Feed Wire
          </button>
        </div>
      </div>
      {message ? <p className={styles.controlStatus}>{message}</p> : null}
    </article>
  )
}

