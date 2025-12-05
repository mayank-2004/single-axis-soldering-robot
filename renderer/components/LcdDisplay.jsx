import React from 'react'
import styles from './LcdDisplay.module.css'

const fallbackReadings = [
  // Single-axis machine: X and Y axes removed (PCB moved manually)
  { label: 'Z Axis', value: '000.00 → 000.00', unit: 'mm', icon: '↕' },
  { label: 'Wire Remaining', value: '100', unit: '%', length: '14.3 m', icon: '⚡' },
  { label: 'Flux Remaining', value: '82', unit: '%', icon: '💧' },
  { label: 'Tip Temp', value: '345', unit: '°C', icon: '🌡️' },
  { label: 'Feed Rate', value: '8.0', unit: 'mm/s', icon: '⏩' },
  { label: 'Speed', value: '210', unit: 'mm/s', icon: '⚡' },
]

export default function LcdDisplay({
  title = 'Calibration Monitor',
  subtitle = 'Single Axis Soldering Robot',
  readings = fallbackReadings,
  footer,
  headerActions = [],
}) {
  const axisReadings = React.useMemo(
    () => readings.filter(({ label }) => label?.includes('Axis')),
    [readings]
  )

  const otherReadings = React.useMemo(
    () => readings.filter(({ label }) => !label?.includes('Axis')),
    [readings]
  )

  // Check if wire remaining is low (<= 10%) - synced with SpoolWireControl
  const wireRemainingReading = React.useMemo(
    () => otherReadings.find(({ label }) => label === 'Wire Remaining'),
    [otherReadings]
  )

  const wirePercentage = React.useMemo(() => {
    if (!wireRemainingReading || !wireRemainingReading.value) return null
    const numeric = typeof wireRemainingReading.value === 'number'
      ? wireRemainingReading.value
      : parseFloat(String(wireRemainingReading.value).replace(/[^0-9.]/g, ''))
    return Number.isFinite(numeric) ? numeric : null
  }, [wireRemainingReading])

  const isWireLow = wirePercentage !== null && wirePercentage <= 10
  const isWireEmpty = wirePercentage !== null && wirePercentage <= 0

  return (
    <div className={styles.lcdWrapper} role="group" aria-label="Robot calibration display">
      <div className={styles.lcdBezel}>
        <div className={styles.lcdHeader}>
          <div className={styles.lcdHeaderInfo}>
            <span className={styles.lcdTitle}>{title}</span>
            <span className={styles.lcdSubtitle}>{subtitle}</span>
          </div>
          {headerActions?.length ? (
            <div className={styles.lcdHeaderActions}>
              {headerActions.map(({ key, label, isActive, onToggle, statusText = isActive ? 'On' : 'Off' }) => (
                <button
                  type="button"
                  key={key ?? label}
                  className={[
                    styles.lcdActionButton,
                    isActive ? styles.lcdActionButtonActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={onToggle}
                  aria-pressed={isActive}
                >
                  <span className={styles.lcdActionLabel}>{label}</span>
                  <span className={styles.lcdActionStatus}>{statusText}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.lcdScreen}>
          <div className={styles.lcdGlare} aria-hidden />
          <div className={styles.lcdContent}>
            {axisReadings.length ? (
              <div className={styles.axisGroup} role="group" aria-label="Axis calibration values">
                {axisReadings.map(({ label, value, unit, icon }) => (
                  <div className={styles.axisItem} key={label}>
                    <span className={styles.axisLabel}>
                      {icon ? <span className={styles.axisIcon}>{icon}</span> : null}
                      {label}
                    </span>
                    <span className={styles.axisValue}>
                      {value}
                      {unit ? <span className={styles.axisUnit}>{unit}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {otherReadings.map(({ label, value, unit, icon, length }) => {
              const isWireRemaining = label === 'Wire Remaining'
              const isEmpty = isWireRemaining && isWireEmpty
              const isLow = isWireRemaining && isWireLow && !isWireEmpty
              
              return (
                <div
                  key={label}
                  className={`${styles.lcdRow} ${isEmpty ? styles.lcdRowEmpty : ''} ${isLow ? styles.lcdRowWarning : ''}`}
                >
                  <span className={`${styles.lcdLabel} ${isEmpty ? styles.lcdLabelEmpty : ''} ${isLow ? styles.lcdLabelWarning : ''}`}>
                    {icon ? <span className={styles.lcdIcon}>{icon}</span> : null}
                    {label}
                  </span>
                  <span className={`${styles.lcdValue} ${isEmpty ? styles.lcdValueEmpty : ''} ${isLow ? styles.lcdValueWarning : ''}`}>
                    <span>{value}</span>
                    {unit ? <span className={styles.lcdUnit}>{unit}</span> : null}
                    {isWireRemaining && length && (
                      <span className={styles.lcdLength}> ({length})</span>
                    )}
                  </span>
                </div>
              )
            })}

            {/* Empty spool alert - highest priority - synced with SpoolWireControl */}
            {isWireEmpty && wirePercentage !== null && (
              <div className={styles.lcdAlertEmpty} role="alert">
                <span className={styles.lcdAlertEmptyIcon}>🔴</span>
                <div className={styles.lcdAlertEmptyContent}>
                  <span className={styles.lcdAlertEmptyTitle}>SPOOL EMPTY</span>
                  <span className={styles.lcdAlertEmptyMessage}>
                    WIRE COMPLETELY USED - REFILL SPOOL NOW
                  </span>
                </div>
              </div>
            )}

            {/* Low wire remaining alert - show only if not empty - synced with SpoolWireControl */}
            {!isWireEmpty && isWireLow && wirePercentage !== null && (
              <div className={styles.lcdAlert} role="alert">
                <span className={styles.lcdAlertIcon}>⚠️</span>
                <div className={styles.lcdAlertContent}>
                  <span className={styles.lcdAlertTitle}>LOW WIRE REMAINING</span>
                  <span className={styles.lcdAlertMessage}>
                    {wirePercentage.toFixed(1)}% REMAINING - REPLACE SOON
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {footer ? <div className={styles.lcdFooter}>{footer}</div> : null}
      </div>
    </div>
  )
}

