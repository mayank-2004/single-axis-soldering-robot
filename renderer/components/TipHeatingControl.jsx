import React from 'react'
import styles from './TipHeatingControl.module.css'

export default function TipHeatingControl({
  tipTarget,
  onTipTargetChange,
  onApplyTipTarget,
  isHeaterEnabled,
  onToggleHeater,
  heaterStatus,
  currentTemperature,
}) {
  return (
    <article className={styles.controlCard} aria-label="Tip heating control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Tip Heating</h2>
        <span className={styles.controlSubtitle}>Manage target temperature and heater state</span>
      </header>
      <div className={styles.controlBody}>
        <div className={styles.controlRow}>
          <label htmlFor="tip-target" className={styles.controlLabel}>
            Target temperature
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="tip-target"
              name="tip-target"
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              className={styles.controlInput}
              value={tipTarget}
              onChange={onTipTargetChange}
            />
            <span className={styles.controlUnit}>°C</span>
            <button type="button" className={styles.controlButton} onClick={onApplyTipTarget}>
              Set Target
            </button>
          </div>
        </div>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Heater</span>
          <button
            type="button"
            className={[styles.controlToggle, isHeaterEnabled ? styles.controlToggleActive : '']
              .filter(Boolean)
              .join(' ')}
            onClick={onToggleHeater}
            aria-pressed={isHeaterEnabled}
          >
            {isHeaterEnabled ? 'Disable Heater' : 'Enable Heater'}
          </button>
        </div>
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Current temperature</span>
          <span className={styles.controlValue}>{currentTemperature ?? '--'}</span>
        </div>
      </div>
      {heaterStatus ? <p className={styles.controlStatus}>{heaterStatus}</p> : null}
    </article>
  )
}

