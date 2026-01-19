import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import Head from 'next/head'
import LcdDisplay from '../components/LcdDisplay'
// import ComponentHeightControl from '../components/ComponentHeightControl'
import TipHeatingControl from '../components/TipHeatingControl'
import WireFeedControl from '../components/WireFeedControl'
import SpoolWireControl from '../components/SpoolWireControl'
import FumeExtractorControl from '../components/FumeExtractorControl'
import FluxMistControl from '../components/FluxMistControl'
import AirControl from '../components/AirControl'
import SequenceMonitor from '../components/SequenceMonitor'
import ManualMovementControl from '../components/ManualMovementControl'
import PadSolderingMetrics from '../components/PadSolderingMetrics'
import SerialPortConnection from '../components/SerialPortConnection'
import JigCalibration from '../components/JigCalibration'
// import GCodeMonitor from '../components/GCodeMonitor'
import CameraView from '../components/CameraView'
import ThemeToggle from '../components/ThemeToggle'
import EmergencyStopControl from '../components/EmergencyStopControl'
import PIDTuningControl from '../components/PIDTuningControl'
import styles from './home.module.css'

const initialCalibration = [
  { label: 'Z Axis', value: '000.00 → 000.00', unit: 'mm', icon: '↕' },
  { label: 'Wire Remaining', value: '100', unit: '%', length: '14.3 m', icon: '⚡' },
  { label: 'Flux Remaining', value: '82', unit: '%', icon: '💧' },
  { label: 'Tip Temp', value: '290', unit: '°C', icon: '🌡️' },
  { label: 'Feed Rate', value: '8.0', unit: 'mm/s', icon: '⏩' },
  { label: 'Speed', value: '210', unit: 'mm/s', icon: '⚡' },
  { label: 'Compensated Duration', value: '--', unit: 'ms', icon: '⏱️' },
]

const initialFanState = {
  machine: false,
  tip: false,
}

const initialFumeExtractorState = {
  enabled: false,
  speed: 80,
  autoMode: true,
}

const initialFluxMistState = {
  isDispensing: false,
  duration: 500,
  flowRate: 50,
  autoMode: true,
  lastDispensed: null,
}

const initialAirBreezeState = {
  enabled: false,
  isActive: false,
  duration: 2000,
  intensity: 60,
  autoMode: true,
  lastActivated: null,
}

const initialAirJetPressureState = {
  enabled: false,
  isActive: false,
  duration: 200,
  pressure: 80,
  autoMode: true,
  lastActivated: null,
}

