import React, { useMemo, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import styles from './LcdDisplay.module.css'

const fallbackReadings = [
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
  onSettingsClick,
}) {
  const axisReadings = useMemo(
    () => readings.filter(({ label }) => label?.includes('Axis')),
    [readings]
  )

  const otherReadings = useMemo(
    () => readings.filter(({ label }) => !label?.includes('Axis')),
    [readings]
  )

  // Check if wire remaining is low (<= 10%) - synced with SpoolWireControl
  const wireRemainingReading = useMemo(
    () => otherReadings.find(({ label }) => label === 'Wire Remaining'),
    [otherReadings]
  )

  const wirePercentage = useMemo(() => {
    if (!wireRemainingReading || !wireRemainingReading.value) return null
    const numeric = typeof wireRemainingReading.value === 'number'
      ? wireRemainingReading.value
      : parseFloat(String(wireRemainingReading.value).replace(/[^0-9.]/g, ''))
    return Number.isFinite(numeric) ? numeric : null
  }, [wireRemainingReading])

  const isWireLow = wirePercentage !== null && wirePercentage <= 10
  const isWireEmpty = wirePercentage !== null && wirePercentage <= 0

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { theme, toggleTheme, isLight } = useTheme()

  const handleSettingsClick = () => {
    setIsSettingsOpen(!isSettingsOpen)
    if (onSettingsClick) {
      onSettingsClick()
    }
  }

  return (
    <div className={styles.lcdWrapper} role="group" aria-label="Robot calibration display">
      <p className={styles.subtitle}>
        Track axis calibration, solder flow, and thermal data from the virtual LCD
        that mirrors your hardware display.
      </p>
      <div className={styles.lcdBezel}>
        <div className={styles.lcdHeader}>
          <div className={styles.lcdHeaderInfo}>
            <span className={styles.lcdTitle}>{title}</span>
            <span className={styles.lcdSubtitle}>{subtitle}</span>
          </div>
          <div className={styles.lcdHeaderActionsContainer}>
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
            <button
              type="button"
              className={styles.lcdSettingsButton}
              onClick={handleSettingsClick}
              aria-label="Settings"
              title="Settings"
              aria-expanded={isSettingsOpen}
            >
              <span className={styles.lcdSettingsIcon}>⚙️</span>
            </button>
          </div>
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
          </div>
        </div>

        {footer ? <div className={styles.lcdFooter}>{footer}</div> : null}
      </div>

      {/* Settings Panel - Slides from right */}
      <div
        className={`${styles.lcdSettingsPanel} ${isSettingsOpen ? styles.lcdSettingsPanelOpen : ''}`}
        role="dialog"
        aria-label="Settings panel"
        aria-hidden={!isSettingsOpen}
      >
        <div className={styles.lcdSettingsPanelHeader}>
          <h3 className={styles.lcdSettingsPanelTitle}>Settings</h3>
          <button
            type="button"
            className={styles.lcdSettingsPanelClose}
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>
        {/* <div className={styles.lcdSettingsPanelContent}>
          <div className={styles.lcdSettingsItem}>
            <div className={styles.lcdSettingsItemHeader}>
              <label className={styles.lcdSettingsLabel} htmlFor="theme-toggle">
                Theme
              </label>
              <span className={styles.lcdSettingsValue}>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </div>
            <div className={styles.lcdSettingsItemControl}>
              <button
                type="button"
                id="theme-toggle"
                className={`${styles.lcdThemeToggle} ${isLight ? styles.lcdThemeToggleLight : ''}`}
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                aria-pressed={isLight}
              >
                <span className={styles.lcdThemeToggleTrack}>
                  <span className={styles.lcdThemeToggleThumb} />
                </span>
              </button>
            </div>
          </div>
        </div> */}
      </div>
    </div>
  )
}

