import { EventEmitter } from 'events'
import SerialPortManager from './SerialPortManager.js'
import CommandProtocol from './CommandProtocol.js'
import MovementController from './MovementController.js'
import TemperatureController from './TemperatureController.js'
import WireFeedController from './WireFeedController.js'
import SequenceController from './SequenceController.js'
import AuxiliaryController from './AuxiliaryController.js'

const initialCalibration = [
  { label: 'Z Axis', value: '000.00 → 000.00', unit: 'mm' },
  { label: 'Wire Remaining', value: 100, unit: '%', length: '14.3 m' },
  { label: 'Flux Remaining', value: 82, unit: '%' },
  { label: 'Tip Temp', value: 290, unit: '°C' },
  { label: 'Feed Rate', value: '8.0', unit: 'mm/s' },
  { label: 'Speed', value: '210', unit: 'mm/s' },
  { label: 'Thermal Duration', value: '--', unit: 'ms' },
]

export default class SolderingHardware extends EventEmitter {
  constructor(options = {}) {
    super()
    this.mode = options.mode || 'simulation'
    this.connected = false
    this.timers = []
    this.serialManager = null
    this.commandProtocol = null
    this.serialConfig = options.serialConfig || {}

    this.calibration = initialCalibration.map((entry) => ({ ...entry }))

    this._initializeControllers()
    this._setupEventForwarding()
    this._initializeHardwareMode()
    this._initializeCalibration()
  }

  _initializeControllers() {
    this.movementController = new MovementController(this.serialManager, this.commandProtocol)
    this.temperatureController = new TemperatureController(this.serialManager)
    this.wireFeedController = new WireFeedController(this.serialManager)
    this.auxiliaryController = new AuxiliaryController(this.serialManager)
    this.sequenceController = new SequenceController(this.movementController, this.wireFeedController, this.auxiliaryController)
    
    // Emergency stop state
    this.emergencyStopActive = false
  }

  _setupEventForwarding() {
    this.movementController.on('position:update', (data) => this.emit('position:update', data))
    this.temperatureController.on('tip', (data) => this.emit('tip', data))
    this.wireFeedController.on('wireFeed', (data) => this.emit('wireFeed', data))
    this.wireFeedController.on('spool', (data) => this.emit('spool', data))
    this.wireFeedController.on('wireBreak', (data) => this.emit('wireBreak', data))
    this.auxiliaryController.on('fan', (data) => this.emit('fan', data))
    this.auxiliaryController.on('fumeExtractor', (data) => this.emit('fumeExtractor', data))
    this.auxiliaryController.on('fluxMist', (data) => this.emit('fluxMist', data))
    this.auxiliaryController.on('flux', (data) => this.emit('flux', data))
    this.auxiliaryController.on('airBreeze', (data) => this.emit('airBreeze', data))
    this.auxiliaryController.on('airJetPressure', (data) => this.emit('airJetPressure', data))
    this.sequenceController.on('sequence', (data) => this.emit('sequence', data))
  }

  _initializeHardwareMode() {
    if (this.mode === 'hardware') {
      console.log("entering hardware mode")
      this.serialManager = new SerialPortManager(this.serialConfig)
      this.commandProtocol = new CommandProtocol(this.serialManager, {
        protocol: this.serialConfig.protocol || 'gcode',
        stepsPerMm: this.serialConfig.stepsPerMm,
      })
      this._updateControllerSerialManagers()
      this._setupSerialEventHandlers()
    }
  }

  _updateControllerSerialManagers() {
    this.movementController.serialManager = this.serialManager
    this.movementController.commandProtocol = this.commandProtocol
    this.temperatureController.serialManager = this.serialManager
    this.wireFeedController.serialManager = this.serialManager
    this.auxiliaryController.serialManager = this.serialManager
  }

  _initializeCalibration() {
    this._updateCalibration('Feed Rate', {
      value: this.wireFeedController.state.wireFeed.currentFeedRate.toFixed(1),
    })
    this._updateZAxisSpeedDisplay()
  }

