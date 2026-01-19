import React from 'react'
import styles from './SpoolWireControl.module.css'

export default function SpoolWireControl({
  spoolState,
  onSpoolConfigChange,
  onSpoolConfigSubmit,
  onResetSpool,
  onTareSpool,
  statusMessage,
}) {
  const {
    wireDiameter,
    remainingPercentage,
    remainingLength,
    isFeeding,
    netWeight,
    initialWeight,
    isTared,
    lastCycleWireLengthUsed,
    currentFeedRate,
  } = spoolState || {}

  const [localWireDiameter, setLocalWireDiameter] = React.useState(wireDiameter?.toString() || '0.7')

  React.useEffect(() => {
    if (wireDiameter !== undefined) setLocalWireDiameter(wireDiameter.toString())
  }, [wireDiameter])

  const handleWireDiameterChange = (e) => {
    setLocalWireDiameter(e.target.value)
  }

  const handleSubmit = () => {
    const config = {}
    if (localWireDiameter) config.wireDiameter = localWireDiameter
    onSpoolConfigSubmit(config)
  }

  // Check if wire remaining is low (<= 10%)
  const isWireLow = remainingPercentage !== undefined && remainingPercentage <= 10
  // Check if wire is completely used (empty spool)
  const isWireEmpty = remainingPercentage !== undefined && remainingPercentage <= 0

  return (
    <article className={styles.controlCard} aria-label="Spool wire control">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Spool Wire</h2>
        <span className={styles.controlSubtitle}>Track wire weight and remaining wire</span>
      </header>
      <div className={styles.controlBody}>
        {/* Input field commented out - value received from Arduino */}
        {/* <div className={styles.controlRow}>
          <label htmlFor="spool-wire-diameter" className={styles.controlLabel}>
            Wire Diameter
          </label>
          <div className={styles.controlFieldGroup}>
            <input
              id="spool-wire-diameter"
              name="spool-wire-diameter"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className={styles.controlInput}
              value={localWireDiameter}
              onChange={handleWireDiameterChange}
              placeholder="0.7"
            />
            <span className={styles.controlUnit}>mm</span>
            <button type="button" className={styles.controlButton} onClick={handleSubmit}>
              Update
            </button>
          </div>
        </div> */}

        {/* Display only - value received from Arduino */}
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Wire Diameter</span>
          <span className={styles.statusValue}>{wireDiameter ?? '--'} mm</span>
        </div>

        <div className={styles.divider} />

        <div className={styles.statusSection}>
          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>Wire Remaining</span>
            <div className={styles.statusValueGroup}>
              <span
                className={styles.statusValue}
                style={
                  isWireEmpty
                    ? { color: '#ef4444', fontWeight: 700 }
                    : isWireLow
                      ? { color: '#fca5a5', fontWeight: 700 }
                      : undefined
                }
              >
                {remainingPercentage?.toFixed(1) ?? '--'}%
              </span>
              <span
                className={styles.statusSubValue}
                style={
                  isWireEmpty
                    ? { color: '#ef4444' }
                    : isWireLow
                      ? { color: '#f87171' }
                      : undefined
                }
              >
                {remainingLength !== undefined ? `${(remainingLength / 1000).toFixed(2)} m` : '--'}
              </span>
            </div>
          </div>

          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{
                width: `${Math.max(0, Math.min(100, remainingPercentage ?? 0))}%`,
                background: isWireEmpty
                  ? 'linear-gradient(90deg, rgba(220, 38, 38, 0.95), rgba(185, 28, 28, 1))'
                  : isWireLow
                    ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.9), rgba(220, 38, 38, 0.95))'
                    : undefined,
                boxShadow: isWireEmpty
                  ? '0 0 12px rgba(220, 38, 38, 0.8)'
                  : isWireLow
                    ? '0 0 8px rgba(239, 68, 68, 0.6)'
                    : undefined,
              }}
            />
          </div>

          <div className={styles.divider} />

          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>Feed Rate</span>
            <div className={styles.statusValueGroup}>
              <span className={styles.statusValue}>
                {currentFeedRate !== undefined ? `${currentFeedRate.toFixed(1)}` : '--'} mm/s
              </span>
            </div>
          </div>

          <div className={styles.divider} />



          {isTared && initialWeight > 0 && (
            <>
              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>Initial Wire Weight</span>
                <span className={styles.statusValue} style={{ color: '#94a3b8' }}>
                  {initialWeight !== undefined ? `${initialWeight.toFixed(2)}` : '0.00'} g
                </span>
              </div>
              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>Weight Used</span>
                <span className={styles.statusValue} style={{ color: '#ef4444' }}>
                  {netWeight !== undefined && initialWeight !== undefined
                    ? `${Math.max(0, Math.min(initialWeight, (initialWeight - netWeight).toFixed(2)))}`
                    : '0.00'} g
                </span>
              </div>

            </>
          )}

          <div className={styles.statusRow}>
            <span className={styles.statusLabel}>Wire Weight (Remaining)</span>
            <div className={styles.statusValueGroup}>
              <span className={styles.statusValue}>
                {netWeight !== undefined ? `${Math.max(0, netWeight).toFixed(2)}` : '--'} g
              </span>
              {initialWeight > 0 && netWeight !== undefined && (
                <span className={styles.statusSubValue} style={{ color: '#6b7280', fontSize: '0.9em' }}>
                  ({((netWeight / initialWeight) * 100).toFixed(1)}% of {initialWeight.toFixed(2)}g)
                </span>
              )}
              {isTared ? (
                <span className={styles.statusSubValue} style={{ color: '#10b981' }}>
                  Tared (zeroed)
                </span>
              ) : (
                <span className={styles.statusSubValue} style={{ color: '#f59e0b' }}>
                  Not tared - Tare when spool has machine parts but no wire
                </span>
              )}
            </div>
          </div>

          {lastCycleWireLengthUsed !== undefined && lastCycleWireLengthUsed > 0 && (
            <>
              <div className={styles.divider} />
              <div className={styles.statusRow}>
                <span className={styles.statusLabel}>Wire Used (Last Cycle)</span>
                <div className={styles.statusValueGroup}>
                  <span className={styles.statusValue} style={{ color: '#f59e0b' }}>
                    {lastCycleWireLengthUsed.toFixed(2)} mm
                  </span>
                  <span className={styles.statusSubValue} style={{ color: '#f59e0b' }}>
                    ({(lastCycleWireLengthUsed / 1000).toFixed(3)} m)
                  </span>
                </div>
              </div>
            </>
          )}

          {isFeeding && (
            <div className={styles.feedingIndicator}>
              <span className={styles.feedingDot} />
              <span>Feeding wire...</span>
            </div>
          )}

          {/* Empty spool alert - highest priority */}
          {isWireEmpty && remainingPercentage !== undefined && (
            <>
              <div className={styles.divider} />
              <div className={styles.emptyWireAlert} role="alert">
                <span className={styles.emptyWireAlertIcon}>🔴</span>
                <div className={styles.emptyWireAlertContent}>
                  <span className={styles.emptyWireAlertTitle}>Spool Empty</span>
                  <span className={styles.emptyWireAlertMessage}>
                    Wire is completely used. Please refill the spool with new wire.
                  </span>
                </div>
              </div>
            </>
          )}

          {/* Low wire remaining alert - show only if not empty */}
          {!isWireEmpty && isWireLow && remainingPercentage !== undefined && (
            <>
              <div className={styles.divider} />
              <div className={styles.lowWireAlert} role="alert">
                <span className={styles.lowWireAlertIcon}>⚠️</span>
                <div className={styles.lowWireAlertContent}>
                  <span className={styles.lowWireAlertTitle}>Low Wire Remaining</span>
                  <span className={styles.lowWireAlertMessage}>
                    Wire remaining is critically low at {remainingPercentage.toFixed(1)}%. Replace the spool soon.
                  </span>
                  {remainingLength !== undefined && (
                    <span className={styles.lowWireAlertLength}>
                      Remaining: {(remainingLength / 1000).toFixed(2)} m
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.controlRow} style={{ gap: '10px' }}>
          <button
            type="button"
            className={styles.tareButton}
            onClick={onTareSpool}
            disabled={isFeeding}
            title="Zero the weight when spool has machine parts attached but NO wire - excludes machine parts weight"
          >
            {isTared ? 'Re-Tare' : 'Tare Weight (Machine Parts Only)'}
          </button>
          <button
            type="button"
            className={styles.resetButton}
            onClick={onResetSpool}
            disabled={isFeeding}
          >
            Reset Spool
          </button>
        </div>
      </div>
      {statusMessage ? <p className={styles.controlStatus}>{statusMessage}</p> : null}
      <p className={styles.infoText}>
        Configure wire diameter for weight calculations. <strong>Workflow:</strong> 1) Attach machine parts to spool (no wire yet), 2) Click "Tare Weight" to zero out machine parts weight, 3) Load solder wire onto spool - display shows wire weight, 4) After soldering, view "Weight Used" and "Wire Weight (Remaining)". The system automatically tracks wire usage and weight during feeding operations.
      </p>
    </article>
  )
}

