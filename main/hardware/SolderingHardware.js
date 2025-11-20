import { EventEmitter } from 'events'
import SerialPortManager from './SerialPortManager.js'
import CommandProtocol from './CommandProtocol.js'

const sequenceStages = [
  { name: 'Positioning X axis', action: 'moveX' },
  { name: 'Positioning Y axis', action: 'moveY' },
  { name: 'Lowering Z axis', action: 'lowerZ' },
  { name: 'Dispensing solder', action: 'dispense' },
  { name: 'Cleaning tip', action: 'cleanTip' },
  { name: 'Retracting head', action: 'retract' },
  { name: 'Advancing to next pad', action: 'advance' },
]

const initialCalibration = [
  { label: 'X Axis', value: '120.00 → 132.50', unit: 'mm' },
  { label: 'Y Axis', value: '045.30 → 048.10', unit: 'mm' },
  { label: 'Z Axis', value: '003.20 → 000.00', unit: 'mm' },
  { label: 'Wire Remaining', value: 100, unit: '%', length: '14.3 m' },
  { label: 'Flux Remaining', value: 82, unit: '%' },
  { label: 'Tip Temp', value: 345, unit: '°C' },
  { label: 'Feed Rate', value: '8.0', unit: 'mm/s' },
  { label: 'Flow Rate', value: '1.0', unit: 'mm³/s' },
  { label: 'Speed', value: '210', unit: 'mm/s' },
]

const ambientTipTemp = 45
const maxFluxMl = 120

// Bed size limits (220mm x 220mm)
const BED_SIZE_X = 220.0 // mm
const BED_SIZE_Y = 220.0 // mm
const MIN_POSITION_X = 0.0 // mm
const MIN_POSITION_Y = 0.0 // mm
const MAX_POSITION_X = BED_SIZE_X // mm
const MAX_POSITION_Y = BED_SIZE_Y // mm

const randomIntInclusive = (min, max) => {
  const lower = Math.ceil(min)
  const upper = Math.floor(max)
  return Math.floor(Math.random() * (upper - lower + 1)) + lower
}

export default class SolderingHardware extends EventEmitter {
  constructor(options = {}) {
    super()

    // Mode: 'simulation' or 'hardware'
    this.mode = options.mode || 'simulation'
    this.connected = false
    this.timers = []

    // Serial port and protocol (only for hardware mode)
    this.serialManager = null
    this.commandProtocol = null
    this.serialConfig = options.serialConfig || {}

    // Setup serial communication if in hardware mode
    if (this.mode === 'hardware') {
      this.serialManager = new SerialPortManager(this.serialConfig)
      this.commandProtocol = new CommandProtocol(this.serialManager, {
        protocol: this.serialConfig.protocol || 'gcode',
        stepsPerMm: this.serialConfig.stepsPerMm,
      })
      this._setupSerialEventHandlers()
    }

    this.state = {
      componentHeightMm: null,
      calibration: initialCalibration.map((entry) => ({ ...entry })),
      fans: { machine: false, tip: false },
      fumeExtractor: {
        enabled: false,
        speed: 80, // 0-100% speed
        autoMode: true, // Auto-activate during soldering
      },
      flux: {
        percentage: 82,
        remainingMl: 68,
        lastUpdated: Date.now(),
      },
      fluxMist: {
        enabled: false,
        isDispensing: false,
        duration: 500, // milliseconds
        flowRate: 50, // 0-100% flow rate
        autoMode: true, // Auto-apply during soldering sequence
        lastDispensed: null,
      },
      airBreeze: {
        enabled: false,
        isActive: false,
        duration: 2000, // milliseconds - default 2 seconds
        intensity: 60, // 0-100% air flow intensity
        autoMode: true, // Auto-activate after soldering
        lastActivated: null,
      },
      airJetPressure: {
        enabled: false,
        isActive: false,
        duration: 200, // milliseconds - default 200ms for quick blast
        pressure: 80, // 0-100% pressure level
        autoMode: true, // Auto-activate after each soldering operation
        lastActivated: null,
      },
      tip: {
        target: 345,
        heaterEnabled: false,
        current: 310,
        statusMessage: 'Heater disabled',
      },
      wireFeed: {
        status: 'idle',
        message: 'Ready to feed',
        currentFeedRate: 8.0, // mm/s - current wire feed rate
        wireBreak: {
          detected: false,
          timestamp: null,
          message: null,
        },
      },
      spool: {
        // Spool physical properties
        spoolDiameter: 50.0, // mm - diameter of the spool (empty core)
        wireDiameter: 0.5, // mm - diameter of the solder wire
        initialWireLength: 10000.0, // mm - initial wire length on spool
        currentWireLength: 10000.0, // mm - current wire length remaining
        // Weight tracking
        solderDensity: 8.5, // g/cm³ - typical solder density (lead-free: ~8.5, leaded: ~9.0)
        // Note: Density is stored in g/cm³ but converted to g/mm³ for calculations
        tareWeight: 0.0, // g - weight offset (set when spool is empty, to zero out spool weight)
        currentWeight: 0.0, // g - current wire weight (calculated from length, will be calculated on first getSpoolState)
        initialWeight: 0.0, // g - initial wire weight when spool was loaded with wire
        isTared: false, // Whether spool has been tared (should be done when empty)
        // Spool rotation tracking
        totalRotations: 0, // total number of rotations
        currentRotation: 0.0, // current rotation angle (0-360 degrees)
        stepsPerRotation: 200, // stepper motor steps per full rotation (1.8° per step)
        stepsPerMm: 8, // steps per mm of wire feed
        // Status
        isFeeding: false,
        lastFeedLength: 0,
        lastUpdated: Date.now(),
        // Cycle tracking
        lastCycleWireLengthUsed: 0, // Total wire length used in last complete PCB cycle (mm)
      },
      sequence: {
        stage: 'idle',
        isActive: false,
        isPaused: false,
        lastCompleted: null,
        index: 0,
        idleCountdown: 0,
        currentPad: 0,
        totalPads: 0,
        padPositions: [],
        progress: 0,
        error: null,
        totalWireLengthUsed: 0, // Total wire length used for complete PCB cycle
        wireLengthPerPad: [], // Array to track wire length used per pad
      },
      position: {
        x: 120.0,
        y: 45.3,
        z: 3.2,
        isMoving: false,
      },
    }

    // Sync Feed Rate calibration with wireFeed state on initialization
    this._updateCalibration('Feed Rate', {
      value: this.state.wireFeed.currentFeedRate.toFixed(1),
    })
  }