  async connect(portPath = null, config = {}) {
    console.log('[SolderingHardware] connect() called:', { portPath, config, mode: this.mode, hasSerialManager: !!this.serialManager })

    const isActuallyConnected = this.mode === 'hardware' &&
      this.serialManager &&
      this.serialManager.isConnected &&
      this.serialManager.port &&
      this.serialManager.port.isOpen

    if (this.connected && isActuallyConnected) {
      console.log('[SolderingHardware] Already connected, returning early')
      return { status: 'Already connected' }
    }

    if (this.connected && !isActuallyConnected) {
      console.log('[SolderingHardware] Connection state mismatch detected - resetting connection state')
      this.connected = false
      if (this.serialManager && this.serialManager.isConnected) {
        try {
          await this.serialManager.disconnect()
        } catch (error) {
          console.error('[SolderingHardware] Error disconnecting stale connection:', error)
        }
      }
    }

    if (this.mode === 'hardware') {
      if (!portPath) {
        console.log('[SolderingHardware] No portPath provided, running in simulation mode')
        this.connected = true
        this._startSimulationLoops()
        return { status: 'Connected (simulation mode - no hardware connected)' }
      }

      if (!this.serialManager) {
        console.error('[SolderingHardware] ERROR: serialManager is null! Cannot connect.')
        return { error: 'Serial manager not initialized' }
      }

      try {
        const mergedConfig = { ...this.serialConfig, ...config }
        console.log('[SolderingHardware] Attempting to connect serial port:', { portPath, mergedConfig })
        const result = await this.serialManager.connect(portPath, mergedConfig)

        if (result.error) {
          console.error('[SolderingHardware] Serial connection failed:', result.error)
          return result
        }

        if (!this.serialManager.isConnected || !this.serialManager.port || !this.serialManager.port.isOpen) {
          return { error: 'Connection failed: port not open after connection attempt' }
        }

        this.connected = true
        this._updateControllerSerialManagers()
        this._stopSimulationLoops()
        this._startHardwareStatusPolling()
        console.log('[SolderingHardware] Successfully connected to hardware')
        return result
      } catch (error) {
        console.error('[SolderingHardware] Exception during connection:', error)
        return { error: error.message }
      }
    } else {
      console.log('[SolderingHardware] Running in simulation mode')
      this.connected = true
      this._startSimulationLoops()
      return { status: 'Connected (simulation mode)' }
    }
  }

  async disconnect() {
    if (!this.connected) {
      return { status: 'Already disconnected' }
    }

    this.connected = false
    this._stopSimulationLoops()

    if (this.mode === 'hardware' && this.serialManager) {
      const result = await this.serialManager.disconnect()
      this.connected = true
      this._startSimulationLoops()
      return { ...result, status: 'Disconnected from hardware, running in simulation' }
    }

    return { status: 'Disconnected' }
  }

  getSnapshot() {
    return {
      calibration: this.calibration.map((entry) => ({ ...entry })),
      flux: this.auxiliaryController.getFluxState(),
      fans: this.auxiliaryController.getFanState(),
      fumeExtractor: this.auxiliaryController.getFumeExtractorState(),
      fluxMist: this.auxiliaryController.getFluxMistState(),
      airBreeze: this.auxiliaryController.getAirBreezeState(),
      tip: this.temperatureController.getTipStatus(),
      wireFeed: this.wireFeedController.getWireFeedStatus(),
      spool: this.wireFeedController.getSpoolState(),
      sequence: this.sequenceController.getSequenceState(),
    }
  }

  // Movement methods
  async jog(axis, direction, stepSize) {
    return this.movementController.jog(axis, direction, stepSize)
  }

  async home() {
    return this.movementController.home()
  }

  async saveMovementSequence() {
    return this.movementController.saveMovementSequence()
  }

  getPosition() {
    return this.movementController.getPosition()
  }

  setZAxisSpeed(speed) {
    const result = this.movementController.setZAxisSpeed(speed)
    this._updateZAxisSpeedDisplay()
    return result
  }

  getZAxisSpeed() {
    return this.movementController.state.zAxisSpeed
  }

  setComponentHeight(height, unit = 'mm') {
    return this.movementController.setComponentHeight(height)
  }

  setJigHeight(height, unit = 'mm') {
    return this.movementController.setJigHeight(height)
  }

  getSafeTravelSpace() {
    return this.movementController.getSafeTravelSpace()
  }

  getJigSurfaceFromHome() {
    return this.movementController.state.jigHeightMm !== null ?
      this.movementController.BED_HEIGHT_MM - this.movementController.state.jigHeightMm : null
  }

  getBedHeight() {
    return this.movementController.BED_HEIGHT_MM
  }

