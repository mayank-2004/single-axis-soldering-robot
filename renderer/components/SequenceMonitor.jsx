import React, { useState, useEffect, useCallback } from 'react'
import styles from './SequenceMonitor.module.css'

export default function SequenceMonitor({ 
  sequenceState,
  onStart,
  onStop,
  onPause,
  onResume,
  padPositions = [],
  isConnected,
  hasSavedMovement = false,
}) {
  const { 
    stage, 
    isActive, 
    isPaused,
    lastCompleted, 
    currentPad,
    totalPads,
    progress,
    error,
    currentPass,
    maxPasses,
  } = sequenceState || {}

  // Configuration state
  const [showConfig, setShowConfig] = useState(false)
  const [preHeatDwellTime, setPreHeatDwellTime] = useState(500)
  const [coolingTime, setCoolingTime] = useState(1000)
  const [fluxBeforePreHeat, setFluxBeforePreHeat] = useState(true)
  const [enableMultiplePasses, setEnableMultiplePasses] = useState(true)
  const [largePadThreshold, setLargePadThreshold] = useState(10.0)
  const [passesPerLargePad, setPassesPerLargePad] = useState(2)
  const [configStatusMessage, setConfigStatusMessage] = useState('')
  const [isConfigLoading, setIsConfigLoading] = useState(false)

  // Load current configuration on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) return

    const loadConfig = () => {
      window.ipc.send?.('sequence:preheat-dwell:request')
      window.ipc.send?.('sequence:cooling:request')
      window.ipc.send?.('sequence:flux-timing:request')
      window.ipc.send?.('sequence:multiple-passes:request')
      window.ipc.send?.('sequence:large-pad-threshold:request')
      window.ipc.send?.('sequence:passes-per-large-pad:request')
    }

    loadConfig()

    const handlePreHeatStatus = (payload) => {
      if (payload?.timeMs !== undefined) setPreHeatDwellTime(payload.timeMs)
    }
    const handleCoolingStatus = (payload) => {
      if (payload?.timeMs !== undefined) setCoolingTime(payload.timeMs)
    }
    const handleFluxTimingStatus = (payload) => {
      if (payload?.enabled !== undefined) setFluxBeforePreHeat(payload.enabled)
    }
    const handleMultiplePassesStatus = (payload) => {
      if (payload?.enabled !== undefined) setEnableMultiplePasses(payload.enabled)
    }
    const handleThresholdStatus = (payload) => {
      if (payload?.thresholdMm2 !== undefined) setLargePadThreshold(payload.thresholdMm2)
    }
    const handlePassesStatus = (payload) => {
      if (payload?.passes !== undefined) setPassesPerLargePad(payload.passes)
    }

    window.ipc.on?.('sequence:preheat-dwell:status', handlePreHeatStatus)
    window.ipc.on?.('sequence:cooling:status', handleCoolingStatus)
    window.ipc.on?.('sequence:flux-timing:status', handleFluxTimingStatus)
    window.ipc.on?.('sequence:multiple-passes:status', handleMultiplePassesStatus)
    window.ipc.on?.('sequence:large-pad-threshold:status', handleThresholdStatus)
    window.ipc.on?.('sequence:passes-per-large-pad:status', handlePassesStatus)

    return () => {
      window.ipc.off?.('sequence:preheat-dwell:status', handlePreHeatStatus)
      window.ipc.off?.('sequence:cooling:status', handleCoolingStatus)
      window.ipc.off?.('sequence:flux-timing:status', handleFluxTimingStatus)
      window.ipc.off?.('sequence:multiple-passes:status', handleMultiplePassesStatus)
      window.ipc.off?.('sequence:large-pad-threshold:status', handleThresholdStatus)
      window.ipc.off?.('sequence:passes-per-large-pad:status', handlePassesStatus)
    }
  }, [])

  const handleStart = React.useCallback(() => {
    if (onStart) {
      onStart(padPositions)
    }
  }, [onStart, padPositions])

  const handleStop = React.useCallback(() => {
    if (onStop) {
      onStop()
    }
  }, [onStop])

  const handlePause = React.useCallback(() => {
    if (onPause) {
      onPause()
    }
  }, [onPause])

  const handleResume = React.useCallback(() => {
    if (onResume) {
      onResume()
    }
  }, [onResume])

  const handleApplyConfig = useCallback(() => {
    if (!isConnected || typeof window === 'undefined' || !window.ipc?.send) {
      setConfigStatusMessage('Error: Not connected to hardware')
      return
    }

    setIsConfigLoading(true)
    setConfigStatusMessage('Applying configuration...')

    let completed = 0
    const total = 6
    const handleAck = () => {
      completed++
      if (completed === total) {
        setIsConfigLoading(false)
        setConfigStatusMessage('Configuration applied successfully')
        setTimeout(() => setConfigStatusMessage(''), 3000)
      }
    }

    window.ipc.once('sequence:preheat-dwell:ack', handleAck)
    window.ipc.once('sequence:cooling:ack', handleAck)
    window.ipc.once('sequence:flux-timing:ack', handleAck)
    window.ipc.once('sequence:multiple-passes:ack', handleAck)
    window.ipc.once('sequence:large-pad-threshold:ack', handleAck)
    window.ipc.once('sequence:passes-per-large-pad:ack', handleAck)

    window.ipc.send('sequence:preheat-dwell:set', { timeMs: preHeatDwellTime })
    window.ipc.send('sequence:cooling:set', { timeMs: coolingTime })
    window.ipc.send('sequence:flux-timing:set', { enabled: fluxBeforePreHeat })
    window.ipc.send('sequence:multiple-passes:set', { enabled: enableMultiplePasses })
    window.ipc.send('sequence:large-pad-threshold:set', { thresholdMm2: largePadThreshold })
    window.ipc.send('sequence:passes-per-large-pad:set', { passes: passesPerLargePad })
  }, [isConnected, preHeatDwellTime, coolingTime, fluxBeforePreHeat, enableMultiplePasses, largePadThreshold, passesPerLargePad])

  return (
    <article className={styles.controlCard} aria-label="Soldering sequence overview">
      <header className={styles.controlHeader}>
        <div className={styles.headerTop}>
          <div>
            <h2 className={styles.controlTitle}>Sequence Monitor</h2>
            <span className={styles.controlSubtitle}>
              {totalPads > 0 ? `${totalPads} pad${totalPads > 1 ? 's' : ''} configured` : hasSavedMovement ? 'Using saved movement position' : 'Control soldering sequence'}
              {maxPasses > 1 && isActive && (
                <span className={styles.passInfo}> • Pass {currentPass + 1}/{maxPasses}</span>
              )}
            </span>
          </div>
          {!isActive && (
            <button
              type="button"
              className={styles.configToggle}
              onClick={() => setShowConfig(!showConfig)}
              aria-expanded={showConfig}
            >
              {showConfig ? 'Hide Config' : 'Show Config'}
            </button>
          )}
        </div>
      </header>

      {/* Collapsible Configuration Section */}
      {showConfig && !isActive && (
        <div className={styles.configSection}>
          <h3 className={styles.configSectionTitle}>Sequence Configuration</h3>
          
          <div className={styles.configGroup}>
            <h4 className={styles.configGroupTitle}>Timing Control</h4>
            
            <div className={styles.configRow}>
              <label className={styles.configLabel}>
                Pre-heat Dwell Time
                <span className={styles.configHint}>Time to wait after lowering Z before dispensing</span>
              </label>
              <div className={styles.configInputGroup}>
                <input
                  type="number"
                  min="0"
                  max="5000"
                  step="100"
                  value={preHeatDwellTime}
                  onChange={(e) => setPreHeatDwellTime(Number(e.target.value))}
                  disabled={!isConnected || isConfigLoading}
                  className={styles.configInput}
                />
                <span className={styles.configUnit}>ms</span>
              </div>
            </div>

            <div className={styles.configRow}>
              <label className={styles.configLabel}>
                Post-solder Cooling Time
                <span className={styles.configHint}>Time to wait after dispensing for solder to solidify</span>
              </label>
              <div className={styles.configInputGroup}>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  step="100"
                  value={coolingTime}
                  onChange={(e) => setCoolingTime(Number(e.target.value))}
                  disabled={!isConnected || isConfigLoading}
                  className={styles.configInput}
                />
                <span className={styles.configUnit}>ms</span>
              </div>
            </div>
          </div>

          <div className={styles.configGroup}>
            <h4 className={styles.configGroupTitle}>Flux Application</h4>
            
            <div className={styles.configRow}>
              <label className={styles.configCheckboxLabel}>
                <input
                  type="checkbox"
                  checked={fluxBeforePreHeat}
                  onChange={(e) => setFluxBeforePreHeat(e.target.checked)}
                  disabled={!isConnected || isConfigLoading}
                  className={styles.configCheckbox}
                />
                <span>Apply flux before pre-heat</span>
                <span className={styles.configHint}>If unchecked, flux is applied immediately after lowering Z</span>
              </label>
            </div>
          </div>

          <div className={styles.configGroup}>
            <h4 className={styles.configGroupTitle}>Multiple Passes</h4>
            
            <div className={styles.configRow}>
              <label className={styles.configCheckboxLabel}>
                <input
                  type="checkbox"
                  checked={enableMultiplePasses}
                  onChange={(e) => setEnableMultiplePasses(e.target.checked)}
                  disabled={!isConnected || isConfigLoading}
                  className={styles.configCheckbox}
                />
                <span>Enable multiple passes for large pads</span>
              </label>
            </div>

            {enableMultiplePasses && (
              <>
                <div className={styles.configRow}>
                  <label className={styles.configLabel}>
                    Large Pad Threshold
                    <span className={styles.configHint}>Pad area (mm²) above which multiple passes are used</span>
                  </label>
                  <div className={styles.configInputGroup}>
                    <input
                      type="number"
                      min="1.0"
                      max="100.0"
                      step="0.5"
                      value={largePadThreshold}
                      onChange={(e) => setLargePadThreshold(Number(e.target.value))}
                      disabled={!isConnected || isConfigLoading}
                      className={styles.configInput}
                    />
                    <span className={styles.configUnit}>mm²</span>
                  </div>
                </div>

                <div className={styles.configRow}>
                  <label className={styles.configLabel}>
                    Passes per Large Pad
                    <span className={styles.configHint}>Number of dispense/clean cycles for large pads</span>
                  </label>
                  <div className={styles.configInputGroup}>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      step="1"
                      value={passesPerLargePad}
                      onChange={(e) => setPassesPerLargePad(Number(e.target.value))}
                      disabled={!isConnected || isConfigLoading}
                      className={styles.configInput}
                    />
                    <span className={styles.configUnit}>passes</span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={styles.configActions}>
            <button
              type="button"
              onClick={handleApplyConfig}
              disabled={!isConnected || isConfigLoading}
              className={styles.configApplyButton}
            >
              {isConfigLoading ? 'Applying...' : 'Apply Configuration'}
            </button>
          </div>

          {configStatusMessage && (
            <div className={styles.configStatusMessage}>{configStatusMessage}</div>
          )}
        </div>
      )}

      {error && (
        <div className={styles.errorMessage} role="alert">
          <span className={styles.errorIcon}>⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className={styles.sequenceGrid}>
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Current stage</span>
          <span className={styles.sequenceValue}>{stage ?? 'idle'}</span>
        </div>
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Status</span>
          <span className={styles.sequenceValue}>
            {isPaused ? 'Paused' : isActive ? 'Running' : 'Idle'}
          </span>
        </div>
        {totalPads > 0 && (
          <div className={styles.sequenceItem}>
            <span className={styles.sequenceLabel}>Progress</span>
            <span className={styles.sequenceValue}>
              Pad {currentPad + 1} of {totalPads} ({progress}%)
            </span>
          </div>
        )}
        <div className={styles.sequenceItem}>
          <span className={styles.sequenceLabel}>Last completed</span>
          <span className={styles.sequenceValue}>{lastCompleted ?? '--'}</span>
        </div>
      </div>

      {totalPads > 0 && progress > 0 && (
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      <div className={styles.sequenceActions}>
        {!isActive ? (
          <button
            type="button"
            className={styles.startButton}
            onClick={handleStart}
            disabled={padPositions.length === 0 && !hasSavedMovement}
            title={padPositions.length === 0 && !hasSavedMovement 
              ? 'Please save a movement position or configure pad positions' 
              : hasSavedMovement 
                ? 'Start sequence using saved movement position' 
                : 'Start sequence'}
          >
            Start Sequence
          </button>
        ) : (
          <>
            {isPaused ? (
              <button
                type="button"
                className={styles.resumeButton}
                onClick={handleResume}
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                className={styles.pauseButton}
                onClick={handlePause}
              >
                Pause
              </button>
            )}
            <button
              type="button"
              className={styles.stopButton}
              onClick={handleStop}
            >
              Stop
            </button>
          </>
        )}
      </div>
    </article>
  )
}