  async connect(portPath = null) {
    if (this.connected) {
      return { status: 'Already connected' }
    }

    if (this.mode === 'hardware') {
      if (!portPath) {
        // No port provided - run in simulation mode as fallback
        this.connected = true
        this._startSimulationLoops()
        return { status: 'Connected (simulation mode - no hardware connected)' }
      }

      try {
        const result = await this.serialManager.connect(portPath, this.serialConfig)
        if (result.error) {
          return result
        }

        this.connected = true
        // Stop simulation loops and start hardware status polling
        this._stopSimulationLoops()
        this._startHardwareStatusPolling()
        return result
      } catch (error) {
        return { error: error.message }
      }
    } else {
      // Simulation mode
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

    // Stop hardware status polling or simulation loops
    this._stopSimulationLoops()

    // Disconnect serial port if in hardware mode
    if (this.mode === 'hardware' && this.serialManager) {
      const result = await this.serialManager.disconnect()
      // Restart simulation as fallback
      this.connected = true
      this._startSimulationLoops()
      return { ...result, status: 'Disconnected from hardware, running in simulation' }
    }

    return { status: 'Disconnected' }
  }

  getSnapshot() {
    return {
      calibration: this.state.calibration.map((entry) => ({ ...entry })),
      flux: this.getFluxState(),
      fans: this.getFanState(),
      fumeExtractor: this.getFumeExtractorState(),
      fluxMist: this.getFluxMistState(),
      airBreeze: this.getAirBreezeState(),
      tip: this.getTipStatus(),
      wireFeed: this.getWireFeedStatus(),
      spool: this.getSpoolState(),
      sequence: this.getSequenceState(),
    }
  }

  setComponentHeight(height, unit = 'mm') {
    const numeric = Number.parseFloat(height)
    if (!Number.isFinite(numeric) || numeric < 0) {
      return {
        error: 'Height must be a positive number.',
      }
    }

    this.state.componentHeightMm = numeric
    return {
      status: `Max component height set to ${numeric.toFixed(2)} ${unit}`,
    }
  }

  getFluxState() {
    const payload = this._createFluxPayload()
    this.state.flux.lastUpdated = payload.updatedAt
    return payload
  }

  getFanState() {
    return { ...this.state.fans }
  }

  getFumeExtractorState() {
    return {
      enabled: this.state.fumeExtractor.enabled,
      speed: this.state.fumeExtractor.speed,
      autoMode: this.state.fumeExtractor.autoMode,
    }
  }

  getFluxMistState() {
    return {
      enabled: this.state.fluxMist.enabled,
      isDispensing: this.state.fluxMist.isDispensing,
      duration: this.state.fluxMist.duration,
      flowRate: this.state.fluxMist.flowRate,
      autoMode: this.state.fluxMist.autoMode,
      lastDispensed: this.state.fluxMist.lastDispensed,
    }
  }

  getAirBreezeState() {
    return {
      enabled: this.state.airBreeze.enabled,
      isActive: this.state.airBreeze.isActive,
      duration: this.state.airBreeze.duration,
      intensity: this.state.airBreeze.intensity,
      autoMode: this.state.airBreeze.autoMode,
      lastActivated: this.state.airBreeze.lastActivated,
    }
  }

  getTipStatus() {
    return {
      target: this.state.tip.target,
      heater: this.state.tip.heaterEnabled,
      status: this.state.tip.statusMessage,
      current: Number(this.state.tip.current.toFixed(1)), // Current temperature with 1 decimal for consistency
    }
  }

  getWireFeedStatus() {
    return {
      status: this.state.wireFeed.status,
      message: this.state.wireFeed.message,
      currentFeedRate: this.state.wireFeed.currentFeedRate,
      wireBreak: this.state.wireFeed.wireBreak,
    }
  }

  /**
   * Detect wire break during feeding
   * In hardware mode, this would check:
   * - Motor current/load (sudden drop indicates no resistance)
   * - Encoder feedback (expected vs actual rotation)
   * - Tension sensor readings
   * - Wire presence sensor
   * For simulation, we'll use a configurable detection method
   */
  detectWireBreak() {
    const { wireFeed, spool } = this.state
    
    // Only check during active feeding
    if (wireFeed.status !== 'feeding') {
      return false
    }

    // In hardware mode, check actual sensors/feedback
    if (this.mode === 'hardware' && this.commandProtocol) {
      // TODO: Implement real hardware detection
      // Example: Check motor current, encoder feedback, tension sensor
      // For now, return false (no break detected)
      return false
    }

    // Simulation mode: Random chance for demonstration (can be removed or made configurable)
    // In real implementation, this would be replaced with actual sensor readings
    const breakChance = 0.02 // 2% chance for demo purposes (very low)
    const detected = Math.random() < breakChance

    if (detected) {
      this.state.wireFeed.wireBreak = {
        detected: true,
        timestamp: Date.now(),
        message: 'Wire break detected during feeding!',
      }
      this.state.wireFeed.status = 'error'
      this.state.wireFeed.message = 'Wire break detected - feeding stopped'
      this.state.spool.isFeeding = false
      
      this.emit('wireFeed', this.getWireFeedStatus())
      this.emit('wireBreak', this.state.wireFeed.wireBreak)
      this.emit('spool', this.getSpoolState())
      
      return true
    }

    return false
  }

  /**
   * Clear wire break alert
   */
  clearWireBreak() {
    this.state.wireFeed.wireBreak = {
      detected: false,
      timestamp: null,
      message: null,
    }
    this.emit('wireFeed', this.getWireFeedStatus())
    this.emit('wireBreak', this.state.wireFeed.wireBreak)
  }

  /**
   * Calculate wire weight from length
   * Weight = Volume × Density
   * Volume = π × (wireDiameter/2)² × length (in mm³)
   * Density conversion: 1 g/cm³ = 0.001 g/mm³ (since 1 cm³ = 1000 mm³)
   * All calculations done in mm
   */
  _calculateWireWeight(wireLength) {
    const { spool } = this.state
    const radiusMm = spool.wireDiameter / 2 // Radius in mm
    const lengthMm = wireLength // Length in mm
    const volumeMm3 = Math.PI * radiusMm * radiusMm * lengthMm // Volume in mm³
    // Convert density from g/cm³ to g/mm³: 1 cm³ = 1000 mm³, so divide by 1000
    const densityGPerMm3 = spool.solderDensity / 1000 // Convert g/cm³ to g/mm³
    const weightG = volumeMm3 * densityGPerMm3 // Weight in grams (all in mm)
    return weightG
  }

  getSpoolState() {
    const { spool, sequence } = this.state
    // Calculate effective spool diameter (core + wire layers)
    // Approximate: assume wire wraps in layers
    const wireRadius = spool.wireDiameter / 2
    const layers = Math.floor((spool.initialWireLength - spool.currentWireLength) / (Math.PI * spool.spoolDiameter))
    const effectiveDiameter = spool.spoolDiameter + (layers * 2 * wireRadius)
    
    // Calculate remaining percentage
    const remainingPercentage = (spool.currentWireLength / spool.initialWireLength) * 100
    const remainingLength = spool.currentWireLength
    
    // Calculate current wire weight
    const calculatedWeight = this._calculateWireWeight(spool.currentWireLength)
    // Net weight = calculated weight - tare weight
    // When tared with machine parts but no wire, tareWeight = machine parts weight
    // So netWeight shows only wire weight (excludes machine parts)
    // As wire is loaded, netWeight increases (positive)
    // As wire is used, netWeight decreases (but stays positive until empty)
    const netWeight = calculatedWeight - spool.tareWeight
    
    // Track initial weight when wire is first loaded after taring
    // If tared, has wire, but initialWeight is 0, set it to current weight
    if (spool.isTared && spool.currentWireLength > 0 && spool.initialWeight === 0) {
      spool.initialWeight = calculatedWeight
    }
    
    return {
      spoolDiameter: spool.spoolDiameter,
      wireDiameter: spool.wireDiameter,
      initialWireLength: spool.initialWireLength,
      currentWireLength: spool.currentWireLength,
      remainingPercentage: Math.max(0, Math.min(100, remainingPercentage)),
      remainingLength: Math.max(0, remainingLength),
      totalRotations: spool.totalRotations,
      currentRotation: spool.currentRotation,
      effectiveDiameter: effectiveDiameter,
      isFeeding: spool.isFeeding,
      lastFeedLength: spool.lastFeedLength,
      lastUpdated: spool.lastUpdated,
      // Weight information
      solderDensity: spool.solderDensity,
      currentWeight: calculatedWeight,
      netWeight: netWeight, // Weight after tare (shows only wire weight)
      initialWeight: spool.initialWeight,
      tareWeight: spool.tareWeight,
      isTared: spool.isTared, // Whether spool has been tared
      // Cycle tracking
      lastCycleWireLengthUsed: spool.lastCycleWireLengthUsed || 0, // Total wire length used in last complete PCB cycle (mm)
      // Feed rate (synced with LcdDisplay)
      currentFeedRate: this.state.wireFeed.currentFeedRate || 8.0, // Current wire feed rate in mm/s
    }
  }

  setSpoolConfig(config) {
    const { spoolDiameter, wireDiameter, initialWireLength, solderDensity } = config
    
    if (spoolDiameter !== undefined) {
      const numeric = Number.parseFloat(spoolDiameter)
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return { error: 'Spool diameter must be a positive number.' }
      }
      this.state.spool.spoolDiameter = numeric
    }
    
    if (wireDiameter !== undefined) {
      const numeric = Number.parseFloat(wireDiameter)
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return { error: 'Wire diameter must be a positive number.' }
      }
      this.state.spool.wireDiameter = numeric
    }
    
