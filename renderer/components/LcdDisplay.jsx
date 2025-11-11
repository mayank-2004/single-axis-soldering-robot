import React from 'react'
import styles from './LcdDisplay.module.css'

const fallbackReadings = [
  { label: 'X Axis', value: '120.00 → 132.50', unit: 'mm' },
  { label: 'Y Axis', value: '045.30 → 048.10', unit: 'mm' },
  { label: 'Z Axis', value: '003.20 → 000.00', unit: 'mm' },
  { label: 'Wire Remaining', value: '100', unit: '%', length: '14.3 m' },
  { label: 'Flux Remaining', value: '82', unit: '%' },
  { label: 'Tip Temp', value: '345', unit: '°C' },
  { label: 'Feed Rate', value: '12.0', unit: 'mm/s' },
  { label: 'Speed', value: '210', unit: 'mm/s' },
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
                {axisReadings.map(({ label, value, unit }) => (
                  <div className={styles.axisItem} key={label}>
                    <span className={styles.axisLabel}>{label}</span>
                    <span className={styles.axisValue}>
                      {value}
                      {unit ? <span className={styles.axisUnit}>{unit}</span> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {otherReadings.map(({ label, value, unit }) => (
              <div className={styles.lcdRow} key={label}>
                <span className={styles.lcdLabel}>{label}</span>
                <span className={styles.lcdValue}>
                  <span>{value}</span>
                  {unit ? <span className={styles.lcdUnit}>{unit}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>

        {footer ? <div className={styles.lcdFooter}>{footer}</div> : null}
      </div>
    </div>
  )
}