  getJigHeight() {
    return this.movementController.state.jigHeightMm
  }

  // Temperature methods
  async setTipTarget(target) {
    return this.temperatureController.setTipTarget(target)
  }

  async setHeaterEnabled(enabled) {
    return this.temperatureController.setHeaterEnabled(enabled)
  }

  getTipStatus() {
    return this.temperatureController.getTipStatus()
  }

  // Wire feed methods
  async startWireFeed(length, rate, skipWireRemainingUpdate = false) {
    return this.wireFeedController.startWireFeed(length, rate, skipWireRemainingUpdate)
  }

  getWireFeedStatus() {
    return this.wireFeedController.getWireFeedStatus()
  }

  getSpoolState() {
    return this.wireFeedController.getSpoolState()
  }

  // Auxiliary methods
  setFanState(fan, enabled) {
    return this.auxiliaryController.setFanState(fan, enabled)
  }

  getFanState() {
    return this.auxiliaryController.getFanState()
  }

  setFumeExtractorEnabled(enabled) {
    return this.auxiliaryController.setFumeExtractorEnabled(enabled)
  }

  getFumeExtractorState() {
    return this.auxiliaryController.getFumeExtractorState()
  }

  async dispenseFluxMist(duration = null, flowRate = null) {
    return this.auxiliaryController.dispenseFluxMist(duration, flowRate)
  }

  getFluxState() {
    return this.auxiliaryController.getFluxState()
  }

  getFluxMistState() {
    return this.auxiliaryController.getFluxMistState()
  }

  async activateAirBreeze(duration = null, intensity = null) {
    return this.auxiliaryController.activateAirBreeze(duration, intensity)
  }

  getAirBreezeState() {
    return this.auxiliaryController.getAirBreezeState()
  }

  setAirBreezeEnabled(enabled) {
    return this.auxiliaryController.setAirBreezeEnabled(enabled)
  }

  async activateAirJetPressure(duration = null, pressure = null) {
    return this.auxiliaryController.activateAirJetPressure(duration, pressure)
  }

  getAirJetPressureState() {
    return this.auxiliaryController.getAirJetPressureState()
  }

  setAirJetPressureEnabled(enabled) {
    return this.auxiliaryController.setAirJetPressureEnabled(enabled)
  }

  // Sequence methods
  async startSequence(padPositions = [], options = {}) {
    return this.sequenceController.startSequence(padPositions, options)
  }

  stopSequence() {
    return this.sequenceController.stopSequence()
  }

  pauseSequence() {
    return this.sequenceController.pauseSequence()
  }

  resumeSequence() {
    return this.sequenceController.resumeSequence()
  }

  getSequenceState() {
    return this.sequenceController.getSequenceState()
  }

  setThermalMassDuration(duration) {
    const result = this.sequenceController.setThermalMassDuration(duration)
    this._updateCalibration('Thermal Duration', { value: duration.toString() })
    return result
  }

  getThermalMassDuration() {
    return this.sequenceController.getThermalMassDuration()
  }

  // Calibration methods
  _updateCalibration(label, updates) {
    const entry = this.calibration.find((item) => item.label === label)
    if (!entry) return
    Object.assign(entry, updates)
    this.emit('calibration', { [label]: { ...updates } })
  }

  _updateCalibrationEntry(label, updates) {
    this._updateCalibration(label, updates)
  }