    if (initialWireLength !== undefined) {
      const numeric = Number.parseFloat(initialWireLength)
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return { error: 'Initial wire length must be a positive number.' }
      }
      this.state.spool.initialWireLength = numeric
      this.state.spool.currentWireLength = numeric
      // Recalculate initial weight (weight of wire when spool is loaded)
      this.state.spool.initialWeight = this._calculateWireWeight(numeric)
      // Update current weight
      this.state.spool.currentWeight = this._calculateWireWeight(numeric)
    }
    
    if (solderDensity !== undefined) {
      const numeric = Number.parseFloat(solderDensity)
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return { error: 'Solder density must be a positive number.' }
      }
      this.state.spool.solderDensity = numeric
    }
    
    // Recalculate current weight
    this.state.spool.currentWeight = this._calculateWireWeight(this.state.spool.currentWireLength)
    
    this.state.spool.lastUpdated = Date.now()
    this.emit('spool', this.getSpoolState())
    return { status: 'Spool configuration updated' }
  }

  /**
   * Tare/Zero the spool weight
   * This should be done when the spool has machine parts attached but NO wire
   * Sets the tare weight to the current calculated weight (machine parts weight)
   * After taring, when wire is loaded, only wire weight will be shown
   * As wire is used, weight will decrease but remain positive
   */
  tareSpool() {
    const { spool } = this.state
    const currentCalculatedWeight = this._calculateWireWeight(spool.currentWireLength)
    
    // Set tare weight to current weight (machine parts weight when no wire)
    // This zeros out the machine parts weight, so only wire weight is shown
    spool.tareWeight = currentCalculatedWeight
    spool.isTared = true // Mark as tared
    
    // Reset initial weight - it will be set when wire is first loaded
    spool.initialWeight = 0
    
    spool.lastUpdated = Date.now()
    this.emit('spool', this.getSpoolState())
    return { 
      status: spool.currentWireLength === 0 
        ? 'Spool weight tared (zeroed) - machine parts weight excluded. Ready to load wire.'
        : 'Spool weight tared (zeroed) - wire weight will be tracked from now',
      tareWeight: spool.tareWeight,
      currentWireLength: spool.currentWireLength,
    }
  }

  resetSpool() {
    this.state.spool.currentWireLength = this.state.spool.initialWireLength
    this.state.spool.totalRotations = 0
    this.state.spool.currentRotation = 0
    this.state.spool.lastFeedLength = 0
    // Reset weight calculations
    this.state.spool.currentWeight = this._calculateWireWeight(this.state.spool.initialWireLength)
    // Note: tareWeight and isTared are NOT reset - user must manually tare again if needed
    // This preserves the tare setting even after reset
    this.state.spool.lastUpdated = Date.now()
    
    // Update wire remaining in calibration (uses same method for consistency)
    this._updateWireRemainingDisplay()
    
    this.emit('spool', this.getSpoolState())
    return { status: 'Spool reset to initial state' }
  }

  getSequenceState() {
    const { stage, isActive, isPaused, lastCompleted, currentPad, totalPads, progress, error, totalWireLengthUsed, wireLengthPerPad } = this.state.sequence
    return { 
      stage, 
      isActive, 
      isPaused,
      lastCompleted, 
      currentPad,
      totalPads,
      progress,
      error,
      totalWireLengthUsed: totalWireLengthUsed || 0,
      wireLengthPerPad: wireLengthPerPad || [],
    }
  }

  getPosition() {
    return {
      x: this.state.position.x,
      y: this.state.position.y,
      z: this.state.position.z,
      isMoving: this.state.position.isMoving,
    }
  }

  async jog(axis, direction, stepSize) {
    if (this.state.position.isMoving) {
      return { error: 'Machine is already moving' }
    }

    const axisMap = { x: 'x', y: 'y', z: 'z' }
    const axisKey = axisMap[axis.toLowerCase()]
    if (!axisKey) {
      return { error: 'Invalid axis. Use x, y, or z' }
    }

    const step = direction > 0 ? stepSize : -stepSize
    
    // Calculate new position
    const currentPos = this.state.position[axisKey]
    const newPos = currentPos + step
    
    // Boundary checking for X and Y axes (bed size limits)
    if (axisKey === 'x') {
      if (newPos < MIN_POSITION_X) {
        return { error: `Cannot move X axis below ${MIN_POSITION_X}mm (bed limit)` }
      }
      if (newPos > MAX_POSITION_X) {
        return { error: `Cannot move X axis above ${MAX_POSITION_X}mm (bed limit)` }
      }
    }
    
    if (axisKey === 'y') {
      if (newPos < MIN_POSITION_Y) {
        return { error: `Cannot move Y axis below ${MIN_POSITION_Y}mm (bed limit)` }
      }
      if (newPos > MAX_POSITION_Y) {
        return { error: `Cannot move Y axis above ${MAX_POSITION_Y}mm (bed limit)` }
      }
    }
    
    this.state.position.isMoving = true
    this.emit('position:update', this.getPosition())

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        // Send real movement command
        await this.commandProtocol.moveRelative(axis, step)
        
        // Update position (will be confirmed by status polling)
        this.state.position[axisKey] += step
        this.state.position.isMoving = false

        this._updateCalibrationEntry(
          `${axis.toUpperCase()} Axis`,
          {
            value: `${this.state.position[axisKey].toFixed(2)}`,
          }
        )

        this.emit('position:update', this.getPosition())
        return { status: 'Movement completed', position: this.getPosition() }
      } catch (error) {
        this.state.position.isMoving = false
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.position[axisKey] += step
          this.state.position.isMoving = false

          this._updateCalibrationEntry(
            `${axis.toUpperCase()} Axis`,
            {
              value: `${this.state.position[axisKey].toFixed(2)}`,
            }
          )

          this.emit('position:update', this.getPosition())
          resolve({ status: 'Movement completed', position: this.getPosition() })
        }, 300)
      })
    }
  }

  async home() {
    if (this.state.position.isMoving) {
      return { error: 'Machine is already moving' }
    }

    this.state.position.isMoving = true
    this.emit('position:update', this.getPosition())

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        // Send real home command
        await this.commandProtocol.home()
        
        // Update position
        this.state.position.x = 0
        this.state.position.y = 0
        this.state.position.z = 0
        this.state.position.isMoving = false

        this._updateCalibrationEntry('X Axis', { value: '0.00' })
        this._updateCalibrationEntry('Y Axis', { value: '0.00' })
        this._updateCalibrationEntry('Z Axis', { value: '0.00' })

        this.emit('position:update', this.getPosition())
        return { status: 'Homed to zero position', position: this.getPosition() }
      } catch (error) {
        this.state.position.isMoving = false
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.position.x = 0
          this.state.position.y = 0
          this.state.position.z = 0
          this.state.position.isMoving = false

          this._updateCalibrationEntry('X Axis', { value: '0.00' })
          this._updateCalibrationEntry('Y Axis', { value: '0.00' })
          this._updateCalibrationEntry('Z Axis', { value: '0.00' })

          this.emit('position:update', this.getPosition())
          resolve({ status: 'Homed to zero position', position: this.getPosition() })
        }, 500)
      })
    }
  }

  setFanState(fan, enabled) {
    if (fan !== 'machine' && fan !== 'tip') {
      return {
        error: 'Unknown fan selection.',
      }
    }

    this.state.fans[fan] = Boolean(enabled)
    this.emit('fan', this.getFanState())
    return { status: this.getFanState() }
  }

  setFumeExtractorEnabled(enabled) {
    this.state.fumeExtractor.enabled = Boolean(enabled)
    
    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        if (enabled) {
          this.commandProtocol.setFumeExtractor(this.state.fumeExtractor.speed)
        } else {
          this.commandProtocol.turnOffFumeExtractor()
        }
      } catch (error) {
        console.error('[SolderingHardware] Error controlling fume extractor:', error)
      }
    }
    
    this.emit('fumeExtractor', this.getFumeExtractorState())
    return { status: this.getFumeExtractorState() }
  }

  setFumeExtractorSpeed(speed) {
    const speedNumeric = Number.parseFloat(speed)
    if (!Number.isFinite(speedNumeric) || speedNumeric < 0 || speedNumeric > 100) {
      return {
        error: 'Fume extractor speed must be between 0 and 100.',
      }
    }

    this.state.fumeExtractor.speed = Math.round(speedNumeric)
    
    // If extractor is enabled, update hardware immediately
    if (this.state.fumeExtractor.enabled && this.mode === 'hardware' && this.commandProtocol) {
      try {
        this.commandProtocol.setFumeExtractor(this.state.fumeExtractor.speed)
      } catch (error) {
        console.error('[SolderingHardware] Error setting fume extractor speed:', error)
      }
    }
    
    this.emit('fumeExtractor', this.getFumeExtractorState())
    return { status: this.getFumeExtractorState() }
  }

  setFumeExtractorAutoMode(autoMode) {
    this.state.fumeExtractor.autoMode = Boolean(autoMode)
    this.emit('fumeExtractor', this.getFumeExtractorState())
    return { status: this.getFumeExtractorState() }
  }

  /**
   * Dispense flux mist
   * @param {number} duration - Duration in milliseconds (optional, uses default if not provided)
   * @param {number} flowRate - Flow rate 0-100% (optional, uses default if not provided)
   */
  async dispenseFluxMist(duration = null, flowRate = null) {
    // Check if flux is available
    if (this.state.flux.percentage <= 0 || this.state.flux.remainingMl <= 0) {
      const error = 'No flux available. Please refill flux container.'
      this.emit('fluxMist', this.getFluxMistState())
      return { error }
    }

    // Use provided values or defaults
    const dispenseDuration = duration !== null ? duration : this.state.fluxMist.duration
    const dispenseFlowRate = flowRate !== null ? flowRate : this.state.fluxMist.flowRate

    // Validate duration
    const durationNumeric = Number.parseFloat(dispenseDuration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return { error: 'Duration must be greater than zero.' }
    }

    // Validate flow rate
    const flowRateNumeric = Number.parseFloat(dispenseFlowRate)
    if (!Number.isFinite(flowRateNumeric) || flowRateNumeric < 0 || flowRateNumeric > 100) {
      return { error: 'Flow rate must be between 0 and 100.' }
    }

    // Check if already dispensing
    if (this.state.fluxMist.isDispensing) {
      return { error: 'Flux mist is already dispensing.' }
    }

    this.state.fluxMist.isDispensing = true
    this.emit('fluxMist', this.getFluxMistState())

    // Calculate flux consumption (approximate: 0.1-0.5 ml per second depending on flow rate)
    const fluxConsumptionPerSecond = (flowRateNumeric / 100) * 0.3 // Max 0.3 ml/s at 100%
    const fluxConsumption = (durationNumeric / 1000) * fluxConsumptionPerSecond

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        await this.commandProtocol.dispenseFluxMist(durationNumeric, flowRateNumeric)
        
        // Wait for duration
        await new Promise(resolve => setTimeout(resolve, durationNumeric))
        
        // Update flux consumption
        this.state.flux.remainingMl = Math.max(0, this.state.flux.remainingMl - fluxConsumption)
        this.state.flux.percentage = Math.max(0, (this.state.flux.remainingMl / maxFluxMl) * 100)
        this._updateCalibration('Flux Remaining', { value: Math.round(this.state.flux.percentage) })
        this._emitFlux()
        
        this.state.fluxMist.isDispensing = false
        this.state.fluxMist.lastDispensed = Date.now()
        this.emit('fluxMist', this.getFluxMistState())
        
        return { status: `Flux mist dispensed for ${durationNumeric}ms at ${flowRateNumeric}% flow rate` }
      } catch (error) {
        this.state.fluxMist.isDispensing = false
        this.emit('fluxMist', this.getFluxMistState())
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return new Promise((resolve) => {
        setTimeout(() => {
          // Update flux consumption
          this.state.flux.remainingMl = Math.max(0, this.state.flux.remainingMl - fluxConsumption)
          this.state.flux.percentage = Math.max(0, (this.state.flux.remainingMl / maxFluxMl) * 100)
          this._updateCalibration('Flux Remaining', { value: Math.round(this.state.flux.percentage) })
          this._emitFlux()
          
          this.state.fluxMist.isDispensing = false
          this.state.fluxMist.lastDispensed = Date.now()
          this.emit('fluxMist', this.getFluxMistState())
          
          resolve({ status: `Flux mist dispensed for ${durationNumeric}ms at ${flowRateNumeric}% flow rate` })
        }, durationNumeric)
      })
    }
  }

  setFluxMistDuration(duration) {
    const durationNumeric = Number.parseFloat(duration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return {
        error: 'Duration must be greater than zero.',
      }
    }

    this.state.fluxMist.duration = Math.round(durationNumeric)
    this.emit('fluxMist', this.getFluxMistState())
    return { status: this.getFluxMistState() }
  }

  setFluxMistFlowRate(flowRate) {
    const flowRateNumeric = Number.parseFloat(flowRate)
    if (!Number.isFinite(flowRateNumeric) || flowRateNumeric < 0 || flowRateNumeric > 100) {
      return {
        error: 'Flow rate must be between 0 and 100.',
      }
    }

    this.state.fluxMist.flowRate = Math.round(flowRateNumeric)
    this.emit('fluxMist', this.getFluxMistState())
    return { status: this.getFluxMistState() }
  }

  setFluxMistAutoMode(autoMode) {
    this.state.fluxMist.autoMode = Boolean(autoMode)
    this.emit('fluxMist', this.getFluxMistState())
    return { status: this.getFluxMistState() }
  }

  /**
   * Activate air breeze for cooling
   * @param {number} duration - Duration in milliseconds (optional, uses default if not provided)
   * @param {number} intensity - Intensity 0-100% (optional, uses default if not provided)
   */
  async activateAirBreeze(duration = null, intensity = null) {
    // Use provided values or defaults
    const breezeDuration = duration !== null ? duration : this.state.airBreeze.duration
    const breezeIntensity = intensity !== null ? intensity : this.state.airBreeze.intensity

    // Validate duration
    const durationNumeric = Number.parseFloat(breezeDuration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return { error: 'Duration must be greater than zero.' }
    }

    // Validate intensity
    const intensityNumeric = Number.parseFloat(breezeIntensity)
    if (!Number.isFinite(intensityNumeric) || intensityNumeric < 0 || intensityNumeric > 100) {
      return { error: 'Intensity must be between 0 and 100.' }
    }

    // Check if already active
    if (this.state.airBreeze.isActive) {
      return { error: 'Air breeze is already active.' }
    }

    // Check if air jet pressure is active (mutual exclusion - only one valve can be active at a time)
    if (this.state.airJetPressure.isActive) {
      return { error: 'Air jet pressure is currently active. Please wait for it to complete before activating air breeze.' }
    }

    this.state.airBreeze.isActive = true
    this.state.airBreeze.enabled = true
    this.emit('airBreeze', this.getAirBreezeState())

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        await this.commandProtocol.activateAirBreeze(durationNumeric, intensityNumeric)
        
        // Wait for duration
        await new Promise(resolve => setTimeout(resolve, durationNumeric))
        
        this.state.airBreeze.isActive = false
        this.state.airBreeze.lastActivated = Date.now()
        this.emit('airBreeze', this.getAirBreezeState())
        
        return { status: `Air breeze activated for ${durationNumeric}ms at ${intensityNumeric}% intensity` }
      } catch (error) {
        this.state.airBreeze.isActive = false
        this.emit('airBreeze', this.getAirBreezeState())
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.airBreeze.isActive = false
          this.state.airBreeze.lastActivated = Date.now()
          this.emit('airBreeze', this.getAirBreezeState())
          
          resolve({ status: `Air breeze activated for ${durationNumeric}ms at ${intensityNumeric}% intensity` })
        }, durationNumeric)
      })
    }
  }

  setAirBreezeEnabled(enabled) {
    this.state.airBreeze.enabled = Boolean(enabled)
    
    // If disabling while active, stop it
    if (!enabled && this.state.airBreeze.isActive) {
      this.state.airBreeze.isActive = false
      if (this.mode === 'hardware' && this.commandProtocol) {
        try {
          this.commandProtocol.deactivateAirBreeze()
        } catch (error) {
          console.error('[SolderingHardware] Error deactivating air breeze:', error)
        }
      }
    }
    
    this.emit('airBreeze', this.getAirBreezeState())
    return { status: this.getAirBreezeState() }
  }

  setAirBreezeDuration(duration) {
    const durationNumeric = Number.parseFloat(duration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return {
        error: 'Duration must be greater than zero.',
      }
    }

    this.state.airBreeze.duration = Math.round(durationNumeric)
    this.emit('airBreeze', this.getAirBreezeState())
    return { status: this.getAirBreezeState() }
  }

  setAirBreezeIntensity(intensity) {
    const intensityNumeric = Number.parseFloat(intensity)
    if (!Number.isFinite(intensityNumeric) || intensityNumeric < 0 || intensityNumeric > 100) {
      return {
        error: 'Intensity must be between 0 and 100.',
      }
    }

    this.state.airBreeze.intensity = Math.round(intensityNumeric)
    
    // If air breeze is active, update hardware immediately
    if (this.state.airBreeze.isActive && this.mode === 'hardware' && this.commandProtocol) {
      try {
        this.commandProtocol.activateAirBreeze(this.state.airBreeze.duration, this.state.airBreeze.intensity)
      } catch (error) {
        console.error('[SolderingHardware] Error updating air breeze intensity:', error)
      }
    }
    
    this.emit('airBreeze', this.getAirBreezeState())
    return { status: this.getAirBreezeState() }
  }

  setAirBreezeAutoMode(autoMode) {
    this.state.airBreeze.autoMode = Boolean(autoMode)
    this.emit('airBreeze', this.getAirBreezeState())
    return { status: this.getAirBreezeState() }
  }

  /**
   * Get air jet pressure state
   */
  getAirJetPressureState() {
    return {
      enabled: this.state.airJetPressure.enabled,
      isActive: this.state.airJetPressure.isActive,
      duration: this.state.airJetPressure.duration,
      pressure: this.state.airJetPressure.pressure,
      autoMode: this.state.airJetPressure.autoMode,
      lastActivated: this.state.airJetPressure.lastActivated,
    }
  }

  /**
   * Activate air jet pressure for tip cleaning
   * @param {number} duration - Duration in milliseconds (optional, uses default if not provided)
   * @param {number} pressure - Pressure 0-100% (optional, uses default if not provided)
   */
  async activateAirJetPressure(duration = null, pressure = null) {
    // Use provided values or defaults
    const jetDuration = duration !== null ? duration : this.state.airJetPressure.duration
    const jetPressure = pressure !== null ? pressure : this.state.airJetPressure.pressure

    // Validate duration
    const durationNumeric = Number.parseFloat(jetDuration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return { error: 'Duration must be greater than zero.' }
    }

    // Validate pressure
    const pressureNumeric = Number.parseFloat(jetPressure)
    if (!Number.isFinite(pressureNumeric) || pressureNumeric < 0 || pressureNumeric > 100) {
      return { error: 'Pressure must be between 0 and 100.' }
    }

    // Check if already active
    if (this.state.airJetPressure.isActive) {
      return { error: 'Air jet pressure is already active.' }
    }

    // Check if air breeze is active (mutual exclusion - only one valve can be active at a time)
    if (this.state.airBreeze.isActive) {
      return { error: 'Air breeze is currently active. Please wait for it to complete before activating air jet pressure.' }
    }

    this.state.airJetPressure.isActive = true
    this.state.airJetPressure.enabled = true
    this.emit('airJetPressure', this.getAirJetPressureState())

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        await this.commandProtocol.activateAirJetPressure(durationNumeric, pressureNumeric)
        
        // Wait for duration
        await new Promise(resolve => setTimeout(resolve, durationNumeric))
        
        this.state.airJetPressure.isActive = false
        this.state.airJetPressure.lastActivated = Date.now()
        this.emit('airJetPressure', this.getAirJetPressureState())
        
        return { status: `Air jet pressure activated for ${durationNumeric}ms at ${pressureNumeric}% pressure` }
      } catch (error) {
        this.state.airJetPressure.isActive = false
        this.emit('airJetPressure', this.getAirJetPressureState())
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.airJetPressure.isActive = false
          this.state.airJetPressure.lastActivated = Date.now()
          this.emit('airJetPressure', this.getAirJetPressureState())
          
          resolve({ status: `Air jet pressure activated for ${durationNumeric}ms at ${pressureNumeric}% pressure` })
        }, durationNumeric)
      })
    }
  }

  setAirJetPressureEnabled(enabled) {
    this.state.airJetPressure.enabled = Boolean(enabled)
    
    // If disabling while active, stop it
    if (!enabled && this.state.airJetPressure.isActive) {
      this.state.airJetPressure.isActive = false
      if (this.mode === 'hardware' && this.commandProtocol) {
        try {
          this.commandProtocol.deactivateAirJetPressure()
        } catch (error) {
          console.error('[SolderingHardware] Error deactivating air jet pressure:', error)
        }
      }
    }
    
    this.emit('airJetPressure', this.getAirJetPressureState())
    return { status: this.getAirJetPressureState() }
  }

  setAirJetPressureDuration(duration) {
    const durationNumeric = Number.parseFloat(duration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return {
        error: 'Duration must be greater than zero.',
      }
    }

    this.state.airJetPressure.duration = Math.round(durationNumeric)
    this.emit('airJetPressure', this.getAirJetPressureState())
    return { status: this.getAirJetPressureState() }
  }

  setAirJetPressurePressure(pressure) {
    const pressureNumeric = Number.parseFloat(pressure)
    if (!Number.isFinite(pressureNumeric) || pressureNumeric < 0 || pressureNumeric > 100) {
      return {
        error: 'Pressure must be between 0 and 100.',
      }
    }

    this.state.airJetPressure.pressure = Math.round(pressureNumeric)
    
    // If air jet is active, update hardware immediately
    if (this.state.airJetPressure.isActive && this.mode === 'hardware' && this.commandProtocol) {
      try {
        this.commandProtocol.activateAirJetPressure(this.state.airJetPressure.duration, this.state.airJetPressure.pressure)
      } catch (error) {
        console.error('[SolderingHardware] Error updating air jet pressure:', error)
      }
    }
    
    this.emit('airJetPressure', this.getAirJetPressureState())
    return { status: this.getAirJetPressureState() }
  }

  setAirJetPressureAutoMode(autoMode) {
    this.state.airJetPressure.autoMode = Boolean(autoMode)
    this.emit('airJetPressure', this.getAirJetPressureState())
    return { status: this.getAirJetPressureState() }
  }

  async setTipTarget(target) {
    const numeric = Number.parseFloat(target)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      const error = 'Target temperature must be positive.'
      this.state.tip.statusMessage = error
      this.emit('tip', this.getTipStatus())
      return { error }
    }

    this.state.tip.target = numeric
    this.state.tip.statusMessage = `Target set to ${numeric.toFixed(0)}°C`

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        await this.commandProtocol.setTemperature(numeric)
      } catch (error) {
        console.error('[SolderingHardware] Error setting temperature:', error)
      }
    }

    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }

  async setHeaterEnabled(enabled) {
    this.state.tip.heaterEnabled = Boolean(enabled)
    this.state.tip.statusMessage = this.state.tip.heaterEnabled ? 'Heater enabled' : 'Heater disabled'

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        await this.commandProtocol.setHeaterEnabled(enabled)
      } catch (error) {
        console.error('[SolderingHardware] Error setting heater:', error)
      }
    }

    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }

  async startWireFeed(length, rate, skipWireRemainingUpdate = false) {
    const lengthNumeric = Number.parseFloat(length)
    const rateNumeric = Number.parseFloat(rate)

    if (!Number.isFinite(lengthNumeric) || lengthNumeric <= 0) {
      const error = 'Wire length must be greater than zero.'
      this.state.wireFeed.status = 'error'
      this.state.wireFeed.message = error
      this.emit('wireFeed', this.getWireFeedStatus())
      return { error }
    }

    if (!Number.isFinite(rateNumeric) || rateNumeric <= 0) {
      const error = 'Wire feed rate must be greater than zero.'
      this.state.wireFeed.status = 'error'
      this.state.wireFeed.message = error
      this.emit('wireFeed', this.getWireFeedStatus())
      return { error }
    }

    // Check if enough wire is available on spool
    if (lengthNumeric > this.state.spool.currentWireLength) {
      const error = `Insufficient wire. Requested: ${lengthNumeric.toFixed(1)} mm, Available: ${this.state.spool.currentWireLength.toFixed(1)} mm`
      this.state.wireFeed.status = 'error'
      this.state.wireFeed.message = error
      this.emit('wireFeed', this.getWireFeedStatus())
      return { error }
    }

    this.state.wireFeed.status = 'feeding'
    this.state.wireFeed.message = `Feeding ${lengthNumeric.toFixed(1)} mm at ${rateNumeric.toFixed(1)} mm/s`
    this.state.wireFeed.currentFeedRate = rateNumeric // Store current feed rate
    this.state.spool.isFeeding = true
    this.state.spool.lastFeedLength = lengthNumeric
    
    // Update calibration display (LCD) - sync feed rate
    this._updateCalibration('Feed Rate', {
      value: rateNumeric.toFixed(1), // 1 decimal for consistency
    })
    
    this.emit('wireFeed', this.getWireFeedStatus())
    this.emit('spool', this.getSpoolState())

    // Calculate spool rotation needed for this wire length
    const { spool } = this.state
    const effectiveDiameter = spool.spoolDiameter + (spool.wireDiameter * 2) // Approximate effective diameter
    const circumference = Math.PI * effectiveDiameter // mm per rotation
    const rotationsNeeded = lengthNumeric / circumference
    const stepsNeeded = Math.round(rotationsNeeded * spool.stepsPerRotation)

    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        // Feed wire and rotate spool
        await this.commandProtocol.feedWire(lengthNumeric, rateNumeric)
        await this.commandProtocol.rotateSpool(stepsNeeded, rateNumeric)
        
        const durationMs = Math.max(1200, (lengthNumeric / rateNumeric) * 1000)
        
        // Check for wire break during feeding (periodic checks)
        const checkInterval = Math.max(200, durationMs / 10) // Check 10 times during feed
        let checksDone = 0
        const maxChecks = Math.floor(durationMs / checkInterval)
        let breakCheckIntervalId = null
        
        breakCheckIntervalId = this._registerInterval(() => {
          checksDone++
          if (this.detectWireBreak()) {
            // Wire break detected, stop checking
            if (breakCheckIntervalId) {
              clearInterval(breakCheckIntervalId)
              this.timers = this.timers.filter(t => t.id !== breakCheckIntervalId)
            }
            return
          }
          
          // Stop checking if feed should be complete
          if (checksDone >= maxChecks) {
            if (breakCheckIntervalId) {
              clearInterval(breakCheckIntervalId)
              this.timers = this.timers.filter(t => t.id !== breakCheckIntervalId)
            }
          }
        }, checkInterval)
        
        this._registerTimeout(() => {
          // Final check for wire break before completing
          if (this.state.wireFeed.wireBreak.detected) {
            // Wire break was detected, don't update spool
            return
          }
          
          // Update spool state after feed completes
          this._updateSpoolAfterFeed(lengthNumeric, rotationsNeeded, skipWireRemainingUpdate)
          
          this.state.wireFeed.status = 'completed'
          this.state.wireFeed.message = `Completed feed of ${lengthNumeric.toFixed(1)} mm`
          this.state.spool.isFeeding = false
          this.emit('wireFeed', {
            ...this.getWireFeedStatus(),
            completedAt: Date.now(),
          })
          this.emit('spool', this.getSpoolState())
        }, durationMs)
      } catch (error) {
        this.state.wireFeed.status = 'error'
        this.state.wireFeed.message = `Error: ${error.message}`
        this.state.spool.isFeeding = false
        this.emit('wireFeed', this.getWireFeedStatus())
        this.emit('spool', this.getSpoolState())
        return { error: error.message }
      }
    } else {
      // Simulation mode
      const durationMs = Math.max(1200, (lengthNumeric / rateNumeric) * 1000)
      
      // Check for wire break during feeding (periodic checks)
      const checkInterval = Math.max(200, durationMs / 10) // Check 10 times during feed
      let checksDone = 0
      const maxChecks = Math.floor(durationMs / checkInterval)
      let breakCheckIntervalId = null
      
      breakCheckIntervalId = this._registerInterval(() => {
        checksDone++
        if (this.detectWireBreak()) {
          // Wire break detected, stop checking
          if (breakCheckIntervalId) {
            clearInterval(breakCheckIntervalId)
            this.timers = this.timers.filter(t => t.id !== breakCheckIntervalId)
          }
          return
        }
        
        // Stop checking if feed should be complete
        if (checksDone >= maxChecks) {
          if (breakCheckIntervalId) {
            clearInterval(breakCheckIntervalId)
            this.timers = this.timers.filter(t => t.id !== breakCheckIntervalId)
          }
        }
      }, checkInterval)
      
      this._registerTimeout(() => {
        // Final check for wire break before completing
        if (this.state.wireFeed.wireBreak.detected) {
          // Wire break was detected, don't update spool
          return
        }
        
        // Update spool state after feed completes
        this._updateSpoolAfterFeed(lengthNumeric, rotationsNeeded, skipWireRemainingUpdate)
        
        this.state.wireFeed.status = 'completed'
        this.state.wireFeed.message = `Completed feed of ${lengthNumeric.toFixed(1)} mm`
        this.state.spool.isFeeding = false
        this.emit('wireFeed', {
          ...this.getWireFeedStatus(),
          completedAt: Date.now(),
        })
        this.emit('spool', this.getSpoolState())
      }, durationMs)
    }

    return { status: this.state.wireFeed.message }
  }

  _updateSpoolAfterFeed(feedLength, rotations, skipWireRemainingUpdate = false) {
    const { spool } = this.state
    
    // Update wire remaining (skip during sequence - will update after complete cycle)
    if (!skipWireRemainingUpdate) {
      spool.currentWireLength = Math.max(0, spool.currentWireLength - feedLength)
      // Update weight (recalculate from current length)
      spool.currentWeight = this._calculateWireWeight(spool.currentWireLength)
      // Update wire remaining in calibration display
      this._updateWireRemainingDisplay()
    }
    // Note: During sequence, we skip updating currentWireLength here
    // It will be updated once after complete cycle in _updateSpoolAfterCompleteCycle
    
    // Update rotation tracking (always update, even during sequence)
    spool.totalRotations += rotations
    spool.currentRotation = (spool.currentRotation + (rotations * 360)) % 360
    
    spool.lastUpdated = Date.now()
  }

  /**
   * Update wire remaining after complete PCB cycle
   * @param {number} totalWireLengthUsed - Total wire length used in mm for complete cycle
   */
  _updateSpoolAfterCompleteCycle(totalWireLengthUsed) {
    const { spool } = this.state
    
    // Update wire remaining
    spool.currentWireLength = Math.max(0, spool.currentWireLength - totalWireLengthUsed)
    
    // Update weight (recalculate from current length)
    spool.currentWeight = this._calculateWireWeight(spool.currentWireLength)
    
    // Update wire remaining in calibration display (LCD)
    this._updateWireRemainingDisplay()
    
    // Store total wire length used for this cycle
    spool.lastCycleWireLengthUsed = totalWireLengthUsed
    
    spool.lastUpdated = Date.now()
    
    // Emit spool update
    this.emit('spool', this.getSpoolState())
  }

  /**
   * Update wire remaining display in calibration (LCD)
   * Uses same calculation and formatting as getSpoolState() for consistency
   */
  _updateWireRemainingDisplay() {
    const { spool } = this.state
    // Use exact same calculation as getSpoolState() for consistency
    const remainingPercentage = (spool.currentWireLength / spool.initialWireLength) * 100
    const clampedPercentage = Math.max(0, Math.min(100, remainingPercentage))
    const remainingLength = spool.currentWireLength / 1000 // convert to meters
    
    // Format to match SpoolWireControl display (1 decimal for percentage, 2 decimals for length)
    this._updateCalibration('Wire Remaining', {
      value: clampedPercentage.toFixed(1), // 1 decimal to match SpoolWireControl
      length: `${remainingLength.toFixed(2)} m`, // 2 decimals to match SpoolWireControl
    })
  }

  handleWireAlert(payload) {
    console.log('[wire:alert]', payload)
  }

  /**
   * Start sequence execution
   * @param {Array} padPositions - Array of {x, y, z} positions for each pad
   * @param {Object} options - Configuration options (wireLength, etc.)
   */
  async startSequence(padPositions = [], options = {}) {
    if (this.state.sequence.isActive) {
      return { error: 'Sequence is already running' }
    }

    if (this.state.position.isMoving) {
      return { error: 'Machine is currently moving' }
    }

    // Default to single pad at current position if none provided
    const pads = padPositions.length > 0 
      ? padPositions 
      : [{ x: this.state.position.x, y: this.state.position.y, z: 0 }]

    this.state.sequence.isActive = true
    this.state.sequence.isPaused = false
    this.state.sequence.currentPad = 0
    this.state.sequence.totalPads = pads.length
    this.state.sequence.padPositions = pads
    this.state.sequence.index = 0
    this.state.sequence.progress = 0
    this.state.sequence.error = null
    this.state.sequence.stage = 'idle'
    this.state.sequence.wireLength = options.wireLength || null // Store wire length for dispense stage
    this.state.sequence.totalWireLengthUsed = 0 // Reset total wire length for new cycle
    this.state.sequence.wireLengthPerPad = [] // Reset wire length per pad tracking

    this.emit('sequence', this.getSequenceState())

    // Start execution
    this._executeSequence()

    return { status: 'Sequence started', totalPads: pads.length }
  }

  /**
   * Stop sequence execution
   */
  stopSequence() {
    if (!this.state.sequence.isActive) {
      return { status: 'Sequence is not running' }
    }

    this.state.sequence.isActive = false
    this.state.sequence.isPaused = false
    this.state.sequence.stage = 'idle'
    this.state.sequence.error = 'Stopped by user'
    this.emit('sequence', this.getSequenceState())

    return { status: 'Sequence stopped' }
  }

  /**
   * Pause sequence execution
   */
  pauseSequence() {
    if (!this.state.sequence.isActive) {
      return { status: 'Sequence is not running' }
    }

    if (this.state.sequence.isPaused) {
      return { status: 'Sequence is already paused' }
    }

    this.state.sequence.isPaused = true
    this.emit('sequence', this.getSequenceState())

    return { status: 'Sequence paused' }
  }

  /**
   * Resume sequence execution
   */
  resumeSequence() {
    if (!this.state.sequence.isActive) {
      return { error: 'Sequence is not running' }
    }

    if (!this.state.sequence.isPaused) {
      return { status: 'Sequence is not paused' }
    }

    this.state.sequence.isPaused = false
    this.emit('sequence', this.getSequenceState())

    // Continue execution
    this._executeSequence()

    return { status: 'Sequence resumed' }
  }

  /**
   * Execute sequence steps
   */
  async _executeSequence() {
    const sequence = this.state.sequence

    // Check if sequence should continue
    if (!sequence.isActive || sequence.isPaused) {
      return
    }

    // Check if all pads are complete
    if (sequence.currentPad >= sequence.totalPads) {
      sequence.isActive = false
      sequence.stage = 'idle'
      sequence.lastCompleted = 'All pads complete'
      sequence.progress = 100
      
      // Update spool with total wire length used for complete PCB cycle
      if (sequence.totalWireLengthUsed > 0) {
        this._updateSpoolAfterCompleteCycle(sequence.totalWireLengthUsed)
      }
      
      // Deactivate fume extractor if auto mode is enabled
      if (this.state.fumeExtractor.autoMode && this.state.fumeExtractor.enabled) {
        // Keep running for a short time after sequence completes to clear remaining fumes
        this._registerTimeout(() => {
          this.setFumeExtractorEnabled(false)
        }, 5000) // 5 seconds delay
      }
      
      this.emit('sequence', this.getSequenceState())
      return
    }

    const currentPad = sequence.padPositions[sequence.currentPad]
    const currentStage = sequenceStages[sequence.index]

    if (!currentStage) {
      // Move to next pad
      sequence.currentPad++
      sequence.index = 0
      sequence.progress = Math.round((sequence.currentPad / sequence.totalPads) * 100)
      this.emit('sequence', this.getSequenceState())
      await this._executeSequence()
      return
    }

    // Update stage
    sequence.stage = currentStage.name
    this.emit('sequence', this.getSequenceState())

    try {
      // Execute the current stage action
      await this._executeStageAction(currentStage.action, currentPad, sequence.index)

      // Mark as completed and move to next stage
      if (sequence.index > 0) {
        sequence.lastCompleted = sequenceStages[sequence.index - 1].name
      }
      sequence.index++

      // Small delay between stages
      await new Promise(resolve => setTimeout(resolve, 200))

      // Continue to next stage
      this._executeSequence()
    } catch (error) {
      sequence.isActive = false
      sequence.error = error.message
      sequence.stage = 'error'
      this.emit('sequence', this.getSequenceState())
      console.error('[Sequence] Error:', error)
    }
  }

  /**
   * Execute a specific stage action
   */
  async _executeStageAction(action, padPosition, stageIndex) {
    const { x, y, z } = padPosition
    const safeZ = this.state.componentHeightMm ? this.state.componentHeightMm + 2 : 5 // Safe height above component

    switch (action) {
      case 'moveX':
        // Move to X position (at safe height)
        await this._moveToPosition(x, this.state.position.y, safeZ)
        break

      case 'moveY':
        // Move to Y position (at safe height)
        await this._moveToPosition(x, y, safeZ)
        break

      case 'lowerZ':
        // Lower to soldering height
        const solderingZ = z || 0
        await this._moveToPosition(x, y, solderingZ)
        
        // Apply flux mist before soldering if auto mode is enabled
        if (this.state.fluxMist.autoMode && !this.state.fluxMist.isDispensing) {
          await this.dispenseFluxMist()
        }
        break

      case 'dispense':
        // Activate fume extractor if auto mode is enabled
        if (this.state.fumeExtractor.autoMode && !this.state.fumeExtractor.enabled) {
          this.setFumeExtractorEnabled(true)
        }
        
        // Feed wire - use wire length from calibration if available, otherwise default
        const wireEntry = this.state.calibration.find((entry) => entry.label === 'Wire Remaining')
        let wireLength = 5.0 // Default 5mm
        // Try to get wire length from state (could be set from pad metrics)
        if (this.state.sequence.wireLength) {
          wireLength = this.state.sequence.wireLength
        }
        
        // Track wire length used for this pad (for complete cycle tracking)
        const currentPadIndex = this.state.sequence.currentPad
        if (!this.state.sequence.wireLengthPerPad[currentPadIndex]) {
          this.state.sequence.wireLengthPerPad[currentPadIndex] = 0
        }
        this.state.sequence.wireLengthPerPad[currentPadIndex] += wireLength
        this.state.sequence.totalWireLengthUsed += wireLength
        
        const feedRate = 8.0 // mm/s
        // During sequence, skip wire remaining update (will update after complete cycle)
        await this.startWireFeed(wireLength, feedRate, true) // Pass true to skip wire remaining update
        // Wait for wire feed to complete
        while (this.state.wireFeed.status === 'feeding') {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        break

      case 'cleanTip':
        // Activate air jet pressure to clean the tip after soldering
        if (this.state.airJetPressure.autoMode && !this.state.airJetPressure.isActive) {
          await this.activateAirJetPressure()
        }
        break

      case 'retract':
        // Retract to safe height
        await this._moveToPosition(x, y, safeZ)
        
        // Activate air breeze after retraction if auto mode is enabled
        if (this.state.airBreeze.autoMode && !this.state.airBreeze.isActive) {
          await this.activateAirBreeze()
        }
        break

      case 'advance':
        // Already at position, just prepare for next pad
        break

      default:
        console.warn(`[Sequence] Unknown action: ${action}`)
    }
  }

  /**
   * Move to absolute position
   */
  async _moveToPosition(x, y, z) {
    // Boundary checking for X and Y axes (bed size limits)
    if (x !== null && x !== undefined) {
      if (x < MIN_POSITION_X || x > MAX_POSITION_X) {
        throw new Error(`X position ${x}mm is outside bed range (${MIN_POSITION_X}-${MAX_POSITION_X}mm)`)
      }
    }
    
    if (y !== null && y !== undefined) {
      if (y < MIN_POSITION_Y || y > MAX_POSITION_Y) {
        throw new Error(`Y position ${y}mm is outside bed range (${MIN_POSITION_Y}-${MAX_POSITION_Y}mm)`)
      }
    }
    
    if (this.mode === 'hardware' && this.commandProtocol) {
      try {
        await this.commandProtocol.moveTo(x, y, z)
        // Update position only if within bounds (don't update if null/undefined)
        if (x !== null && x !== undefined) this.state.position.x = x
        if (y !== null && y !== undefined) this.state.position.y = y
        if (z !== null && z !== undefined) this.state.position.z = z
        this.emit('position:update', this.getPosition())
      } catch (error) {
        throw new Error(`Movement failed: ${error.message}`)
      }
    } else {
      // Simulation mode - simulate movement
      this.state.position.isMoving = true
      this.emit('position:update', this.getPosition())
      
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate movement time
      
      // Update position only if within bounds (don't update if null/undefined)
      if (x !== null && x !== undefined) this.state.position.x = x
      if (y !== null && y !== undefined) this.state.position.y = y
      if (z !== null && z !== undefined) this.state.position.z = z
      this.state.position.isMoving = false
      this.emit('position:update', this.getPosition())
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  _createFluxPayload() {
    return {
      value: this.state.flux.percentage,
      unit: '%',
      volume: `${Math.max(0, this.state.flux.remainingMl).toFixed(1)} ml`,
      updatedAt: Date.now(),
    }
  }

  _updateCalibration(label, updates) {
    const entry = this.state.calibration.find((item) => item.label === label)
    if (!entry) {
      return
    }

    Object.assign(entry, updates)
    this.emit('calibration', {
      [label]: { ...updates },
    })
  }

  _emitFlux() {
    this.emit('flux', this.getFluxState())
  }

  _registerInterval(callback, delay) {
    const id = setInterval(() => {
      callback()
    }, delay)
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

  _stopSimulationLoops() {
    // Clear all simulation timers
    this.timers.forEach(({ type, id }) => {
      if (type === 'interval') {
        clearInterval(id)
      } else {
        clearTimeout(id)
      }
    })
    this.timers = []
  }

  _startSimulationLoops() {
    // Clear any existing timers first
    this._stopSimulationLoops()

    // Flux depletion
    this._registerInterval(() => {
      const drop = Math.random() < 0.6 ? 0 : 1
      if (drop <= 0) {
        return
      }

      const next = Math.max(0, this.state.flux.percentage - drop)
      if (next === this.state.flux.percentage) {
        return
      }

      this.state.flux.percentage = next
      this.state.flux.remainingMl = Math.max(0, this.state.flux.remainingMl - drop * (maxFluxMl / 100))
      this._updateCalibration('Flux Remaining', { value: next })
      this._emitFlux()
    }, 7000)

    // Tip heating / cooling
    this._registerInterval(() => {
      const { heaterEnabled, target, current } = this.state.tip
      const desired = heaterEnabled ? target : ambientTipTemp
      const delta = desired - current

      if (Math.abs(delta) < 0.5) {
        if (heaterEnabled) {
          this.state.tip.statusMessage = `Holding at ${current.toFixed(0)}°C`
          this.emit('tip', this.getTipStatus())
        }
        return
      }

      const step = Math.max(0.2, Math.min(6, Math.abs(delta) / 5))
      this.state.tip.current = current + Math.sign(delta) * step
      
      // Update calibration display (LCD) - uses same formatting for consistency
      this._updateCalibration('Tip Temp', {
        value: Number(this.state.tip.current.toFixed(1)), // 1 decimal to match TipHeatingControl
      })

      if (heaterEnabled) {
        this.state.tip.statusMessage = `Heating to ${target.toFixed(0)}°C`
      } else {
        this.state.tip.statusMessage = `Cooling to ${ambientTipTemp.toFixed(0)}°C`
      }
      
      // Emit tip update (TipHeatingControl) - both components now show same values
      this.emit('tip', this.getTipStatus())
    }, 1500)

    // Axis jitter to show motion
    this._registerInterval(() => {
      const jitter = () => Math.random() * 0.2 - 0.1

      this._updateCalibration('X Axis', {
        value: `120.00 → ${(132.5 + jitter()).toFixed(2)}`,
      })
      this._updateCalibration('Y Axis', {
        value: `045.30 → ${(48.1 + jitter()).toFixed(2)}`,
      })
      this._updateCalibration('Z Axis', {
        value: `003.20 → ${(Math.max(0, jitter())).toFixed(2)}`,
      })
    }, 9000)

    // Note: Sequence execution is now handled by startSequence() method
    // This simulation loop is kept for backward compatibility but won't auto-start

    // Wire remaining depletion
    this._registerInterval(() => {
      const { spool } = this.state
      // Only simulate if there's wire remaining
      if (spool.currentWireLength <= 0 || spool.initialWireLength <= 0) {
        return
      }

      // Randomly decrease wire by 0 or 1% (simulating usage)
      const drop = Math.random() < 0.5 ? 0 : 1
      if (drop === 0) {
        return // No change this cycle
      }

      // Calculate length change based on percentage drop
      const percentageDrop = 1 // 1% drop
      const lengthChange = (percentageDrop / 100) * spool.initialWireLength
      const newLength = Math.max(0, spool.currentWireLength - lengthChange)
      
      // Update the source of truth (spool state)
      spool.currentWireLength = newLength
      spool.currentWeight = this._calculateWireWeight(spool.currentWireLength)
      spool.lastUpdated = Date.now()
      
      // Update calibration display (LCD) - uses same calculation for consistency
      this._updateWireRemainingDisplay()
      
      // Emit spool update (SpoolWireControl) - both components now show same values
      this.emit('spool', this.getSpoolState())
    }, 12000)
  }

  // -----------------------------------------------------------------------
  // Hardware mode helpers
  // -----------------------------------------------------------------------

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

    // Handle Marlin position updates (M114 response)
    this.serialManager.on('position', (position) => {
      if (position) {
        // Clamp X and Y positions to bed boundaries
        if (position.x !== undefined && position.x !== null) {
          this.state.position.x = Math.max(MIN_POSITION_X, Math.min(MAX_POSITION_X, position.x))
        }
        if (position.y !== undefined && position.y !== null) {
          this.state.position.y = Math.max(MIN_POSITION_Y, Math.min(MAX_POSITION_Y, position.y))
        }
        if (position.z !== undefined && position.z !== null) {
          this.state.position.z = position.z
        }

        this._updateCalibrationEntry('X Axis', {
          value: `${this.state.position.x.toFixed(2)}`,
        })
        this._updateCalibrationEntry('Y Axis', {
          value: `${this.state.position.y.toFixed(2)}`,
        })
        this._updateCalibrationEntry('Z Axis', {
          value: `${this.state.position.z.toFixed(2)}`,
        })

        this.emit('position:update', this.getPosition())
      }
    })

    // Handle Marlin temperature updates (M105 response)
    this.serialManager.on('temperature', (temp) => {
      if (temp && temp.hotend) {
        this.state.tip.current = temp.hotend.current || this.state.tip.current
        // Update calibration display (LCD) - uses same formatting for consistency
        this._updateCalibrationEntry('Tip Temp', {
          value: Number(this.state.tip.current.toFixed(1)), // 1 decimal to match TipHeatingControl
        })
        // Emit tip update (TipHeatingControl) - both components now show same values
        this.emit('tip', this.getTipStatus())
      }
    })

    // Handle GRBL status reports (for backward compatibility)
    this.serialManager.on('status', (status) => {
      // Update position from hardware status
      if (status.position) {
        // Clamp X and Y positions to bed boundaries
        if (status.position.x !== undefined && status.position.x !== null) {
          this.state.position.x = Math.max(MIN_POSITION_X, Math.min(MAX_POSITION_X, status.position.x))
        }
        if (status.position.y !== undefined && status.position.y !== null) {
          this.state.position.y = Math.max(MIN_POSITION_Y, Math.min(MAX_POSITION_Y, status.position.y))
        }
        if (status.position.z !== undefined && status.position.z !== null) {
          this.state.position.z = status.position.z
        }
        this.state.position.isMoving = status.state !== 'Idle' && status.state !== 'Hold'

        this._updateCalibrationEntry('X Axis', {
          value: `${this.state.position.x.toFixed(2)}`,
        })
        this._updateCalibrationEntry('Y Axis', {
          value: `${this.state.position.y.toFixed(2)}`,
        })
        this._updateCalibrationEntry('Z Axis', {
          value: `${this.state.position.z.toFixed(2)}`,
        })

        this.emit('position:update', this.getPosition())
      }
    })

    this.serialManager.on('data', (line) => {
      // Log incoming data for debugging
      console.log('[Serial]', line)
    })

    // G-CODE EVENT FORWARDING COMMENTED OUT
    // Forward G-code command events to hardware events
    // this.serialManager.on('command:sent', (data) => {
    //   this.emit('gcode:command', {
    //     ...data,
    //     status: 'sent',
    //   })
    // })

    // this.serialManager.on('command:received', (data) => {
    //   this.emit('gcode:response', {
    //     ...data,
    //     status: 'received',
    //   })
    // })

    // this.serialManager.on('command:error', (data) => {
    //   this.emit('gcode:error', {
    //     ...data,
    //     status: 'error',
    //   })
    // })

    // this.serialManager.on('command:timeout', (data) => {
    //   this.emit('gcode:error', {
    //     ...data,
    //     status: 'error',
    //     error: 'Command timeout',
    //   })
    // })
  }

  _startHardwareStatusPolling() {
    // Poll for position and temperature from Marlin firmware
    this._registerInterval(async () => {
      if (this.mode === 'hardware' && this.commandProtocol && this.connected) {
        try {
          // Marlin: Request position (M114)
          await this.commandProtocol.getPosition()
          // Marlin: Request temperature (M105)
          await this.commandProtocol.getTemperature()
        } catch (error) {
          console.error('[SolderingHardware] Status polling error:', error)
        }
      }
    }, 1000) // Poll every second
  }

  /**
   * Get available serial ports
   */
  static async listSerialPorts() {
    return SerialPortManager.listPorts()
  }

  /**
   * Get serial connection status
   */
  getSerialStatus() {
    if (this.mode === 'hardware' && this.serialManager) {
      return this.serialManager.getStatus()
    }
    return { isConnected: false, mode: 'simulation' }
  }
}

