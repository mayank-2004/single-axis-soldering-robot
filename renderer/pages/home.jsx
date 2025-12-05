import React, { useCallback, useState } from 'react'
import Head from 'next/head'
import LcdDisplay from '../components/LcdDisplay'
// COMPONENT HEIGHT CONTROL COMPONENT IMPORT COMMENTED OUT
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
// G-CODE MONITOR COMPONENT IMPORT COMMENTED OUT
// import GCodeMonitor from '../components/GCodeMonitor'
import CameraView from '../components/CameraView'
import styles from './home.module.css'

const initialCalibration = [
  { label: 'Z Axis', value: '000.00 → 000.00', unit: 'mm', icon: '↕' },
  { label: 'Wire Remaining', value: '100', unit: '%', length: '14.3 m', icon: '⚡' },
  { label: 'Flux Remaining', value: '82', unit: '%', icon: '💧' },
  { label: 'Tip Temp', value: '345', unit: '°C', icon: '🌡️' },
  { label: 'Feed Rate', value: '8.0', unit: 'mm/s', icon: '⏩' },
  { label: 'Speed', value: '210', unit: 'mm/s', icon: '⚡' },
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
  const [tipTarget, setTipTarget] = useState('345')
  const [isHeaterEnabled, setIsHeaterEnabled] = useState(false)
  const [heaterStatus, setHeaterStatus] = useState('')
  const [currentTipTemperature, setCurrentTipTemperature] = useState(null)
  const [wireDiameter, setWireDiameter] = useState('')
  const [wireFeedStatus, setWireFeedStatus] = useState('idle')
  const [wireFeedMessage, setWireFeedMessage] = useState('')
  const [wireBreak, setWireBreak] = useState({
    detected: false,
    timestamp: null,
    message: null,
  })
  const [spoolState, setSpoolState] = useState({
    spoolDiameter: 50.0,
    wireDiameter: 0.5,
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
  const volumePerMm = React.useMemo(() => {
    const diameterNumeric = Number.parseFloat(wireDiameter)
    if (!Number.isFinite(diameterNumeric) || diameterNumeric <= 0) {
      return null
    }
    const radius = diameterNumeric / 2 // radius in mm
    const height = 1 // 1mm length
    const volume = Math.PI * radius * radius * height // volume in mm³
    return volume
  }, [wireDiameter])
  const [sequenceState, setSequenceState] = useState({
    stage: 'idle',
    lastCompleted: null,
    isActive: false,
    isPaused: false,
    currentPad: 0,
    totalPads: 0,
    progress: 0,
    error: null,
  })
  const [currentPosition, setCurrentPosition] = useState({
    x: 120.0,
    y: 45.3,
    z: 0.0, // Start at home position (0.00mm) - FIXED
    isMoving: false,
  })
  const [limitSwitchAlert, setLimitSwitchAlert] = useState(false)
  const [stepSize, setStepSize] = useState(1.0)
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
  const [compensatedTemperature, setCompensatedTemperature] = useState(null)
  const baseTemperature = 345 // Base temperature in °C

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

  // G-CODE COMMAND HISTORY COMMENTED OUT
  // G-code command history
  // const [gcodeCommands, setGcodeCommands] = useState([])
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
  const isWireEmpty = wirePercentage <= 0
  
  // Get flux remaining from calibration
  const fluxRemaining = React.useMemo(() => {
    const fluxEntry = calibration.find((entry) => entry.label === 'Flux Remaining')
    if (!fluxEntry) return null
    const numeric = typeof fluxEntry.value === 'number' 
      ? fluxEntry.value 
      : parseFloat(String(fluxEntry.value).replace(/[^0-9.]/g, ''))
    return Number.isFinite(numeric) ? numeric : null
  }, [calibration])

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

      setSpoolState((current) => ({
        ...current,
        ...payload,
      }))

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
      }))
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
    window.ipc.on?.('fan:update', handleFanState)
    window.ipc.on?.('fumeExtractor:update', handleFumeExtractorState)
    window.ipc.on?.('fluxMist:update', handleFluxMistState)
    window.ipc.on?.('airBreeze:update', handleAirBreezeState)
    window.ipc.on?.('airJetPressure:update', handleAirJetPressureState)

    // Listen for actual Arduino JSON data (only this counts as real Arduino data)
    window.ipc.on?.('arduino:data:received', handleArduinoDataReceived)

    window.ipc.send?.('tip:status:request')
    window.ipc.send?.('wire:feed:status:request')
    window.ipc.send?.('spool:status:request')
    window.ipc.send?.('sequence:status:request')
    window.ipc.send?.('fan:state:request')
    window.ipc.send?.('fumeExtractor:state:request')
    window.ipc.send?.('fluxMist:state:request')
    window.ipc.send?.('airBreeze:state:request')
    window.ipc.send?.('airJetPressure:state:request')

    return () => {
      window.ipc.off?.('component:height:ack', handleHeightAck)
      window.ipc.off?.('component:height:ack', handleHeightAck)
      window.ipc.off?.('tip:status', handleTipStatus)
      window.ipc.off?.('wire:feed:status', handleWireFeedStatus)
      window.ipc.off?.('wire:break', handleWireBreak)
      window.ipc.off?.('spool:update', handleSpoolUpdate)
      window.ipc.off?.('sequence:update', handleSequenceUpdate)
      window.ipc.off?.('fan:update', handleFanState)
      window.ipc.off?.('fumeExtractor:update', handleFumeExtractorState)
      window.ipc.off?.('fluxMist:update', handleFluxMistState)
      window.ipc.off?.('airBreeze:update', handleAirBreezeState)
      window.ipc.off?.('airJetPressure:update', handleAirJetPressureState)
      window.ipc.off?.('arduino:data:received', handleArduinoDataReceived)
    }
  }, [])


  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.ipc) {
      return undefined
    }

    const handlePositionUpdate = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return
      }

      // DON'T track position updates as Arduino data - only track actual arduino:data:received events
      // Position can come from simulation or other sources

      // Single-axis machine: Only Z position is updated (X and Y removed - PCB moved manually)
      // Ensure Z position doesn't exceed 0.00mm (home position)
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
  React.useEffect(() => {
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
  React.useEffect(() => {
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
  React.useEffect(() => {
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
  // React.useEffect(() => {
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

  // Sequence control handlers
  const handleSequenceStart = useCallback((padPositions) => {
    if (typeof window === 'undefined' || !window.ipc?.send) {
      return
    }
    window.ipc.send('sequence:start', {
      padPositions,
      options: {
        wireLength: wireUsed, // Use calculated wire length from pad metrics
      }
    })
  }, [wireUsed])

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

  // Auto-apply compensated temperature when it's calculated
  const handleApplyCompensatedTemperature = useCallback(() => {
    if (compensatedTemperature === null) {
      setHeaterStatus('No compensated temperature available. Calculate pad metrics first.')
      return
    }

    if (typeof window === 'undefined' || !window.ipc?.send) {
      setHeaterStatus('IPC unavailable; cannot update target.')
      return
    }

    setTipTarget(String(compensatedTemperature))
    setHeaterStatus(`Applying compensated temperature: ${compensatedTemperature}°C...`)
    window.ipc.send('tip:target:set', {
      target: compensatedTemperature,
      unit: '°C',
      timestamp: Date.now(),
    })
  }, [compensatedTemperature])

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

      // Prevent sending command if trying to go above home position (0.00mm)
      // direction > 0 means upward movement
      if (axis.toLowerCase() === 'z' && direction > 0 && currentPosition.z >= 0) {
        // Already at or above home position, show alert and don't send command
        setLimitSwitchAlert(true)
        setManualMovementStatus('Upper limit switch reached - can\'t go upward')
        // Auto-hide alert after 3 seconds
        setTimeout(() => {
          setLimitSwitchAlert(false)
          setManualMovementStatus('')
        }, 3000)
        console.warn('[ManualMovement] Cannot move above home position (0.00mm)')
        return
      }

      console.log('[ManualMovement] Sending jog command:', { axis, direction, stepSize: stepSizeValue })
      
      // Listen for acknowledgment
      const handleAck = (event, result) => {
        if (result.error) {
          console.error('[ManualMovement] Jog error:', result.error)
          setManualMovementStatus('')
          setLimitSwitchAlert(false)
        } else {
          console.log('[ManualMovement] Jog completed:', result.status)
          // Check if limit switch was reached (backup check from backend)
          if (result.limitReached) {
            setLimitSwitchAlert(true)
            setManualMovementStatus('Upper limit switch reached - can\'t go upward')
            // Auto-hide alert after 3 seconds
            setTimeout(() => {
              setLimitSwitchAlert(false)
              setManualMovementStatus('')
            }, 3000)
          } else {
            setLimitSwitchAlert(false)
            setManualMovementStatus('')
          }
        }
        window.ipc.off?.('axis:jog:ack', handleAck)
      }
      window.ipc.on?.('axis:jog:ack', handleAck)

      window.ipc.send('axis:jog', {
        axis,
        direction,
        stepSize: stepSizeValue,
        timestamp: Date.now(),
      })
    },
    [currentPosition.z]
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
    setCompensatedTemperature(null)
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
    setCompensatedTemperature(null)
  }, [])

  const handleSolderHeightChange = useCallback((value) => {
    setSolderHeight(value)
    // Reset metrics when height changes
    setPadVolume(null)
    setWireUsed(null)
    setStepsMoved(null)
  }, [])

  // Thermal mass compensation calculation
  const calculateThermalMassCompensation = useCallback((padArea) => {
    if (!padArea || padArea <= 0) {
      return {
        category: null,
        compensatedTemp: null,
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

    // Compensation factor: 2.0°C per √mm² (non-linear scaling)
    const compensationFactor = 2.0
    const compensation = Math.sqrt(padArea) * compensationFactor

    // Calculate compensated temperature
    const compensatedTemp = baseTemperature + compensation

    // Clamp to safe range (280°C - 400°C)
    const clampedTemp = Math.max(280, Math.min(400, Math.round(compensatedTemp)))

    return {
      category,
      compensatedTemp: clampedTemp,
      compensation: Math.round(compensation * 10) / 10, // Round to 1 decimal
    }
  }, [baseTemperature])

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
            setWireUsed(null)
            setStepsMoved(null)
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
            setWireUsed(null)
            setStepsMoved(null)
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
          setWireUsed(null)
          setStepsMoved(null)
          setIsCalculatingMetrics(false)
          return
      }

      setPadArea(calculatedArea)

      // Calculate thermal mass compensation
      const thermalCompensation = calculateThermalMassCompensation(calculatedArea)
      setPadCategory(thermalCompensation.category)
      setCompensatedTemperature(thermalCompensation.compensatedTemp)

      // Calculate pad volume: Area × Solder Height
      const heightNumeric = Number.parseFloat(solderHeight)
      if (!Number.isFinite(heightNumeric) || heightNumeric <= 0) {
        setPadVolume(null)
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
  // Component navigation items
  const componentNavItems = [
    { id: 'serial-port', label: 'Serial Port' },
    // COMPONENT HEIGHT CONTROL COMMENTED OUT
    // { id: 'component-height', label: 'Component Height' },
    { id: 'manual-movement', label: 'Manual Movement' },
    { id: 'tip-heating', label: 'Tip Heating' },
    { id: 'wire-feed', label: 'Wire Feed' },
    { id: 'spool-wire', label: 'Spool Wire' },
    { id: 'pad-metrics', label: 'Pad Metrics' },
    { id: 'fume-extractor', label: 'Fume Extractor' },
    { id: 'flux-mist', label: 'Flux Mist' },
    { id: 'air-control', label: 'Air Control' },
    { id: 'sequence-monitor', label: 'Sequence Monitor' },
  ]

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
            padCategory={padCategory}
            compensatedTemperature={compensatedTemperature}
            baseTemperature={baseTemperature}
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
            compensatedTemperature={compensatedTemperature}
            baseTemperature={baseTemperature}
            onShapeChange={handlePadShapeChange}
            onDimensionChange={handlePadDimensionChange}
            onSolderHeightChange={handleSolderHeightChange}
            onCalculate={calculatePadMetrics}
            onApplyCompensatedTemperature={handleApplyCompensatedTemperature}
            isCalculating={isCalculatingMetrics}
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
            padPositions={[
              {
                // Single-axis machine: Only Z-axis (X and Y removed)
                z: Number.parseFloat(solderHeight || 0),
              }
            ]}
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