export default function HomePage() {
  const [calibration, setCalibration] = useState(initialCalibration)
  const [localTime, setLocalTime] = useState('')
  const [fans, setFans] = useState(initialFanState)
  const [fumeExtractor, setFumeExtractor] = useState(initialFumeExtractorState)
  const [fumeExtractorStatusMessage, setFumeExtractorStatusMessage] = useState('')
  const [fluxMist, setFluxMist] = useState(initialFluxMistState)
  const [fluxMistStatusMessage, setFluxMistStatusMessage] = useState('')
  const [airBreeze, setAirBreeze] = useState(initialAirBreezeState)
  const [airBreezeStatusMessage, setAirBreezeStatusMessage] = useState('')
  const [airJetPressure, setAirJetPressure] = useState(initialAirJetPressureState)
  const [airJetPressureStatusMessage, setAirJetPressureStatusMessage] = useState('')
  const [componentHeight, setComponentHeight] = useState('5')
  const [heightStatus, setHeightStatus] = useState('')
  const [jigHeight, setJigHeight] = useState(null)
  const [jigCalibrationStatus, setJigCalibrationStatus] = useState('')
  const [bedHeight, setBedHeight] = useState(280.0) // Total height from home to bed surface
  const [safeTravelSpace, setSafeTravelSpace] = useState(null) // Calculated safe travel space
  const [tipTarget, setTipTarget] = useState('290')
  const [isHeaterEnabled, setIsHeaterEnabled] = useState(false)
  const [heaterStatus, setHeaterStatus] = useState('')
  const [currentTipTemperature, setCurrentTipTemperature] = useState(null)

  // PID control state
  const [pidEnabled, setPidEnabled] = useState(true)
  const [pidKp, setPidKp] = useState(5.0)
  const [pidKi, setPidKi] = useState(0.1)
  const [pidKd, setPidKd] = useState(1.0)
  const [pidPower, setPidPower] = useState(0)
  const [pidOutput, setPidOutput] = useState(0)

  const [wireDiameter, setWireDiameter] = useState('0.7')
  const [wireFeedStatus, setWireFeedStatus] = useState('idle')
  const [wireFeedMessage, setWireFeedMessage] = useState('')
  const [wireBreak, setWireBreak] = useState({
    detected: false,
    timestamp: null,
    message: null,
  })
  const [spoolState, setSpoolState] = useState({
    spoolDiameter: 50.0,
    wireDiameter: 0.7,
    initialWireLength: 10000.0,
    currentWireLength: 10000.0,
    remainingPercentage: 100,
    remainingLength: 10000.0,
    totalRotations: 0,
    currentRotation: 0,
    effectiveDiameter: 50.0,
    isFeeding: false,
    lastFeedLength: 0,
    lastUpdated: Date.now(),
    // Weight tracking
    netWeight: 0.0,
    currentWeight: 0.0,
    initialWeight: 0.0,
    tareWeight: 0.0,
    isTared: false,
    solderDensity: 8.5,
  })
  const [spoolStatusMessage, setSpoolStatusMessage] = useState('')
  const [manualMovementStatus, setManualMovementStatus] = useState('')

  // Calculate volume per 1mm using cylinder volume formula: V = π × r² × h
  // where r = diameter/2, h = 1mm
  const volumePerMm = useMemo(() => {
    const diameterNumeric = Number.parseFloat(wireDiameter)
    if (!Number.isFinite(diameterNumeric) || diameterNumeric <= 0) {
      return null
    }
    const radius = diameterNumeric / 2 // radius in mm
    const height = 1 // 1mm length
    const volume = Math.PI * radius * radius * height // volume in mm³
    return volume
  }, [wireDiameter])

  // Emergency stop state
  const [emergencyStopActive, setEmergencyStopActive] = useState(false)

  const [sequenceState, setSequenceState] = useState({
    stage: 'idle',
    lastCompleted: null,
    isActive: false,
    isPaused: false,
    currentPad: 0,
    totalPads: 0,
    progress: 0,
    error: null,
    currentPass: 0,
    maxPasses: 1,
  })
  const [currentPosition, setCurrentPosition] = useState({
    x: 120.0,
    y: 45.3,
    z: 0.0, // Start at home position (0.00mm) - FIXED
    isMoving: false,
    savedMovementDistance: 0.0,
    hasSavedMovement: false,
  })
  const [limitSwitchAlert, setLimitSwitchAlert] = useState(false)
  // const [limitSwitchMessage, setLimitSwitchMessage] = useState('Upper limit switch reached - can\'t go upward')
  const [stepSize, setStepSize] = useState(1.0)
  const [zAxisSpeed, setZAxisSpeed] = useState(100) // Default speed: 100% (Normal mode for slower movement)
  const [padShape, setPadShape] = useState('')
  const [padDimensions, setPadDimensions] = useState({
    side: '',
    length: '',
    width: '',
    radius: '',
    outerRadius: '',
    innerRadius: '',
  })
  const [solderHeight, setSolderHeight] = useState('')
  const [padArea, setPadArea] = useState(null)
  const [padVolume, setPadVolume] = useState(null)
  const [wireUsed, setWireUsed] = useState(null)
  const [stepsMoved, setStepsMoved] = useState(null)
  const [isCalculatingMetrics, setIsCalculatingMetrics] = useState(false)

  // Thermal mass compensation state
  const [padCategory, setPadCategory] = useState(null) // 'small', 'medium', 'large'
  const [compensatedDuration, setCompensatedDuration] = useState(null) // Duration in milliseconds
  const [thermalMassDuration, setThermalMassDuration] = useState(null) // Applied thermal mass duration (from backend)
  const baseTemperature = 290 // Base temperature in °C (constant)
  const maxTemperature = 350 // Maximum temperature in °C
  const baseDuration = 1000 // Base duration in milliseconds (1 second)

  // Pad configurations storage
  const [savedPadConfigurations, setSavedPadConfigurations] = useState([])

  // Serial port connection state
  const [serialPorts, setSerialPorts] = useState([])
  const [isSerialConnected, setIsSerialConnected] = useState(false)
  const [isSerialConnecting, setIsSerialConnecting] = useState(false)
  const [currentSerialPort, setCurrentSerialPort] = useState(null)
  const [serialConnectionError, setSerialConnectionError] = useState(null)

  // Arduino data reception tracking
  const [isReceivingArduinoData, setIsReceivingArduinoData] = useState(false)
  const [lastArduinoDataTime, setLastArduinoDataTime] = useState(null)
  const [arduinoDataCount, setArduinoDataCount] = useState(0)

  // Navigation state - track which component is currently active
  const [activeComponent, setActiveComponent] = useState('serial-port')
  // Track previous limit switch states to detect rising edges
  const lastUpperLimitRef = useRef(false)
  const lastLowerLimitRef = useRef(false)

  // Load saved configurations from database on startup
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const handleConfigsLoaded = (configs) => {
      setSavedPadConfigurations(configs || [])
    }

    window.ipc.on?.('pad-config:loaded', handleConfigsLoaded)
    window.ipc.send?.('pad-config:load')

    return () => {
      window.ipc.off?.('pad-config:loaded', handleConfigsLoaded)
    }
  }, [])

  // G-CODE COMMAND HISTORY COMMENTED OUT
  // G-code command history
  // const [gcodeCommands, setGcodeCommands] = useState([])
  const wireStatus = useMemo(
    () => calibration.find((entry) => entry.label === 'Wire Remaining'),
    [calibration]
  )

  const wirePercentage = useMemo(() => {
    if (!wireStatus) return 0
    const numeric = typeof wireStatus.value === 'number' ? wireStatus.value : parseFloat(wireStatus.value)
    return Number.isFinite(numeric) ? numeric : 0
  }, [wireStatus])
  const wireLength = wireStatus?.length
  const isWireLow = wirePercentage <= 10
  const isWireEmpty = wirePercentage <= 0

  // Get flux remaining from calibration
  const fluxRemaining = useMemo(() => {
    const fluxEntry = calibration.find((entry) => entry.label === 'Flux Remaining')
    if (!fluxEntry) return null
    const numeric = typeof fluxEntry.value === 'number'
      ? fluxEntry.value
      : parseFloat(String(fluxEntry.value).replace(/[^0-9.]/g, ''))
    return Number.isFinite(numeric) ? numeric : null
  }, [calibration])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) return undefined

    const handleCalibration = (payload) => {
      if (Array.isArray(payload)) {
        setCalibration(payload)
        return
      }

      if (payload && typeof payload === 'object') {
        setCalibration((current) =>
          current.map((entry) => {
            // Don't update Z Axis from calibration:update - it's controlled by currentPosition.z
            if (entry.label === 'Z Axis') {
              return entry
            }

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

  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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

  useEffect(() => {
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

      // DON'T track tip status as Arduino data - only track actual arduino:data:received events

      if (payload.target !== undefined) {
        setTipTarget(String(payload.target))
      }

      if (payload.heater !== undefined) {
        setIsHeaterEnabled(Boolean(payload.heater))
      }

      if (payload.status) {
        setHeaterStatus(payload.status)
      }

      // Update current temperature from tip state (synced with LcdDisplay)
      if (payload.current !== undefined) {
        setCurrentTipTemperature(payload.current)
      }

      // PID control data
      if (payload.pidEnabled !== undefined) {
        setPidEnabled(Boolean(payload.pidEnabled))
      }
      if (payload.pidKp !== undefined) {
        setPidKp(payload.pidKp)
      }
      if (payload.pidKi !== undefined) {
        setPidKi(payload.pidKi)
      }
      if (payload.pidKd !== undefined) {
        setPidKd(payload.pidKd)
      }
      if (payload.pidPower !== undefined) {
        setPidPower(payload.pidPower)
      }
      if (payload.pidOutput !== undefined) {
        setPidOutput(payload.pidOutput)
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

      // Update wire break status
      if (payload.wireBreak) {
        setWireBreak(payload.wireBreak)
      }
    }

    const handleWireBreak = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }
      setWireBreak(payload)
    }

    const handleFanState = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      setFans((current) => ({
        machine: typeof payload.machine === 'boolean' ? payload.machine : current.machine,
        tip: typeof payload.tip === 'boolean' ? payload.tip : current.tip,
      }))
    }

    const handleFumeExtractorState = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      setFumeExtractor((current) => ({
        ...current,
        ...payload,
      }))
    }

    const handleFluxMistState = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      setFluxMist((current) => ({
        ...current,
        ...payload,
      }))
    }

    const handleAirBreezeState = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      setAirBreeze((current) => ({
        ...current,
        ...payload,
      }))
    }

    const handleAirJetPressureState = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      setAirJetPressure((current) => ({
        ...current,
        ...payload,
      }))
    }

    const handleSpoolUpdate = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      // DON'T track spool updates as Arduino data - only track actual arduino:data:received events

      setSpoolState((current) => {
        const nextState = {
          ...current,
          ...payload,
        }

        // Update LCD display 'Wire Remaining' with real-time length in mm
        if (nextState.currentWireLength !== undefined) {
          setCalibration((prev) =>
            prev.map((entry) => {
              if (entry.label === 'Wire Remaining') {
                return {
                  ...entry,
                  value: nextState.currentWireLength.toFixed(1),
                  unit: 'mm',
                  length: `${nextState.remainingPercentage.toFixed(1)}%`, // Show percentage alongside mm
                  percentage: nextState.remainingPercentage // Pass explicit percentage for alerts
                }
              }
              return entry
            })
          )
        }

        return nextState
      })

      // Sync wire diameter to WireFeedControl when spool state updates
      if (payload.wireDiameter !== undefined) {
        setWireDiameter(payload.wireDiameter.toString())
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
        isPaused: payload.isPaused ?? current.isPaused,
        currentPad: payload.currentPad ?? current.currentPad,
        totalPads: payload.totalPads ?? current.totalPads,
        progress: payload.progress ?? current.progress,
        error: payload.error ?? current.error,
        currentPass: payload.currentPass ?? current.currentPass ?? 0,
        maxPasses: payload.maxPasses ?? current.maxPasses ?? 1,
      }))
    }

    const handleSequenceComplete = (payload) => {
      if (payload?.nextPadDuration) {
        setCalibration((prev) =>
          prev.map((entry) =>
            entry.label === 'Compensated Duration'
              ? { ...entry, value: payload.nextPadDuration.toString() }
              : entry
          )
        )
      } else {
        setCalibration((prev) =>
          prev.map((entry) =>
            entry.label === 'Compensated Duration'
              ? { ...entry, value: '--' }
              : entry
          )
        )
      }
    }

    // Listen for ACTUAL Arduino JSON data reception (not simulation/mock data)
    const handleArduinoDataReceived = (payload) => {
      if (isSerialConnected && payload?.timestamp) {
        setIsReceivingArduinoData(true)
        setLastArduinoDataTime(payload.timestamp)
        setArduinoDataCount((prev) => prev + 1)
      }
    }

    window.ipc.on?.('component:height:ack', handleHeightAck)
    window.ipc.on?.('tip:status', handleTipStatus)
    window.ipc.on?.('wire:feed:status', handleWireFeedStatus)
    window.ipc.on?.('wire:break', handleWireBreak)
    window.ipc.on?.('spool:update', handleSpoolUpdate)
    window.ipc.on?.('sequence:update', handleSequenceUpdate)
    window.ipc.on?.('sequence:pad:complete', handleSequenceComplete)
    window.ipc.on?.('fan:update', handleFanState)
    window.ipc.on?.('fumeExtractor:update', handleFumeExtractorState)
    window.ipc.on?.('fluxMist:update', handleFluxMistState)
    window.ipc.on?.('airBreeze:update', handleAirBreezeState)
    window.ipc.on?.('airJetPressure:update', handleAirJetPressureState)

    // Emergency stop handlers
    const handleEmergencyStopUpdate = (payload) => {
      if (payload?.active !== undefined) {
        setEmergencyStopActive(Boolean(payload.active))
      }
    }

    window.ipc.on?.('emergencyStop:update', handleEmergencyStopUpdate)
    window.ipc.on?.('emergencyStop', handleEmergencyStopUpdate)

    // Request E-stop status on mount
    window.ipc.send?.('emergencyStop:status:request')
    window.ipc.on?.('emergencyStop:status:response', handleEmergencyStopUpdate)

    // Listen for actual Arduino JSON data (only this counts as real Arduino data)
    window.ipc.on?.('arduino:data:received', handleArduinoDataReceived)

    // Listen for jig calibration responses
    const handleJigHeightAck = (payload) => {
      console.log('[home.jsx] handleJigHeightAck received:', payload)
      if (!payload || typeof payload !== 'object') {
        console.warn('[home.jsx] handleJigHeightAck: Invalid payload received', payload)
        setJigCalibrationStatus('Error: Invalid response from server')
        return
      }
      console.log('[home.jsx] handleJigHeightAck processing payload:', payload)
      if (payload.error) {
        setJigCalibrationStatus(`Error: ${payload.error}`)
      } else {
        setJigCalibrationStatus(payload.status || 'Jig height set successfully')
        if (payload.jigHeight !== undefined) {
          setJigHeight(payload.jigHeight)
        }
        if (payload.bedHeight !== undefined) {
          setBedHeight(payload.bedHeight)
        }
        if (payload.safeTravelSpace !== undefined && payload.safeTravelSpace !== null) {
          setSafeTravelSpace(payload.safeTravelSpace)
        }
        // Clear status after 3 seconds
        setTimeout(() => {
          setJigCalibrationStatus('')
        }, 3000)
      }
    }

    const handleJigHeightStatus = (payload) => {
      if (!payload || typeof payload !== 'object') {
        console.warn('[home.jsx] handleJigHeightStatus: Invalid payload received', payload)
        return
      }
      if (payload.jigHeight !== null && payload.jigHeight !== undefined) {
        setJigHeight(payload.jigHeight)
      }
      if (payload.bedHeight !== undefined) {
        setBedHeight(payload.bedHeight)
      }
      if (payload.safeTravelSpace !== undefined && payload.safeTravelSpace !== null) {
        setSafeTravelSpace(payload.safeTravelSpace)
      }
    }

    window.ipc.on?.('jig:height:ack', handleJigHeightAck)
    window.ipc.on?.('jig:height:status', handleJigHeightStatus)

    // Listen for speed control responses
    const handleSpeedAck = (payload) => {
      console.log('[home.jsx] handleSpeedAck received:', payload)
      if (!payload || typeof payload !== 'object') {
        console.warn('[home.jsx] handleSpeedAck: Invalid payload received', payload)
        return
      }
      if (payload.error) {
        console.error('[home.jsx] Speed set error:', payload.error)
      } else {
        console.log('[home.jsx] Speed set successfully:', payload.status)
        // Speed is already updated in local state, no need to update again
      }
    }

    const handleSpeedStatus = (payload) => {
      if (!payload || typeof payload !== 'object') {
        console.warn('[home.jsx] handleSpeedStatus: Invalid payload received', payload)
        return
      }
      if (payload.speed !== null && payload.speed !== undefined) {
        setZAxisSpeed(payload.speed)
      }
    }

    window.ipc.on?.('axis:speed:ack', handleSpeedAck)
    window.ipc.on?.('axis:speed:status', handleSpeedStatus)

    // Listen for thermal mass duration responses
    const handleDurationAck = (payload) => {
      console.log('[home.jsx] handleDurationAck received:', payload)
      if (!payload || typeof payload !== 'object') {
        console.warn('[home.jsx] handleDurationAck: Invalid payload received', payload)
        return
      }
      if (payload.error) {
        console.error('[home.jsx] Duration set error:', payload.error)
      } else {
        console.log('[home.jsx] Duration set successfully:', payload.status)
        // Duration is already updated in LCD, no need to update again
      }
    }

    const handleDurationStatus = (payload) => {
      if (!payload || typeof payload !== 'object') {
        console.warn('[home.jsx] handleDurationStatus: Invalid payload received', payload)
        return
      }
      if (payload.duration !== null && payload.duration !== undefined) {
        setThermalMassDuration(payload.duration)
        // Update LCD display - use 'Compensated Duration' instead of 'Thermal Duration'
        setCalibration((prev) =>
          prev.map((entry) =>
            entry.label === 'Compensated Duration'
              ? {
                ...entry,
                value: payload.duration.toString(),
              }
              : entry
          )
        )
      }
    }

    window.ipc.on?.('sequence:duration:ack', handleDurationAck)
    window.ipc.on?.('sequence:duration:status', handleDurationStatus)

    // Listen for limit switch status from Arduino hardware
    // This handler shows warnings when limit switches are triggered during movement
    const handleLimitSwitchUpdate = (payload) => {
      console.log('[home.jsx] handleLimitSwitchUpdate received:', payload)
      if (!payload || typeof payload !== 'object') {
        return
      }

      const upperTriggered = Boolean(payload.upper)
      const lowerTriggered = Boolean(payload.lower)

      console.log('[home.jsx] Limit switch status - Upper:', upperTriggered, 'Lower:', lowerTriggered)

      // Upper Limit Logic
      if (upperTriggered && !lastUpperLimitRef.current) {
        // Rising edge: Trigger alert
        console.log('[home.jsx] Upper limit triggered (Rising Edge)')

        // Clear any existing timeout (legacy cleanup)
        if (window.limitSwitchTimeout) {
          clearTimeout(window.limitSwitchTimeout)
          window.limitSwitchTimeout = null
        }

        setLimitSwitchAlert(true)
        setManualMovementStatus('Upper limit switch reached - can\'t go upward')
      } else if (!upperTriggered && lastUpperLimitRef.current) {
        // Falling edge: Switch released
        console.log('[home.jsx] Upper limit released')
        setLimitSwitchAlert(false)
        setManualMovementStatus('')
      }

      // Lower Limit Logic
      if (lowerTriggered && !lastLowerLimitRef.current) {
        // Rising edge: Trigger alert
        console.log('[home.jsx] Lower limit triggered (Rising Edge)')

        // Clear any existing timeout (legacy cleanup)
        if (window.limitSwitchTimeout) {
          clearTimeout(window.limitSwitchTimeout)
          window.limitSwitchTimeout = null
        }

        setLimitSwitchAlert(true)
        setManualMovementStatus('Lower limit switch reached - can\'t go downward')
      } else if (!lowerTriggered && lastLowerLimitRef.current) {
        // Falling edge: Switch released
        console.log('[home.jsx] Lower limit released')
        setLimitSwitchAlert(false)
        setManualMovementStatus('')
      }

      // Update refs
      lastUpperLimitRef.current = upperTriggered
      lastLowerLimitRef.current = lowerTriggered
    }

    // Register listener BEFORE sending any commands to ensure we catch events
    window.ipc.on?.('limitSwitch:update', handleLimitSwitchUpdate)

    window.ipc.send?.('tip:status:request')
    window.ipc.send?.('wire:feed:status:request')
    window.ipc.send?.('spool:status:request')
    window.ipc.send?.('sequence:status:request')
    window.ipc.send?.('fan:state:request')
    window.ipc.send?.('fumeExtractor:state:request')
    window.ipc.send?.('fluxMist:state:request')
    window.ipc.send?.('airBreeze:state:request')
    window.ipc.send?.('airJetPressure:state:request')
    window.ipc.send?.('jig:height:request')
    window.ipc.send?.('axis:speed:request')

    return () => {
      window.ipc.off?.('component:height:ack', handleHeightAck)
      window.ipc.off?.('component:height:ack', handleHeightAck)
      window.ipc.off?.('tip:status', handleTipStatus)
      window.ipc.off?.('wire:feed:status', handleWireFeedStatus)
      window.ipc.off?.('wire:break', handleWireBreak)
      window.ipc.off?.('spool:update', handleSpoolUpdate)
      window.ipc.off?.('sequence:update', handleSequenceUpdate)
      window.ipc.off?.('sequence:pad:complete', handleSequenceComplete)
      window.ipc.off?.('fan:update', handleFanState)
      window.ipc.off?.('fumeExtractor:update', handleFumeExtractorState)
      window.ipc.off?.('fluxMist:update', handleFluxMistState)
      window.ipc.off?.('airBreeze:update', handleAirBreezeState)
      window.ipc.off?.('airJetPressure:update', handleAirJetPressureState)
      window.ipc.off?.('arduino:data:received', handleArduinoDataReceived)
      window.ipc.off?.('limitSwitch:update', handleLimitSwitchUpdate)
      window.ipc.off?.('jig:height:ack', handleJigHeightAck)
      window.ipc.off?.('jig:height:status', handleJigHeightStatus)
      window.ipc.off?.('axis:speed:ack', handleSpeedAck)
      window.ipc.off?.('axis:speed:status', handleSpeedStatus)
      window.ipc.off?.('sequence:duration:ack', handleDurationAck)
      window.ipc.off?.('sequence:duration:status', handleDurationStatus)
    }
  }, [])


  useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const handlePositionUpdate = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }
      setCurrentPosition((current) => {
        let newZ = typeof payload.z === 'number' && Number.isFinite(payload.z)
          ? payload.z
          : current.z

        // Clamp Z to maximum of 0.00mm (home position)
        if (newZ > 0) {
          newZ = 0.0
        }

        return {
          z: newZ,
          isMoving:
            typeof payload.isMoving === 'boolean'
              ? payload.isMoving
              : current.isMoving,
          savedMovementDistance: typeof payload.savedMovementDistance === 'number'
            ? payload.savedMovementDistance
            : (current.savedMovementDistance || 0.0),
          hasSavedMovement: typeof payload.hasSavedMovement === 'boolean'
            ? payload.hasSavedMovement
            : (current.hasSavedMovement || false),
        }
      })
    }

    // Monitor for data timeout (if no data received for 2 seconds, mark as not receiving)
    const dataTimeoutInterval = setInterval(() => {
      if (isSerialConnected && lastArduinoDataTime && Date.now() - lastArduinoDataTime > 2000) {
        setIsReceivingArduinoData(false)
      }
    }, 1000)

    window.ipc.on?.('position:update', handlePositionUpdate)
    window.ipc.send?.('position:request')

    return () => {
      window.ipc.off?.('position:update', handlePositionUpdate)
      clearInterval(dataTimeoutInterval)
    }
  }, [lastArduinoDataTime, isSerialConnected])

  // Sync Z-axis position from currentPosition to calibration readings (for LcdDisplay)
  useEffect(() => {
    if (currentPosition.z !== null && currentPosition.z !== undefined) {
      setCalibration((current) =>
        current.map((entry) => {
          if (entry.label !== 'Z Axis') {
            return entry
          }

          const formatPosition = (pos) => {
            // Handle negative numbers (for positions below home)
            const isNegative = pos < 0
            const absPos = Math.abs(pos)
            const parts = absPos.toFixed(2).split('.')
            const integer = parts[0].padStart(3, '0')
            const decimal = parts[1] || '00'
            const sign = isNegative ? '-' : ''
            return `${sign}${integer}.${decimal}`
          }

          const HOME_POSITION = 0.0 // Home is at 0.00mm (top limit switch) - FIXED VALUE
          const homeFormatted = formatPosition(HOME_POSITION) // Home is always 0.00mm - never changes
          const currentFormatted = formatPosition(currentPosition.z) // Current position - updates dynamically (can be negative)
          const formattedValue = `${homeFormatted} → ${currentFormatted}`

          return {
            ...entry,
            value: formattedValue,
          }
        })
      )
    }
  }, [currentPosition.z])

  // Listen for actual Arduino data reception separately
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const handleArduinoDataReceived = (payload) => {
      if (isSerialConnected && payload?.timestamp) {
        setIsReceivingArduinoData(true)
        setLastArduinoDataTime(payload.timestamp)
        setArduinoDataCount((prev) => prev + 1)
      }
    }

    window.ipc.on?.('arduino:data:received', handleArduinoDataReceived)

    return () => {
      window.ipc.off?.('arduino:data:received', handleArduinoDataReceived)
    }
  }, [isSerialConnected])

  // Serial port connection handlers
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const handleListPortsResponse = (data) => {
      if (data.ports) {
        setSerialPorts(data.ports)
      }
    }

    const handleConnectResponse = (result) => {
      setIsSerialConnecting(false)
      if (result.error) {
        setSerialConnectionError(result.error)
        setIsSerialConnected(false)
        setCurrentSerialPort(null)
      } else {
        setSerialConnectionError(null)
        setIsSerialConnected(true)
        setCurrentSerialPort(result.path || 'Connected')
        // Reset data tracking on new connection
        setIsReceivingArduinoData(false)
        setArduinoDataCount(0)
        setLastArduinoDataTime(null)

        // Auto-homing: When app starts and connects to Arduino, automatically home the head
        // Wait a bit for Arduino to initialize, then send home command
        // Auto-homing removed for safety - user must explicitly click Home
        // setTimeout(() => {
        //   console.log('[SerialConnection] Auto-homing head on connection...')
        //   if (typeof window !== 'undefined' && window.ipc?.send) {
        //     window.ipc.send('axis:home', {
        //       timestamp: Date.now(),
        //     })
        //   }
        // }, 1500)
      }
    }

    const handleDisconnectResponse = (result) => {
      setIsSerialConnecting(false)
      if (result.error) {
        setSerialConnectionError(result.error)
      } else {
        setSerialConnectionError(null)
        setIsSerialConnected(false)
        setCurrentSerialPort(null)
        // Reset data tracking on disconnect
        setIsReceivingArduinoData(false)
        setArduinoDataCount(0)
        setLastArduinoDataTime(null)
      }
    }

    const handleSerialError = (data) => {
      setSerialConnectionError(`${data.type}: ${data.error}`)
      setIsSerialConnected(false)
      setIsSerialConnecting(false)
    }

    window.ipc.on?.('serial:list-ports:response', handleListPortsResponse)
    window.ipc.on?.('serial:connect:response', handleConnectResponse)
    window.ipc.on?.('serial:disconnect:response', handleDisconnectResponse)
    window.ipc.on?.('serial:error', handleSerialError)

    return () => {
      window.ipc.off?.('serial:list-ports:response', handleListPortsResponse)
      window.ipc.off?.('serial:connect:response', handleConnectResponse)
      window.ipc.off?.('serial:disconnect:response', handleDisconnectResponse)
      window.ipc.off?.('serial:error', handleSerialError)
    }
  }, [])

  // G-CODE COMMAND MONITORING COMMENTED OUT
  // G-code command monitoring
  // useEffect(() => {
  //   if (typeof window === 'undefined' || !window.ipc) {
  //     return undefined
  //   }

  //   const handleGcodeCommand = (data) => {
  //     // Command will be added to history by the history handler
  //   }

  //   const handleGcodeResponse = (data) => {
  //     // Response will be added to history by the history handler
  //   }

  //   const handleGcodeError = (data) => {
  //     // Error will be added to history by the history handler
  //   }

  //   const handleGcodeHistory = (data) => {
  //     if (data.commands) {
  //       setGcodeCommands(data.commands)
  //     }
  //   }

  //   window.ipc.on?.('gcode:command', handleGcodeCommand)
  //   window.ipc.on?.('gcode:response', handleGcodeResponse)
  //   window.ipc.on?.('gcode:error', handleGcodeError)
  //   window.ipc.on?.('gcode:history', handleGcodeHistory)

  //   // Request initial history
  //   window.ipc.send?.('gcode:history:request')

  //   return () => {
  //     window.ipc.off?.('gcode:command', handleGcodeCommand)
  //     window.ipc.off?.('gcode:response', handleGcodeResponse)
  //     window.ipc.off?.('gcode:error', handleGcodeError)
  //     window.ipc.off?.('gcode:history', handleGcodeHistory)
  //   }
  // }, [])

  const handleRefreshPorts = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return Promise.resolve()
    }
    window.ipc.send('serial:list-ports')
    return Promise.resolve()
  }, [])

  const handleSerialConnect = useCallback((config) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }
    setIsSerialConnecting(true)
    setSerialConnectionError(null)
    window.ipc.send('serial:connect', config)
  }, [])

  const handleSerialDisconnect = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }
    setIsSerialConnecting(true)
    setSerialConnectionError(null)
    window.ipc.send('serial:disconnect')
  }, [])

  // Emergency stop reset handler
  const handleEmergencyStopReset = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }
    window.ipc.send('emergencyStop:reset')
  }, [])

  // PID control handlers
  const handlePIDParametersSet = useCallback((kp, ki, kd) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return Promise.reject(new Error('IPC not available'))
    }
    return new Promise((resolve, reject) => {
      window.ipc.send('pid:parameters:set', { kp, ki, kd })
      window.ipc.once('pid:parameters:ack', (payload) => {
        if (payload?.error) {
          reject(new Error(payload.error))
        } else {
          resolve(payload)
        }
      })
      window.ipc.once('pid:parameters:error', (payload) => {
        reject(new Error(payload?.error || 'Failed to set PID parameters'))
      })
      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Timeout waiting for PID parameters response'))
      }, 5000)
    })
  }, [])

  const handlePIDEnabledSet = useCallback((enabled) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return Promise.reject(new Error('IPC not available'))
    }
    return new Promise((resolve, reject) => {
      window.ipc.send('pid:enabled:set', { enabled })
      window.ipc.once('pid:enabled:ack', (payload) => {
        if (payload?.error) {
          reject(new Error(payload.error))
        } else {
          resolve(payload)
        }
      })
      window.ipc.once('pid:enabled:error', (payload) => {
        reject(new Error(payload?.error || 'Failed to set PID enabled'))
      })
      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Timeout waiting for PID enabled response'))
      }, 5000)
    })
  }, [])

  // Sequence control handlers
  const handleSequenceStart = useCallback((padPositions) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }

    // Enhance pad positions with size information for multiple passes
    const enhancedPadPositions = padPositions.map((pos, index) => {
      // If pad position doesn't have area, try to get it from saved configurations
      if (!pos.area && savedPadConfigurations.length > 0) {
        // Try to match by z position or use first config
        const matchingConfig = savedPadConfigurations.find(
          config => Math.abs(config.solderHeight - (pos.z || 0)) < 0.1
        ) || savedPadConfigurations[0]

        if (matchingConfig && matchingConfig.area) {
          return {
            ...pos,
            area: matchingConfig.area,
            // Also include dimensions if available
            width: matchingConfig.dimensions?.width || matchingConfig.dimensions?.side,
            height: matchingConfig.dimensions?.height || matchingConfig.dimensions?.side,
            diameter: matchingConfig.dimensions?.diameter || matchingConfig.dimensions?.radius * 2,
          }
        }
      }

      // If we have padArea from current calculation, use it
      if (!pos.area && padArea) {
        return {
          ...pos,
          area: padArea,
          width: padDimensions.width || padDimensions.side,
          height: padDimensions.height || padDimensions.side,
          diameter: padDimensions.diameter || (padDimensions.radius ? padDimensions.radius * 2 : undefined),
        }
      }

      return pos
    })

    window.ipc.send('sequence:start', {
      padPositions: enhancedPadPositions,
      options: {
        wireLength: wireUsed, // Use calculated wire length from pad metrics
      }
    })
  }, [wireUsed, savedPadConfigurations, padArea, padDimensions])

  const handleSequenceStop = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }
    window.ipc.send('sequence:stop')
  }, [])

  const handleSequencePause = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }
    window.ipc.send('sequence:pause')
  }, [])

  const handleSequenceResume = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }
    window.ipc.send('sequence:resume')
  }, [])

  const handleHeightChange = useCallback((event) => {
    setComponentHeight(event.target.value)
  }, [])

  const handleHeightSubmit = useCallback(() => {
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

  // Jig calibration handlers
  const handleJigHeightChange = useCallback((height) => {
    setJigHeight(height)
    // Safe travel space = bed height - jig height (total safe range from home to jig surface)
    if (height !== null && height !== undefined && height >= 0 && height < bedHeight) {
      setSafeTravelSpace(bedHeight - height) // Safe travel = space from home to jig surface
    } else {
      setSafeTravelSpace(null)
    }
  }, [bedHeight])

  const handleJigCalibrate = useCallback((method) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      setJigCalibrationStatus('IPC unavailable; cannot set jig height.')
      return
    }

    // Only manual method is supported now
    if (method === 'manual') {
      // Manual calibration - set the entered height
      if (jigHeight === null || jigHeight === undefined || jigHeight < 0) {
        setJigCalibrationStatus('Please enter a valid jig height.')
        return
      }
      if (jigHeight > bedHeight) {
        setJigCalibrationStatus(`Jig height cannot exceed bed height (${bedHeight.toFixed(0)}mm).`)
        return
      }
      console.log('[home.jsx] Sending jig:height:set command with height:', jigHeight)
      setJigCalibrationStatus('Setting jig height...')
      window.ipc.send('jig:height:set', {
        height: jigHeight,
        unit: 'mm',
        timestamp: Date.now(),
      })
    }
  }, [jigHeight, bedHeight])

  const handleTipTargetChange = useCallback((event) => {
    setTipTarget(event.target.value)
  }, [])

  const handleApplyTipTarget = useCallback(() => {
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

  // Auto-apply compensated duration when it's calculated
  const handleApplyCompensatedDuration = useCallback(() => {
    if (compensatedDuration === null) {
      setHeaterStatus('No compensated duration available. Calculate pad metrics first.')
      return
    }

    // Store the compensated duration for use in soldering sequences
    // The duration will be applied during the lowerZ/dwell stage
    if (typeof window === 'undefined' || !window.ipc?.send) {
      setHeaterStatus('IPC unavailable; cannot store duration.')
      return
    }

    // Send duration to backend for sequence use
    window.ipc.send('sequence:duration:set', {
      duration: compensatedDuration,
      timestamp: Date.now(),
    })

    // Update LCD display to show applied duration
    setCalibration((prev) =>
      prev.map((entry) =>
        entry.label === 'Compensated Duration'
          ? {
            ...entry,
            value: compensatedDuration.toString(),
          }
          : entry
      )
    )

    // Update thermalMassDuration state for TipHeatingControl display
    setThermalMassDuration(compensatedDuration)

    setHeaterStatus(`Compensated duration set to ${compensatedDuration}ms (${(compensatedDuration / 1000).toFixed(1)}s) for thermal mass compensation.`)

    // Navigate to tip heating component to display the compensated duration
    setActiveComponent('tip-heating')
  }, [compensatedDuration])

  const handleToggleHeater = useCallback(() => {
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


  const handleWireDiameterChange = useCallback((event) => {
    setWireDiameter(event.target.value)
  }, [])

  const handleWireFeedStart = useCallback(() => {
    // Use calculated wire length from PadSolderingMetrics
    if (wireUsed === null || wireUsed <= 0) {
      setWireFeedMessage('Please calculate wire length in Pad Soldering Metrics first.')
      return
    }

    const lengthToUse = wireUsed

    const diameterNumeric = Number.parseFloat(wireDiameter)
    if (!Number.isFinite(diameterNumeric) || diameterNumeric <= 0) {
      setWireFeedMessage('Wire diameter must be entered and greater than zero.')
      return
    }

    if (typeof window === 'undefined' || !window.ipc?.send) {
      setWireFeedMessage('IPC unavailable; cannot feed wire.')
      return
    }

    setWireFeedStatus('pending')
    setWireFeedMessage(wireUsed !== null && wireUsed > 0
      ? `Feeding ${lengthToUse.toFixed(2)} mm (calculated from pad metrics)...`
      : 'Feeding wire...'
    )
    // Use a default feed rate of 8.0 mm/s internally, but send diameter for volume tracking
    window.ipc.send('wire:feed:start', {
      length: lengthToUse,
      diameter: diameterNumeric,
      rate: 8.0, // Default feed rate (can be adjusted if needed)
      unit: 'mm',
      rateUnit: 'mm/s',
      timestamp: Date.now(),
    })
  }, [wireUsed, wireDiameter])

  const toggleFan = useCallback((fanKey) => {
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

  const toggleFumeExtractor = useCallback(() => {
    const nextState = !fumeExtractor.enabled

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('fumeExtractor:enable', {
        enabled: nextState,
        timestamp: Date.now(),
      })
    }

    setFumeExtractor((current) => ({
      ...current,
      enabled: nextState,
    }))
  }, [fumeExtractor.enabled])

  const handleFumeExtractorSpeedChange = useCallback((speed) => {
    const speedNumeric = Number.parseFloat(speed)
    if (!Number.isFinite(speedNumeric) || speedNumeric < 0 || speedNumeric > 100) {
      setFumeExtractorStatusMessage('Speed must be between 0 and 100')
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('fumeExtractor:speed:set', {
        speed: speedNumeric,
        timestamp: Date.now(),
      })
    }

    setFumeExtractor((current) => ({
      ...current,
      speed: speedNumeric,
    }))
    setFumeExtractorStatusMessage('')
  }, [])

  const toggleFumeExtractorAutoMode = useCallback(() => {
    const nextState = !fumeExtractor.autoMode

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('fumeExtractor:autoMode:set', {
        autoMode: nextState,
        timestamp: Date.now(),
      })
    }

    setFumeExtractor((current) => ({
      ...current,
      autoMode: nextState,
    }))
  }, [fumeExtractor.autoMode])

  const handleFluxMistDispense = useCallback(() => {
    if (fluxMist.isDispensing) {
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      setFluxMistStatusMessage('Dispensing flux mist...')
      window.ipc.send('fluxMist:dispense', {
        duration: fluxMist.duration,
        flowRate: fluxMist.flowRate,
        timestamp: Date.now(),
      })
    }
  }, [fluxMist])

  const handleFluxMistDurationChange = useCallback((duration) => {
    const durationNumeric = Number.parseFloat(duration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      setFluxMistStatusMessage('Duration must be greater than zero')
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('fluxMist:duration:set', {
        duration: durationNumeric,
        timestamp: Date.now(),
      })
    }

    setFluxMist((current) => ({
      ...current,
      duration: durationNumeric,
    }))
    setFluxMistStatusMessage('')
  }, [])

  const handleFluxMistFlowRateChange = useCallback((flowRate) => {
    const flowRateNumeric = Number.parseFloat(flowRate)
    if (!Number.isFinite(flowRateNumeric) || flowRateNumeric < 0 || flowRateNumeric > 100) {
      setFluxMistStatusMessage('Flow rate must be between 0 and 100')
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('fluxMist:flowRate:set', {
        flowRate: flowRateNumeric,
        timestamp: Date.now(),
      })
    }

    setFluxMist((current) => ({
      ...current,
      flowRate: flowRateNumeric,
    }))
    setFluxMistStatusMessage('')
  }, [])

  const toggleFluxMistAutoMode = useCallback(() => {
    const nextState = !fluxMist.autoMode

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('fluxMist:autoMode:set', {
        autoMode: nextState,
        timestamp: Date.now(),
      })
    }

    setFluxMist((current) => ({
      ...current,
      autoMode: nextState,
    }))
  }, [fluxMist.autoMode])

  const toggleAirBreeze = useCallback(() => {
    const nextState = !airBreeze.enabled

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airBreeze:enable', {
        enabled: nextState,
        timestamp: Date.now(),
      })
    }

    setAirBreeze((current) => ({
      ...current,
      enabled: nextState,
    }))
  }, [airBreeze.enabled])

  const handleAirBreezeActivate = useCallback(() => {
    if (airBreeze.isActive) {
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      setAirBreezeStatusMessage('Activating air breeze...')
      window.ipc.send('airBreeze:activate', {
        duration: airBreeze.duration,
        intensity: airBreeze.intensity,
        timestamp: Date.now(),
      })
    }
  }, [airBreeze])

  const handleAirBreezeDurationChange = useCallback((duration) => {
    const durationNumeric = Number.parseFloat(duration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      setAirBreezeStatusMessage('Duration must be greater than zero')
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airBreeze:duration:set', {
        duration: durationNumeric,
        timestamp: Date.now(),
      })
    }

    setAirBreeze((current) => ({
      ...current,
      duration: durationNumeric,
    }))
    setAirBreezeStatusMessage('')
  }, [])

  const handleAirBreezeIntensityChange = useCallback((intensity) => {
    const intensityNumeric = Number.parseFloat(intensity)
    if (!Number.isFinite(intensityNumeric) || intensityNumeric < 0 || intensityNumeric > 100) {
      setAirBreezeStatusMessage('Intensity must be between 0 and 100')
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airBreeze:intensity:set', {
        intensity: intensityNumeric,
        timestamp: Date.now(),
      })
    }

    setAirBreeze((current) => ({
      ...current,
      intensity: intensityNumeric,
    }))
    setAirBreezeStatusMessage('')
  }, [])

  const toggleAirBreezeAutoMode = useCallback(() => {
    const nextState = !airBreeze.autoMode

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airBreeze:autoMode:set', {
        autoMode: nextState,
        timestamp: Date.now(),
      })
    }

    setAirBreeze((current) => ({
      ...current,
      autoMode: nextState,
    }))
  }, [airBreeze.autoMode])

  const toggleAirJetPressure = useCallback(() => {
    const nextState = !airJetPressure.enabled

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airJetPressure:enable', {
        enabled: nextState,
        timestamp: Date.now(),
      })
    }

    setAirJetPressure((current) => ({
      ...current,
      enabled: nextState,
    }))
  }, [airJetPressure.enabled])

  const handleAirJetPressureActivate = useCallback(() => {
    if (airJetPressure.isActive) {
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      setAirJetPressureStatusMessage('Activating air jet pressure...')
      window.ipc.send('airJetPressure:activate', {
        duration: airJetPressure.duration,
        pressure: airJetPressure.pressure,
        timestamp: Date.now(),
      })
    }
  }, [airJetPressure])

  const handleAirJetPressureDurationChange = useCallback((duration) => {
    const durationNumeric = Number.parseFloat(duration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      setAirJetPressureStatusMessage('Duration must be greater than zero')
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airJetPressure:duration:set', {
        duration: durationNumeric,
        timestamp: Date.now(),
      })
    }

    setAirJetPressure((current) => ({
      ...current,
      duration: durationNumeric,
    }))
    setAirJetPressureStatusMessage('')
  }, [])

  const handleAirJetPressurePressureChange = useCallback((pressure) => {
    const pressureNumeric = Number.parseFloat(pressure)
    if (!Number.isFinite(pressureNumeric) || pressureNumeric < 0 || pressureNumeric > 100) {
      setAirJetPressureStatusMessage('Pressure must be between 0 and 100')
      return
    }

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airJetPressure:pressure:set', {
        pressure: pressureNumeric,
        timestamp: Date.now(),
      })
    }

    setAirJetPressure((current) => ({
      ...current,
      pressure: pressureNumeric,
    }))
    setAirJetPressureStatusMessage('')
  }, [])

  const toggleAirJetPressureAutoMode = useCallback(() => {
    const nextState = !airJetPressure.autoMode

    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('airJetPressure:autoMode:set', {
        autoMode: nextState,
        timestamp: Date.now(),
      })
    }

    setAirJetPressure((current) => ({
      ...current,
      autoMode: nextState,
    }))
  }, [airJetPressure.autoMode])

  const handleSpoolConfigSubmit = useCallback((config) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      setSpoolStatusMessage('IPC unavailable; cannot update spool config.')
      return
    }

    // If wire diameter is being updated, also sync it to WireFeedControl
    if (config.wireDiameter !== undefined) {
      setWireDiameter(config.wireDiameter)
    }

    setSpoolStatusMessage('Updating spool configuration...')
    window.ipc.send('spool:config:set', config)

    // Listen for response
    const handleResponse = (event, result) => {
      if (result.error) {
        setSpoolStatusMessage(`Error: ${result.error}`)
      } else {
        setSpoolStatusMessage(result.status || 'Spool configuration updated')
      }
      window.ipc.off?.('spool:config:response', handleResponse)
    }
    window.ipc.on?.('spool:config:response', handleResponse)
  }, [])

  const handleResetSpool = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      setSpoolStatusMessage('IPC unavailable; cannot reset spool.')
      return
    }

    setSpoolStatusMessage('Resetting spool...')
    window.ipc.send('spool:reset')

    // Listen for response
    const handleResponse = (event, result) => {
      if (result.error) {
        setSpoolStatusMessage(`Error: ${result.error}`)
      } else {
        setSpoolStatusMessage(result.status || 'Spool reset')
      }
      window.ipc.off?.('spool:reset:response', handleResponse)
    }
    window.ipc.on?.('spool:reset:response', handleResponse)
  }, [])

  const handleTareSpool = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      setSpoolStatusMessage('IPC unavailable; cannot tare spool.')
      return
    }

    setSpoolStatusMessage('Taring spool weight...')
    window.ipc.send('spool:tare')

    // Listen for response
    const handleResponse = (event, result) => {
      if (result.error) {
        setSpoolStatusMessage(`Error: ${result.error}`)
      } else {
        setSpoolStatusMessage(result.status || 'Spool weight tared (zeroed)')
      }
      window.ipc.off?.('spool:tare:response', handleResponse)
    }
    window.ipc.on?.('spool:tare:response', handleResponse)
  }, [])

  const handleJog = useCallback(
    (axis, direction, stepSizeValue) => {
      if (typeof window === 'undefined' || !window.ipc?.send) {
        console.error('[ManualMovement] IPC unavailable; cannot send jog command.')
        return
      }

      console.log('[ManualMovement] Sending jog command:', { axis, direction, stepSize: stepSizeValue })

      // Set up acknowledgment listener BEFORE sending command to avoid race condition
      const handleAck = (event, result) => {
        console.log('[ManualMovement] Received axis:jog:ack:', result)
        if (result.error) {
          console.error('[ManualMovement] Jog error:', result.error)
          setManualMovementStatus('')
          setLimitSwitchAlert(false)
        } else {
          console.log('[ManualMovement] Jog command acknowledged:', result.status)
          console.log('[ManualMovement] Clearing limit switch alert on manual move')
          setLimitSwitchAlert(false)
          setManualMovementStatus('')
        }
        // Clean up listener after receiving acknowledgment
        window.ipc.off?.('axis:jog:ack', handleAck)
      }

      // Register listener BEFORE sending command
      window.ipc.on?.('axis:jog:ack', handleAck)

      // Send command
      window.ipc.send('axis:jog', {
        axis,
        direction,
        stepSize: stepSizeValue,
        timestamp: Date.now(),
      })

      console.log('[ManualMovement] Jog command sent, waiting for acknowledgment and Arduino limit switch updates...')
    },
    []
  )

  const handleHome = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      console.error('[ManualMovement] IPC unavailable; cannot send home command.')
      return
    }

    console.log('[ManualMovement] Sending home command')

    // Listen for acknowledgment
    const handleAck = (event, result) => {
      if (result.error) {
        console.error('[ManualMovement] Home error:', result.error)
      } else {
        console.log('[ManualMovement] Home completed:', result.status)
      }
      window.ipc.off?.('axis:home:ack', handleAck)
    }
    window.ipc.on?.('axis:home:ack', handleAck)

    window.ipc.send('axis:home', {
      timestamp: Date.now(),
    })
  }, [])

  const handleSpeedChange = useCallback((speed) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      console.warn('[home.jsx] IPC unavailable; cannot set speed')
      return
    }

    const speedValue = Math.max(1, Math.min(200, Number(speed) || 95))
    console.log('[home.jsx] Setting Z-axis speed to:', speedValue, speedValue > 100 ? '(Turbo Mode)' : '')

    // Update local state immediately for responsive UI
    setZAxisSpeed(speedValue)

    // Send to backend
    window.ipc.send('axis:speed:set', {
      speed: speedValue,
      timestamp: Date.now(),
    })
  }, [])

  const handleSave = useCallback(() => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      console.error('[ManualMovement] IPC unavailable; cannot send save command.')
      return
    }

    console.log('[ManualMovement] Sending save command')

    // Listen for acknowledgment
    const handleAck = (event, result) => {
      if (result.error) {
        console.error('[ManualMovement] Save error:', result.error)
        setManualMovementStatus('Error saving movement: ' + result.error)
      } else {
        console.log('[ManualMovement] Save completed:', result.status)
        setManualMovementStatus('Movement saved successfully!')
        // Clear status message after 3 seconds
        setTimeout(() => setManualMovementStatus(''), 3000)
      }
      window.ipc.off?.('axis:save:ack', handleAck)
    }
    window.ipc.on?.('axis:save:ack', handleAck)

    window.ipc.send('axis:save', {
      timestamp: Date.now(),
    })
  }, [])

  const handlePadShapeChange = useCallback((shape) => {
    setPadShape(shape)
    // Reset dimensions and metrics when shape changes
    setPadDimensions({
      side: '',
      length: '',
      width: '',
      radius: '',
      outerRadius: '',
      innerRadius: '',
    })
    setPadArea(null)
    setPadVolume(null)
    setWireUsed(null)
    setStepsMoved(null)
    setPadCategory(null)
    setCompensatedDuration(null)
    // Reset LCD display compensated duration
    setCalibration((prev) =>
      prev.map((entry) =>
        entry.label === 'Compensated Duration'
          ? {
            ...entry,
            value: '--',
          }
          : entry
      )
    )
  }, [])

  const handlePadDimensionChange = useCallback((dimension, value) => {
    setPadDimensions((prev) => ({
      ...prev,
      [dimension]: value,
    }))
    // Reset metrics when dimensions change
    setPadArea(null)
    setPadVolume(null)
    setWireUsed(null)
    setStepsMoved(null)
    setPadCategory(null)
    setCompensatedDuration(null)
    // Reset LCD display compensated duration
    setCalibration((prev) =>
      prev.map((entry) =>
        entry.label === 'Compensated Duration'
          ? {
            ...entry,
            value: '--',
          }
          : entry
      )
    )
  }, [])

  const handleSolderHeightChange = useCallback((value) => {
    setSolderHeight(value)
    // Reset metrics when height changes
    setPadVolume(null)
    setWireUsed(null)
    setStepsMoved(null)
  }, [])

  // Thermal mass compensation calculation (duration-based)
  const calculateThermalMassCompensation = useCallback((padArea) => {
    if (!padArea || padArea <= 0) {
      return {
        category: null,
        compensatedDuration: null,
        compensation: 0,
      }
    }

    // Pad size categories (based on area in mm²)
    let category
    if (padArea < 10) {
      category = 'small'
    } else if (padArea < 50) {
      category = 'medium'
    } else {
      category = 'large'
    }

    // Duration compensation factor: 100ms per √mm² (non-linear scaling)
    // Larger pads need more time for heat to transfer
    const compensationFactor = 100 // milliseconds per √mm²
    const compensation = Math.sqrt(padArea) * compensationFactor

    // Calculate compensated duration
    const compensatedDurationMs = baseDuration + compensation

    // Clamp to reasonable range (1000ms - 5000ms = 1-5 seconds)
    const clampedDuration = Math.max(1000, Math.min(5000, Math.round(compensatedDurationMs)))

    return {
      category,
      compensatedDuration: clampedDuration,
      compensation: Math.round(compensation), // Round to nearest millisecond
    }
  }, [baseDuration])

  const handleSaveConfiguration = useCallback(() => {
    if (!padShape || !padArea || !compensatedDuration) {
      return
    }

    const config = {
      id: Date.now(),
      name: `${padShape.charAt(0).toUpperCase() + padShape.slice(1)} - ${padArea.toFixed(2)}mm²`,
      shape: padShape,
      dimensions: { ...padDimensions },
      solderHeight,
      area: padArea,
      volume: padVolume,
      wireUsed,
      stepsMoved,
      category: padCategory,
      compensatedDuration,
      createdAt: new Date().toISOString()
    }

    // Save to database via IPC
    if (typeof window !== 'undefined' && window.ipc?.send) {
      window.ipc.send('pad-config:save', config)
    }

    setSavedPadConfigurations(prev => [...prev, config])
  }, [padShape, padDimensions, solderHeight, padArea, padVolume, wireUsed, stepsMoved, padCategory, compensatedDuration])

  const calculatePadMetrics = useCallback(() => {
    setIsCalculatingMetrics(true)

    // Simulate calculation delay
    setTimeout(() => {
      let calculatedArea = 0
      let maxDimension = 0 // For calculating steps

      // Calculate area based on shape
      switch (padShape) {
        case 'square': {
          const side = Number.parseFloat(padDimensions.side)
          if (!Number.isFinite(side) || side <= 0) {
            setPadArea(null)
            setPadCategory(null)
            setCompensatedDuration(null)
            setWireUsed(null)
            setStepsMoved(null)
            // Reset LCD display compensated duration
            setCalibration((prev) =>
              prev.map((entry) =>
                entry.label === 'Compensated Duration'
                  ? { ...entry, value: '--' }
                  : entry
              )
            )
            setIsCalculatingMetrics(false)
            return
          }
          calculatedArea = side * side // Area = side²
          maxDimension = side
          break
        }

        case 'rectangle': {
          const length = Number.parseFloat(padDimensions.length)
          const width = Number.parseFloat(padDimensions.width)
          if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) {
            setPadArea(null)
            setPadCategory(null)
            setCompensatedDuration(null)
            setWireUsed(null)
            setStepsMoved(null)
            setIsCalculatingMetrics(false)
            return
          }
          calculatedArea = length * width // Area = length × width
          maxDimension = Math.max(length, width)
          break
        }

        case 'circle': {
          const radius = Number.parseFloat(padDimensions.radius)
          if (!Number.isFinite(radius) || radius <= 0) {
            setPadArea(null)
            setPadCategory(null)
            setCompensatedDuration(null)
            setWireUsed(null)
            setStepsMoved(null)
            // Reset LCD display compensated duration
            setCalibration((prev) =>
              prev.map((entry) =>
                entry.label === 'Compensated Duration'
                  ? { ...entry, value: '--' }
                  : entry
              )
            )
            setIsCalculatingMetrics(false)
            return
          }
          calculatedArea = Math.PI * radius * radius // Area = π × r²
          maxDimension = radius * 2 // diameter
          break
        }

        case 'concentric': {
          const outerRadius = Number.parseFloat(padDimensions.outerRadius)
          const innerRadius = Number.parseFloat(padDimensions.innerRadius)
          if (!Number.isFinite(outerRadius) || !Number.isFinite(innerRadius) ||
            outerRadius <= 0 || innerRadius <= 0 || outerRadius <= innerRadius) {
            setPadArea(null)
            setPadCategory(null)
            setCompensatedDuration(null)
            setWireUsed(null)
            setStepsMoved(null)
            setIsCalculatingMetrics(false)
            return
          }
          // Area = π × (outerRadius² - innerRadius²)
          calculatedArea = Math.PI * (outerRadius * outerRadius - innerRadius * innerRadius)
          maxDimension = outerRadius * 2 // outer diameter
          break
        }

        default:
          setPadArea(null)
          setPadCategory(null)
          setCompensatedDuration(null)
          setWireUsed(null)
          setStepsMoved(null)
          // Reset LCD display compensated duration
          setCalibration((prev) =>
            prev.map((entry) =>
              entry.label === 'Compensated Duration'
                ? { ...entry, value: '--' }
                : entry
            )
          )
          setIsCalculatingMetrics(false)
          return
      }

      setPadArea(calculatedArea)

      // Calculate thermal mass compensation (duration-based)
      const thermalCompensation = calculateThermalMassCompensation(calculatedArea)
      setPadCategory(thermalCompensation.category)
      setCompensatedDuration(thermalCompensation.compensatedDuration)

      // Update LCD display with compensated duration (visible for every pad shape)
      if (thermalCompensation.compensatedDuration !== null) {
        setCalibration((prev) =>
          prev.map((entry) =>
            entry.label === 'Compensated Duration'
              ? {
                ...entry,
                value: thermalCompensation.compensatedDuration.toString(),
              }
              : entry
          )
        )
      }

      // Calculate pad volume: Area × Solder Height
      const heightNumeric = Number.parseFloat(solderHeight)
      if (!Number.isFinite(heightNumeric) || heightNumeric <= 0) {
        setPadVolume(null)
        // Keep padCategory and compensatedDuration (already calculated from area)
        setWireUsed(null)
        setStepsMoved(null)
        setIsCalculatingMetrics(false)
        return
      }

      const calculatedVolume = calculatedArea * heightNumeric // Volume = Area × Height (mm³)
      setPadVolume(calculatedVolume)

      // Calculate wire length using volume: Wire Length = Pad Volume / Volume per 1mm
      if (!volumePerMm || volumePerMm <= 0) {
        setWireUsed(null)
        setStepsMoved(null)
        setIsCalculatingMetrics(false)
        return
      }

      const calculatedWireUsed = calculatedVolume / volumePerMm // Wire length in mm
      setWireUsed(calculatedWireUsed)

      const stepsPerMm = 8 // steps per millimeter
      const calculatedSteps = Math.ceil(calculatedWireUsed * stepsPerMm)

      setStepsMoved(calculatedSteps)
      setIsCalculatingMetrics(false)
    }, 300)
  }, [padShape, padDimensions, solderHeight, volumePerMm, calculateThermalMassCompensation])

  const isMachineFanOn = fans.machine
  const isTipFanOn = fans.tip
  const fanHeaderActions = useMemo(
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
  // Component navigation items
  const componentNavItems = [
    { id: 'serial-port', label: 'Serial Port' },
    // { id: 'component-height', label: 'Component Height' },
    { id: 'jig-calibration', label: 'Jig Calibration' },
    { id: 'manual-movement', label: 'Manual Movement' },
    { id: 'tip-heating', label: 'Tip Heating' },
    { id: 'pad-metrics', label: 'Pad Metrics' },
    { id: 'wire-feed', label: 'Wire Feed' },
    { id: 'spool-wire', label: 'Spool Wire' },
    { id: 'fume-extractor', label: 'Fume Extractor' },
    { id: 'flux-mist', label: 'Flux Mist' },
    { id: 'air-control', label: 'Air Control' },
    { id: 'sequence-monitor', label: 'Sequence Monitor' },
    { id: 'emergency-stop', label: 'Emergency Stop' },
    { id: 'pid-tuning', label: 'PID Tuning' },
  ]

  return (
    <React.Fragment>
      <Head>
        <title>Single Axis Soldering Robot</title>
      </Head>
      <main className={styles.page} role="main">
        <header className={styles.pageHeader}>
          <div className={styles.pageHeaderContent}>
            <div>
              <h1 className={styles.heading}>Single Axis Soldering Robot Console</h1>
              <p className={styles.subtitle}>
                Track axis calibration, solder flow, and thermal data from the virtual LCD
                that mirrors your hardware display.
              </p>
            </div>
            <ThemeToggle className={styles.themeToggleButton} />
          </div>
        </header>

        {/* Navigation Bar */}
        <nav className={styles.navbar} role="navigation" aria-label="Component navigation">
          <div className={styles.navbarContainer}>
            {componentNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.navItem} ${activeComponent === item.id ? styles.navItemActive : ''}`}
                onClick={() => setActiveComponent(item.id)}
                aria-pressed={activeComponent === item.id}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Conditionally render components based on activeComponent */}
        {activeComponent === 'serial-port' && (
          <SerialPortConnection
            isConnected={isSerialConnected}
            isConnecting={isSerialConnecting}
            currentPort={currentSerialPort}
            availablePorts={serialPorts}
            onRefreshPorts={handleRefreshPorts}
            onConnect={handleSerialConnect}
            onDisconnect={handleSerialDisconnect}
            connectionError={serialConnectionError}
            isReceivingData={isReceivingArduinoData}
            lastDataReceived={lastArduinoDataTime}
            dataCount={arduinoDataCount}
          />
        )}

        {/* COMPONENT HEIGHT CONTROL COMMENTED OUT */}
        {/* {activeComponent === 'component-height' && (
          <ComponentHeightControl
          value={componentHeight}
          onChange={handleHeightChange}
          onSubmit={handleHeightSubmit}
          statusMessage={heightStatus}
          />
        )} */}

        {activeComponent === 'jig-calibration' && (
          <section className={styles.solderingControls} aria-label="Jig calibration controls">
            <JigCalibration
              jigHeight={jigHeight}
              onJigHeightChange={handleJigHeightChange}
              onCalibrate={handleJigCalibrate}
              statusMessage={jigCalibrationStatus}
              bedHeight={bedHeight}
              safeTravelSpace={safeTravelSpace}
            />
          </section>
        )}

        {activeComponent === 'manual-movement' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <ManualMovementControl
              currentPosition={currentPosition}
              stepSize={stepSize}
              onStepSizeChange={setStepSize}
              onJog={handleJog}
              onHome={handleHome}
              onSave={handleSave}
              isMoving={currentPosition.isMoving}
              statusMessage={manualMovementStatus}
              limitSwitchAlert={limitSwitchAlert}
              isSerialConnected={isSerialConnected}
              isReceivingArduinoData={isReceivingArduinoData}
              zAxisSpeed={zAxisSpeed}
              onSpeedChange={handleSpeedChange}
            />
          </section>
        )}

        {activeComponent === 'tip-heating' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <TipHeatingControl
              tipTarget={tipTarget}
              onTipTargetChange={handleTipTargetChange}
              onApplyTipTarget={handleApplyTipTarget}
              isHeaterEnabled={isHeaterEnabled}
              onToggleHeater={handleToggleHeater}
              heaterStatus={heaterStatus}
              currentTemperature={currentTipTemperature ?? calibration.find((entry) => entry.label === 'Tip Temp')?.value}
              thermalMassDuration={thermalMassDuration}
            />
          </section>
        )}

        {activeComponent === 'pad-metrics' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <PadSolderingMetrics
              padShape={padShape}
              padDimensions={padDimensions}
              solderHeight={solderHeight}
              padArea={padArea}
              padVolume={padVolume}
              wireUsed={wireUsed}
              stepsMoved={stepsMoved}
              volumePerMm={volumePerMm}
              padCategory={padCategory}
              compensatedDuration={compensatedDuration}
              baseTemperature={baseTemperature}
              maxTemperature={maxTemperature}
              baseDuration={baseDuration}
              onShapeChange={handlePadShapeChange}
              onDimensionChange={handlePadDimensionChange}
              onSolderHeightChange={handleSolderHeightChange}
              onCalculate={calculatePadMetrics}
              onApplyCompensatedDuration={handleApplyCompensatedDuration}
              onSaveConfiguration={handleSaveConfiguration}
              isCalculating={isCalculatingMetrics}
            />
          </section>
        )}

        {activeComponent === 'wire-feed' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <WireFeedControl
              calculatedLength={wireUsed}
              wireDiameter={wireDiameter}
              volumePerMm={volumePerMm}
              status={wireFeedStatus}
              message={wireFeedMessage}
              onWireDiameterChange={handleWireDiameterChange}
              onStart={handleWireFeedStart}
            />
          </section>
        )}

        {activeComponent === 'spool-wire' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <SpoolWireControl
              spoolState={spoolState}
              onSpoolConfigChange={() => { }}
              onSpoolConfigSubmit={handleSpoolConfigSubmit}
              onResetSpool={handleResetSpool}
              onTareSpool={handleTareSpool}
              statusMessage={spoolStatusMessage}
            />
          </section>
        )}

        {activeComponent === 'fume-extractor' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <FumeExtractorControl
              enabled={fumeExtractor.enabled}
              speed={fumeExtractor.speed}
              autoMode={fumeExtractor.autoMode}
              onToggle={toggleFumeExtractor}
              onSpeedChange={handleFumeExtractorSpeedChange}
              onAutoModeToggle={toggleFumeExtractorAutoMode}
              statusMessage={fumeExtractorStatusMessage}
            />
          </section>
        )}

        {activeComponent === 'flux-mist' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <FluxMistControl
              isDispensing={fluxMist.isDispensing}
              duration={fluxMist.duration}
              flowRate={fluxMist.flowRate}
              autoMode={fluxMist.autoMode}
              onDispense={handleFluxMistDispense}
              onDurationChange={handleFluxMistDurationChange}
              onFlowRateChange={handleFluxMistFlowRateChange}
              onAutoModeToggle={toggleFluxMistAutoMode}
              statusMessage={fluxMistStatusMessage}
              lastDispensed={fluxMist.lastDispensed}
              fluxRemaining={fluxRemaining}
            />
          </section>
        )}

        {activeComponent === 'air-control' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <AirControl
              airBreezeEnabled={airBreeze.enabled}
              airBreezeActive={airBreeze.isActive}
              airBreezeDuration={airBreeze.duration}
              airBreezeIntensity={airBreeze.intensity}
              airBreezeAutoMode={airBreeze.autoMode}
              onAirBreezeToggle={toggleAirBreeze}
              onAirBreezeActivate={handleAirBreezeActivate}
              onAirBreezeDurationChange={handleAirBreezeDurationChange}
              onAirBreezeIntensityChange={handleAirBreezeIntensityChange}
              onAirBreezeAutoModeToggle={toggleAirBreezeAutoMode}
              airBreezeLastActivated={airBreeze.lastActivated}
              airBreezeStatusMessage={airBreezeStatusMessage}
              airJetEnabled={airJetPressure.enabled}
              airJetActive={airJetPressure.isActive}
              airJetDuration={airJetPressure.duration}
              airJetPressure={airJetPressure.pressure}
              airJetAutoMode={airJetPressure.autoMode}
              onAirJetToggle={toggleAirJetPressure}
              onAirJetActivate={handleAirJetPressureActivate}
              onAirJetDurationChange={handleAirJetPressureDurationChange}
              onAirJetPressureChange={handleAirJetPressurePressureChange}
              onAirJetAutoModeToggle={toggleAirJetPressureAutoMode}
              airJetLastActivated={airJetPressure.lastActivated}
              airJetStatusMessage={airJetPressureStatusMessage}
            />
          </section>
        )}

        {activeComponent === 'sequence-monitor' && (
          <section className={styles.solderingControls} aria-label="Soldering iron controls">
            <SequenceMonitor
              sequenceState={sequenceState}
              onStart={handleSequenceStart}
              onStop={handleSequenceStop}
              onPause={handleSequencePause}
              onResume={handleSequenceResume}
              padPositions={[]}
              isConnected={isSerialConnected}
              hasSavedMovement={currentPosition.hasSavedMovement}
            />
          </section>
        )}

        {activeComponent === 'emergency-stop' && (
          <section className={styles.solderingControls} aria-label="Emergency stop control">
            <EmergencyStopControl
              isActive={emergencyStopActive}
              onReset={handleEmergencyStopReset}
              isConnected={isSerialConnected}
            />
          </section>
        )}

        {activeComponent === 'pid-tuning' && (
          <section className={styles.solderingControls} aria-label="PID temperature control">
            <PIDTuningControl
              pidEnabled={pidEnabled}
              pidKp={pidKp}
              pidKi={pidKi}
              pidKd={pidKd}
              pidPower={pidPower}
              pidOutput={pidOutput}
              isConnected={isSerialConnected}
              onPIDParametersSet={handlePIDParametersSet}
              onPIDEnabledSet={handlePIDEnabledSet}
            />
          </section>
        )}

        {/* Empty spool alert - highest priority */}
        {isWireEmpty ? (
          <div className={styles.wireAlertEmpty} role="alert">
            <span className={styles.wireAlertEmptyDot} aria-hidden />
            <div className={styles.wireAlertEmptyContent}>
              <span className={styles.wireAlertEmptyTitle}>Spool Empty</span>
              <span className={styles.wireAlertEmptyMessage}>
                Wire is completely used. Please refill the spool with new wire.
              </span>
            </div>
          </div>
        ) : null}

        {/* Low wire remaining alert - show only if not empty */}
        {!isWireEmpty && isWireLow ? (
          <div className={styles.wireAlert} role="alert">
            <span className={styles.wireAlertDot} aria-hidden />
            <span>
              Wire remaining is critically low at {wirePercentage.toFixed(1)}%. Replace the spool soon.
            </span>
            {wireLength ? <span className={styles.wireAlertLength}>Remaining length: {wireLength}</span> : null}
          </div>
        ) : null}

        {wireBreak.detected ? (
          <div className={styles.wireBreakAlert} role="alert">
            <div className={styles.wireBreakAlertContent}>
              <div className={styles.wireBreakAlertIcon}>⚠️</div>
              <div className={styles.wireBreakAlertText}>
                <span className={styles.wireBreakAlertTitle}>WIRE BREAK DETECTED</span>
                <span className={styles.wireBreakAlertMessage}>
                  {wireBreak.message || 'Solder wire has broken during feeding. Please check the wire and reconnect.'}
                </span>
                {wireBreak.timestamp && (
                  <span className={styles.wireBreakAlertTime}>
                    Detected at {new Date(wireBreak.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <button
                type="button"
                className={styles.wireBreakAlertDismiss}
                onClick={() => {
                  if (typeof window !== 'undefined' && window.ipc?.send) {
                    window.ipc.send('wire:break:clear')
                  }
                  setWireBreak({ detected: false, timestamp: null, message: null })
                }}
                aria-label="Dismiss wire break alert"
              >
                ×
              </button>
            </div>
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

        <section className={styles.cameraSection} aria-label="Camera view">
          <CameraView isActive={true} />
        </section>

        {/* G-CODE MONITOR SECTION COMMENTED OUT */}
        {/* <section className={styles.gcodeSection} aria-label="G-code command monitor">
          <GCodeMonitor
            commands={gcodeCommands}
            isConnected={isSerialConnected}
          />
        </section> */}
      </main>
    </React.Fragment>
  )
}
