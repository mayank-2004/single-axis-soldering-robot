import React from 'react'
import Head from 'next/head'
import LcdDisplay from '../components/LcdDisplay'
import ComponentHeightControl from '../components/ComponentHeightControl'
import TipHeatingControl from '../components/TipHeatingControl'
import WireFeedControl from '../components/WireFeedControl'
import SequenceMonitor from '../components/SequenceMonitor'
import styles from './home.module.css'

const initialCalibration = [
  { label: 'X Axis', value: '120.00 → 132.50', unit: 'mm' },
  { label: 'Y Axis', value: '045.30 → 048.10', unit: 'mm' },
  { label: 'Z Axis', value: '003.20 → 000.00', unit: 'mm' },
  { label: 'Wire Remaining', value: '100', unit: '%', length: '14.3 m' },
  { label: 'Flux Remaining', value: '82', unit: '%' },
  { label: 'Tip Temp', value: '345', unit: '°C' },
  { label: 'Feed Rate', value: '12.0', unit: 'mm/s' },
  { label: 'Speed', value: '210', unit: 'mm/s' },
]

const initialFanState = {
  machine: false,
  tip: false,
}

export default function HomePage() {
  const [calibration, setCalibration] = React.useState(initialCalibration)
  const [localTime, setLocalTime] = React.useState('')
  const [fans, setFans] = React.useState(initialFanState)
  const [componentHeight, setComponentHeight] = React.useState('')
  const [heightStatus, setHeightStatus] = React.useState('')
  const [tipTarget, setTipTarget] = React.useState('345')
  const [isHeaterEnabled, setIsHeaterEnabled] = React.useState(false)
  const [heaterStatus, setHeaterStatus] = React.useState('')
  const [wireFeedLength, setWireFeedLength] = React.useState('5.0')
  const [wireFeedRate, setWireFeedRate] = React.useState('8.0')
  const [wireFeedStatus, setWireFeedStatus] = React.useState('idle')
  const [wireFeedMessage, setWireFeedMessage] = React.useState('')
  const [sequenceState, setSequenceState] = React.useState({
    stage: 'idle',
    lastCompleted: null,
    isActive: false,
  })
  const wireStatus = React.useMemo(
    () => calibration.find((entry) => entry.label === 'Wire Remaining'),
    [calibration]
  )
  const wirePercentage = React.useMemo(() => {
    if (!wireStatus) return 0
    const numeric = typeof wireStatus.value === 'number' ? wireStatus.value : parseFloat(wireStatus.value)
    return Number.isFinite(numeric) ? numeric : 0
  }, [wireStatus])
  const wireLength = wireStatus?.length
  const isWireLow = wirePercentage <= 10

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) return undefined

    const handleCalibration = (payload) => {
      if (Array.isArray(payload)) {
        setCalibration(payload)
        return
      }

      if (payload && typeof payload === 'object') {
        setCalibration((current) =>
          current.map((entry) => {
            const update = payload[entry.label]
            if (update === undefined || update === null) {
              return entry
            }

            if (typeof update === 'object') {
              return {
                ...entry,
                ...update,
              }
            }

            return {
              ...entry,
              value: update,
            }
          })
        )
      }
    }

    window.ipc.on?.('calibration:update', handleCalibration)

    return () => {
      window.ipc.off?.('calibration:update', handleCalibration)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const updateClock = () => {
      setLocalTime(new Date().toLocaleTimeString())
    }

    updateClock()
    const interval = window?.setInterval(updateClock, 1000)

    return () => {
      if (interval) {
        window.clearInterval(interval)
      }
    }
  }, [])

  React.useEffect(() => {
    if (!isWireLow) {
      return undefined
    }

    if (typeof window === 'undefined' || !window.ipc?.send) {
      return undefined
    }

    window.ipc.send('wire:alert', {
      level: 'critical',
      percentage: wirePercentage,
      length: wireLength,
      timestamp: Date.now(),
    })

    return undefined
  }, [isWireLow, wireLength, wirePercentage])

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const parsePercentageValue = (value) => {
      if (typeof value === 'number') {
        return value
      }

      if (typeof value === 'string') {
        const numeric = parseFloat(value)
        return Number.isFinite(numeric) ? numeric : null
      }

      return null
    }

    const normalizePercentage = (value) =>
      Math.min(100, Math.max(0, value))

    const handleFluxUpdate = (payload) => {
      setCalibration((current) =>
        current.map((entry) => {
          if (entry.label !== 'Flux Remaining') {
            return entry
          }

          const nextEntry = { ...entry }
          const previousNumeric = parsePercentageValue(entry.value)
          const previousRounded =
            previousNumeric === null || Number.isNaN(previousNumeric)
              ? null
              : Math.round(previousNumeric)
          let nextValue
          let nextNumeric = null

          if (typeof payload === 'number') {
            nextValue = payload
            nextNumeric = payload
          } else if (payload && typeof payload === 'object') {
            if (payload.value !== undefined) {
              nextValue = payload.value
            } else if (payload.percentage !== undefined) {
              nextValue = payload.percentage
            } else if (payload.level !== undefined) {
              nextValue = payload.level
            }

            if (nextValue !== undefined) {
              nextNumeric = parsePercentageValue(nextValue)
            }

            if (payload.unit !== undefined) {
              nextEntry.unit = payload.unit
            }

            if (payload.volume !== undefined) {
              nextEntry.volume = payload.volume
            } else if (payload.remainingVolume !== undefined) {
              nextEntry.volume = payload.remainingVolume
            }

            if (payload.message !== undefined) {
              nextEntry.message = payload.message
            }

            if (payload.updatedAt !== undefined) {
              nextEntry.updatedAt = payload.updatedAt
            } else if (payload.timestamp !== undefined) {
              nextEntry.updatedAt = payload.timestamp
            }
          }

          if (nextNumeric !== null && !Number.isNaN(nextNumeric)) {
            const nextRounded = Math.round(normalizePercentage(nextNumeric))
            const drop = previousRounded === null ? null : previousRounded - nextRounded
            const shouldUpdateValue =
              previousRounded === null ||
              nextRounded > previousRounded ||
              (drop !== null && drop >= 1) ||
              payload?.force === true

            if (shouldUpdateValue) {
              nextEntry.value = nextRounded
            }
          } else if (nextValue !== undefined) {
            nextEntry.value = nextValue
          }

          return nextEntry
        })
      )
    }

    window.ipc.on?.('flux:update', handleFluxUpdate)
    window.ipc.send?.('flux:state:request')

    return () => {
      window.ipc.off?.('flux:update', handleFluxUpdate)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return undefined
    }

    const interval = window.setInterval(() => {
      window.ipc.send('flux:state:request', {
        reason: 'auto-refresh',
        timestamp: Date.now(),
      })
    }, 5000)

    return () => {
      window.clearInterval(interval)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const handleHeightAck = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      if (payload.error) {
        setHeightStatus(payload.error)
        return
      }

      if (payload.status) {
        setHeightStatus(payload.status)
      } else {
        setHeightStatus('Height saved')
      }
    }

    const handleTipStatus = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      if (payload.target !== undefined) {
        setTipTarget(String(payload.target))
      }

      if (payload.heater !== undefined) {
        setIsHeaterEnabled(Boolean(payload.heater))
      }

      if (payload.status) {
        setHeaterStatus(payload.status)
      }
    }

    const handleWireFeedStatus = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      if (payload.status) {
        setWireFeedStatus(payload.status)
      }

      if (payload.message) {
        setWireFeedMessage(payload.message)
      }

      if (payload.completedAt) {
        setWireFeedMessage((current) => `${current ? `${current} • ` : ''}Completed ${new Date(payload.completedAt).toLocaleTimeString()}`)
      }
    }

    const handleSequenceUpdate = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      setSequenceState((current) => ({
        stage: payload.stage ?? current.stage,
        lastCompleted: payload.lastCompleted ?? current.lastCompleted,
        isActive: payload.isActive ?? current.isActive,
      }))
    }

    window.ipc.on?.('component:height:ack', handleHeightAck)
    window.ipc.on?.('tip:status', handleTipStatus)
    window.ipc.on?.('wire:feed:status', handleWireFeedStatus)
    window.ipc.on?.('sequence:update', handleSequenceUpdate)

    window.ipc.send?.('tip:status:request')
    window.ipc.send?.('wire:feed:status:request')
    window.ipc.send?.('sequence:status:request')

    return () => {
      window.ipc.off?.('component:height:ack', handleHeightAck)
      window.ipc.off?.('tip:status', handleTipStatus)
      window.ipc.off?.('wire:feed:status', handleWireFeedStatus)
      window.ipc.off?.('sequence:update', handleSequenceUpdate)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const handleFanState = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      setFans((current) => ({
        machine:
          typeof payload.machine === 'boolean' ? payload.machine : current.machine,
        tip: typeof payload.tip === 'boolean' ? payload.tip : current.tip,
      }))
    }

    window.ipc.on?.('fan:update', handleFanState)
    window.ipc.send?.('fan:state:request')

    return () => {
      window.ipc.off?.('fan:update', handleFanState)
    }
  }, [])

  const handleHeightChange = React.useCallback((event) => {
    setComponentHeight(event.target.value)
  }, [])

  const handleHeightSubmit = React.useCallback(() => {
    const rawValue = componentHeight.trim()
    if (!rawValue) {
      setHeightStatus('Enter a component height first.')
      return
    }

    const numeric = Number.parseFloat(rawValue)
    if (!Number.isFinite(numeric) || numeric < 0) {
      setHeightStatus('Height must be a positive number.')
      return
    }

    if (typeof window === 'undefined' || !window.ipc?.send) {
      setHeightStatus('IPC unavailable; cannot send height.')
      return
    }

    setHeightStatus('Saving height...')
    window.ipc.send('component:height:set', {
      height: numeric,
      unit: 'mm',
      timestamp: Date.now(),
    })
  }, [componentHeight])

  const handleTipTargetChange = React.useCallback((event) => {
    setTipTarget(event.target.value)
  }, [])

  const handleApplyTipTarget = React.useCallback(() => {
    const rawValue = tipTarget.trim()
    if (!rawValue) {
      setHeaterStatus('Enter a target temperature first.')
      return
    }

    const numeric = Number.parseFloat(rawValue)
    if (!Number.isFinite(numeric) || numeric < 0) {
      setHeaterStatus('Temperature must be a positive number.')
      return
    }

    if (typeof window === 'undefined' || !window.ipc?.send) {
      setHeaterStatus('IPC unavailable; cannot update target.')
      return
    }

    setHeaterStatus('Updating target temperature...')
    window.ipc.send('tip:target:set', {
      target: numeric,
      unit: '°C',
      timestamp: Date.now(),
    })
  }, [tipTarget])

  const handleToggleHeater = React.useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      setHeaterStatus('IPC unavailable; cannot toggle heater.')
      return
    }

    const nextState = !isHeaterEnabled
    setIsHeaterEnabled(nextState)
    setHeaterStatus(nextState ? 'Heater enabled' : 'Heater disabled')
    window.ipc.send('tip:heater:set', {
      enabled: nextState,
      timestamp: Date.now(),
    })
  }, [isHeaterEnabled])

  const handleWireFeedLengthChange = React.useCallback((event) => {
    setWireFeedLength(event.target.value)
  }, [])

  const handleWireFeedRateChange = React.useCallback((event) => {
    setWireFeedRate(event.target.value)
  }, [])

  const handleWireFeedStart = React.useCallback(() => {
    const lengthNumeric = Number.parseFloat(wireFeedLength)
    if (!Number.isFinite(lengthNumeric) || lengthNumeric <= 0) {
      setWireFeedMessage('Wire length must be greater than zero.')
      return
    }

    const rateNumeric = Number.parseFloat(wireFeedRate)
    if (!Number.isFinite(rateNumeric) || rateNumeric <= 0) {
      setWireFeedMessage('Wire feed rate must be greater than zero.')
      return
    }

    if (typeof window === 'undefined' || !window.ipc?.send) {
      setWireFeedMessage('IPC unavailable; cannot feed wire.')
      return
    }

    setWireFeedStatus('pending')
    setWireFeedMessage('Feeding wire...')
    window.ipc.send('wire:feed:start', {
      length: lengthNumeric,
      rate: rateNumeric,
      unit: 'mm',
      rateUnit: 'mm/s',
      timestamp: Date.now(),
    })
  }, [wireFeedLength, wireFeedRate])

  const toggleFan = React.useCallback((fanKey) => {
    setFans((current) => {
      const nextState = !current[fanKey]
      const updated = {
        ...current,
        [fanKey]: nextState,
      }

      if (typeof window !== 'undefined' && window.ipc?.send) {
        window.ipc.send('fan:control', {
          fan: fanKey,
          state: nextState,
          timestamp: Date.now(),
        })
      }

      return updated
    })
  }, [])

  const isMachineFanOn = fans.machine
  const isTipFanOn = fans.tip
  const fanHeaderActions = React.useMemo(
    () => [
      {
        key: 'machine-fan',
        label: 'Machine Fan',
        isActive: isMachineFanOn,
        onToggle: () => toggleFan('machine'),
      },
      {
        key: 'tip-fan',
        label: 'Tip Fan',
        isActive: isTipFanOn,
        onToggle: () => toggleFan('tip'),
      },
    ],
    [isMachineFanOn, isTipFanOn, toggleFan]
  )
  return (
    <React.Fragment>
      <Head>
        <title>Single Axis Soldering Robot</title>
      </Head>
      <main className={styles.page} role="main">
        <header className={styles.pageHeader}>
          <h1 className={styles.heading}>Single Axis Soldering Robot Console</h1>
          <p className={styles.subtitle}>
            Track axis calibration, solder flow, and thermal data from the virtual LCD
            that mirrors your hardware display.
          </p>
        </header>

        <ComponentHeightControl
          value={componentHeight}
          onChange={handleHeightChange}
          onSubmit={handleHeightSubmit}
          statusMessage={heightStatus}
        />

        <section className={styles.solderingControls} aria-label="Soldering iron controls">
          <TipHeatingControl
            tipTarget={tipTarget}
            onTipTargetChange={handleTipTargetChange}
            onApplyTipTarget={handleApplyTipTarget}
            isHeaterEnabled={isHeaterEnabled}
            onToggleHeater={handleToggleHeater}
            heaterStatus={heaterStatus}
            currentTemperature={calibration.find((entry) => entry.label === 'Tip Temp')?.value}
          />

          <WireFeedControl
            length={wireFeedLength}
            rate={wireFeedRate}
            status={wireFeedStatus}
            message={wireFeedMessage}
            onLengthChange={handleWireFeedLengthChange}
            onRateChange={handleWireFeedRateChange}
            onStart={handleWireFeedStart}
          />

          <SequenceMonitor sequenceState={sequenceState} />
        </section>


        {isWireLow ? (
          <div className={styles.wireAlert} role="alert">
            <span className={styles.wireAlertDot} aria-hidden />
            <span>
              Wire remaining is critically low at {wirePercentage.toFixed(1)}%. Replace the spool soon.
            </span>
            {wireLength ? <span className={styles.wireAlertLength}>Remaining length: {wireLength}</span> : null}
          </div>
        ) : null}

        <section className={styles.lcdSection} aria-label="Robot calibration panel">
          <LcdDisplay
            readings={calibration}
            headerActions={fanHeaderActions}
            footer={
              <React.Fragment>
                <span>Mode: Calibration</span>
                <span>{localTime || '--:--:--'}</span>
              </React.Fragment>
            }
          />
        </section>
      </main>
    </React.Fragment>
  )
}
