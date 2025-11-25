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
  padCategory,
  compensatedTemperature,
  baseTemperature,
}) {
  return (
    <article className={styles.controlCard} aria-label="Tip heating control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Tip Heating</h2>
        <span className={styles.controlSubtitle}>Manage target temperature and heater state</span>
      </header>
      <div className={styles.controlBody}>
        {/* Input fields commented out - values received from Arduino */}
        {/* <div className={styles.controlRow}>
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
        </div> */}
        
        {/* Display only - value received from Arduino */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Target temperature</span>
          <span className={styles.controlValue}>{tipTarget ?? '--'} °C</span>
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

        {/* Thermal Mass Compensation Suggestion */}
        {padCategory && compensatedTemperature !== null && (
          <div className={styles.thermalSuggestion}>
            <div className={styles.thermalSuggestionHeader}>
              <span className={styles.thermalSuggestionLabel}>Suggested Temperature</span>
              <span className={`${styles.padCategoryBadge} ${styles[`padCategory${padCategory.charAt(0).toUpperCase() + padCategory.slice(1)}`]}`}>
                {padCategory.toUpperCase()} Pad
              </span>
            </div>
            <div className={styles.thermalSuggestionDetails}>
              <div className={styles.thermalSuggestionRow}>
                <span className={styles.thermalSuggestionText}>Base:</span>
                <span className={styles.thermalSuggestionValue}>{baseTemperature}°C</span>
              </div>
              <div className={styles.thermalSuggestionRow}>
                <span className={styles.thermalSuggestionText}>Recommended:</span>
                <span className={styles.thermalSuggestionValueHighlight}>{compensatedTemperature}°C</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {heaterStatus ? <p className={styles.controlStatus}>{heaterStatus}</p> : null}
    </article>
  )
}

