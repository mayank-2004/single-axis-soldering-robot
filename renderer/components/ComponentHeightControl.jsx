import React from 'react'
import styles from './ComponentHeightControl.module.css'

export default function ComponentHeightControl({
  value,
  onChange,
  onSubmit,
  statusMessage,
}) {
  return (
    <section className={styles.heightSection} aria-label="Component clearance input">
      {/* Input field commented out - value received from Arduino */}
      {/* <label htmlFor="component-height" className={styles.heightLabel}>
        Max component height from PCB
      </label>
      <div className={styles.heightInputGroup}>
        <input
          id="component-height"
          name="component-height"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          className={styles.heightInput}
          value={value}
          onChange={onChange}
          placeholder="e.g. 4.75"
        />
        <span className={styles.heightUnit}>mm</span>
        <button type="button" className={styles.heightButton} onClick={onSubmit}>
          Set Height
        </button>
      </div>
      <p className={styles.heightHint}>
        Measure the tallest component on the board and enter its height to ensure safe Z-axis clearance.
      </p> */}
      
      {/* Display only - value received from Arduino */}
      <div className={styles.heightLabelGroup}>
        <label className={styles.heightLabel}>
          Max component height from PCB
        </label>
        <div className={styles.heightValueGroup}>
          <span className={styles.heightValue}>{value ?? '--'}</span>
          <span className={styles.heightUnit}>mm</span>
        </div>
      </div>
      <p className={styles.heightHint}>
        Value received from Arduino machine.
      </p>
      {statusMessage ? (
        <p className={styles.heightStatus} role="status">
          {statusMessage}
        </p>
      ) : null}
    </section>
  )
}