  _calculateZAxisSpeedMmPerSecond(speedPercent) {
    const Z_STEP_DELAY_MIN = 50
    const Z_STEP_DELAY_MAX = 800
    const Z_STEPS_PER_MM = 3200
    const stepDelayUs = Z_STEP_DELAY_MAX - ((speedPercent - 1) / 99) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN)
    return (1000000 / stepDelayUs) / Z_STEPS_PER_MM
  }

  _updateZAxisSpeedDisplay() {
    const speedMmPerSecond = this._calculateZAxisSpeedMmPerSecond(this.movementController.state.zAxisSpeed)
    this._updateCalibration('Speed', { value: speedMmPerSecond.toFixed(1) })
  }

  // Simulation methods
  _startSimulationLoops() {
    this._stopSimulationLoops()

    this._registerInterval(() => {
      this.auxiliaryController.simulateFlux()
    }, 7000)

    this._registerInterval(() => {
      this.temperatureController.simulateTemperature()
    }, 1500)
  }

  _stopSimulationLoops() {
    this.timers.forEach(({ type, id }) => {
      if (type === 'interval') {
        clearInterval(id)
      } else {
        clearTimeout(id)
      }
    })
    this.timers = []
  }

  _registerInterval(callback, delay) {
    const id = setInterval(callback, delay)
    this.timers.push({ type: 'interval', id })
    return id
  }

  _registerTimeout(callback, delay) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((timer) => timer.id !== id)
      callback()
    }, delay)
    this.timers.push({ type: 'timeout', id })
    return id
  }

  // Serial communication
  _setupSerialEventHandlers() {
    if (!this.serialManager) return

    this.serialManager.on('connected', () => {
      console.log('[SolderingHardware] Serial port connected')
    })

    this.serialManager.on('disconnected', () => {
      console.log('[SolderingHardware] Serial port disconnected')
      this.connected = false
    })

    this.serialManager.on('error', ({ type, error }) => {
      console.error(`[SolderingHardware] Serial error (${type}):`, error)
      this.emit('error', { type, error })
    })

    this.serialManager.on('arduino:data', (updates) => {
      this.emit('arduino:data:received', { timestamp: Date.now(), updates })
      this._handleArduinoData(updates)
    })
  }

  _handleArduinoData(updates) {
    try {
      this.movementController.handleArduinoData(updates)
      this.temperatureController.handleArduinoData(updates)
      this.wireFeedController.handleArduinoData(updates)
      this.auxiliaryController.handleArduinoData(updates)

      if (updates.limitSwitches) {
        const payload = {
          upper: Boolean(updates.limitSwitches.upper),
          lower: Boolean(updates.limitSwitches.lower),
          timestamp: Date.now()
        }
        this.emit('limitSwitch:update', payload)
      }

      // Handle emergency stop (CRITICAL SAFETY FEATURE)
      if (updates.emergencyStop !== undefined) {
        const wasActive = this.emergencyStopActive
        this.emergencyStopActive = Boolean(updates.emergencyStop)
        
        // If E-stop was just activated, stop all operations
        if (this.emergencyStopActive && !wasActive) {
          console.warn('[SolderingHardware] EMERGENCY STOP ACTIVATED!')
          
          // Stop sequence immediately
          if (this.sequenceController.state.sequence.isActive) {
            this.sequenceController.stopSequence()
            console.log('[SolderingHardware] Sequence stopped due to emergency stop')
          }
          
          // Disable heater
          this.temperatureController.setHeaterEnabled(false)
          
          // Emit E-stop event
          this.emit('emergencyStop', {
            active: true,
            timestamp: Date.now()
          })
        } else if (!this.emergencyStopActive && wasActive) {
          // E-stop was released (but still needs reset command)
          console.log('[SolderingHardware] Emergency stop button released (reset required)')
        }
        
        // Always emit current state
        this.emit('emergencyStop:update', {
          active: this.emergencyStopActive,
          timestamp: Date.now()
        })
      }
    } catch (error) {
      console.error('[SolderingHardware] Error handling Arduino data:', error)
    }
  }

  _startHardwareStatusPolling() {
    this._registerInterval(async () => {
      if (this.mode === 'hardware' && this.commandProtocol && this.connected) {
        try {
          await this.commandProtocol.getPosition()
          await this.commandProtocol.getTemperature()
        } catch (error) {
          console.error('[SolderingHardware] Status polling error:', error)
        }
      }
    }, 1000)
  }

  static async listSerialPorts() {
    return SerialPortManager.listPorts()
  }

  getSerialStatus() {
    if (this.mode === 'hardware' && this.serialManager) {
      return this.serialManager.getStatus()
    }
    return { isConnected: false, mode: 'simulation' }
  }

  // Emergency stop methods
  getEmergencyStopState() {
    return {
      active: this.emergencyStopActive,
      timestamp: Date.now()
    }
  }

  async resetEmergencyStop() {
    if (!this.connected || !this.serialManager) {
      return { error: 'Not connected to hardware' }
    }

    if (!this.emergencyStopActive) {
      return { status: 'Emergency stop is not active' }
    }

    try {
      await this.serialManager.sendJsonCommand({
        command: 'reset'
      })
      
      // Note: State will be updated when Arduino sends next status update
      return { status: 'Reset command sent to Arduino' }
    } catch (error) {
      return { error: error.message }
    }
  }
}