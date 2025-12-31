import { EventEmitter } from 'events'
import SerialPortManager from './SerialPortManager.js'
import CommandProtocol from './CommandProtocol.js'

const sequenceStages = [
  { name: 'Lowering Z axis', action: 'lowerZ' },
  { name: 'Dispensing solder', action: 'dispense' },
  { name: 'Cleaning tip', action: 'cleanTip' },
  { name: 'Retracting head', action: 'retract' },
]

const initialCalibration = [
  { label: 'Z Axis', value: '000.00 → 000.00', unit: 'mm' },
  { label: 'Wire Remaining', value: 100, unit: '%', length: '14.3 m' },
  { label: 'Flux Remaining', value: 82, unit: '%' },
  { label: 'Tip Temp', value: 290, unit: '°C' },
  { label: 'Feed Rate', value: '8.0', unit: 'mm/s' },
  { label: 'Flow Rate', value: '1.0', unit: 'mm³/s' },
  { label: 'Speed', value: '210', unit: 'mm/s' },
  { label: 'Thermal Duration', value: '--', unit: 'ms' },
]

const ambientTipTemp = 45
const maxFluxMl = 120

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
    
    // Track last movement command for comparison logging
    this._lastMovementCommand = null
    // Flag to prevent compensation loops (compensation shouldn't trigger more compensation)
    this._isCompensating = false

    // Setup serial communication if in hardware mode
    if (this.mode === 'hardware') {
      console.log("entering hardware mode");
      this.serialManager = new SerialPortManager(this.serialConfig)
      this.commandProtocol = new CommandProtocol(this.serialManager, {
        protocol: this.serialConfig.protocol || 'gcode',
        stepsPerMm: this.serialConfig.stepsPerMm,
      })
      this._setupSerialEventHandlers()
    }

    // Machine physical dimensions
    this.BED_HEIGHT_MM = 280.0 // Total height from home (upper limit) to bed surface (lower limit)

    this.state = {
      componentHeightMm: null,
      jigHeightMm: null, // Jig height: distance from bed surface to jig surface (jig thickness, in mm)
      calibration: initialCalibration.map((entry) => ({ ...entry })),
      // Z-axis movement speed (1-100%, where 100% = fastest, 1% = slowest)
      // This controls the delay between stepper motor steps
      zAxisSpeed: options.zAxisSpeed || 95, // 95% for faster movement
      fans: { machine: false, tip: false },
      fumeExtractor: {
        enabled: false,
        speed: 90, // 0-100% speed
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
        target: 290,
        heaterEnabled: false,
        current: 290,
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
        thermalMassDuration: 1000, // Thermal mass compensation duration in milliseconds (default: 1 second)
      },
      position: {
        z: 0.0,  // Single-axis machine: only Z-axis position - starts at home (0.00mm)
        isMoving: false,
      },
    }

    // Sync Feed Rate calibration with wireFeed state on initialization
    this._updateCalibration('Feed Rate', {
      value: this.state.wireFeed.currentFeedRate.toFixed(1),
    })
    
    // Initialize Z-axis speed display with calculated value
    this._updateZAxisSpeedDisplay()
  }

  async connect(portPath = null, config = {}) {
    console.log('[SolderingHardware] connect() called:', { portPath, config, mode: this.mode, hasSerialManager: !!this.serialManager })
    
    // Check if actually connected (not just this.connected flag)
    const isActuallyConnected = this.mode === 'hardware' && 
                                this.serialManager && 
                                this.serialManager.isConnected &&
                                this.serialManager.port &&
                                this.serialManager.port.isOpen
    
    if (this.connected && isActuallyConnected) {
      console.log('[SolderingHardware] Already connected, returning early')
      return { status: 'Already connected' }
    }
    
    // If this.connected is true but serial is not actually connected, reset and reconnect
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
        // No port provided - run in simulation mode as fallback
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
        // Merge passed config with default serialConfig
        const mergedConfig = {
          ...this.serialConfig,
          ...config,
        }
        console.log('[SolderingHardware] Attempting to connect serial port:', { portPath, mergedConfig })
        const result = await this.serialManager.connect(portPath, mergedConfig)
        
        console.log('[SolderingHardware] Serial connection result:', result)
        
        if (result.error) {
          console.error('[SolderingHardware] Serial connection failed:', result.error)
          return result
        }

        // Verify connection actually succeeded
        if (!this.serialManager.isConnected || !this.serialManager.port || !this.serialManager.port.isOpen) {
          console.error('[SolderingHardware] Connection reported success but port is not actually open!', {
            isConnected: this.serialManager.isConnected,
            hasPort: !!this.serialManager.port,
            portIsOpen: this.serialManager.port?.isOpen
          })
          return { error: 'Connection failed: port not open after connection attempt' }
        }

        this.connected = true
        // Stop simulation loops and start hardware status polling
        this._stopSimulationLoops()
        this._startHardwareStatusPolling()
        console.log('[SolderingHardware] Successfully connected to hardware')
        return result
      } catch (error) {
        console.error('[SolderingHardware] Exception during connection:', error)
        return { error: error.message }
      }
    } else {
      // Simulation mode
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

  /**
   * Set jig height (thickness of the jig from bed surface to jig surface)
   * @param {number} height - Height from bed surface to jig surface (where PCB sits) in mm
   * @param {string} unit - Unit of measurement (default: 'mm')
   * @returns {Object} Result object with status or error
   * 
   * Note: Jig is a tool/plate placed on the bed surface. Jig height is the thickness of the jig
   * (distance from bed surface to jig surface where PCB sits).
   * Jig surface position from home = bedHeight - jigHeight
   */
  setJigHeight(height, unit = 'mm') {
    const numeric = Number.parseFloat(height)
    if (!Number.isFinite(numeric) || numeric < 0) {
      return {
        error: 'Jig height must be a positive number.',
      }
    }

    // Validate jig height doesn't exceed bed height (jig thickness can't be more than bed height)
    if (numeric > this.BED_HEIGHT_MM) {
      return {
        error: `Jig height (${numeric.toFixed(2)}mm) cannot exceed bed height (${this.BED_HEIGHT_MM}mm).`,
      }
    }

    this.state.jigHeightMm = numeric
    const jigSurfaceFromHome = this.BED_HEIGHT_MM - numeric
    const safeTravel = this.getSafeTravelSpace()
    console.log(`[SolderingHardware] Jig height (thickness) set to ${numeric.toFixed(2)} ${unit}, jig surface at ${jigSurfaceFromHome.toFixed(2)}mm from home, safe travel space (home to jig): ${safeTravel?.toFixed(2) || 0}mm`)
    return {
      status: `Jig height set to ${numeric.toFixed(2)} ${unit}. Jig surface at ${jigSurfaceFromHome.toFixed(2)}mm from home. Safe travel space: ${safeTravel?.toFixed(2) || 0}mm`,
      jigHeight: numeric,
      bedHeight: this.BED_HEIGHT_MM,
      jigSurfaceFromHome: jigSurfaceFromHome,
      safeTravelSpace: safeTravel,
    }
  }

  /**
   * Get safe travel space (total safe range from home to jig surface)
   * This is the space available for the head to move safely from home position down to jig surface
   * @returns {number|null} Safe travel space in mm or null if jig height not set
   */
  getSafeTravelSpace() {
    if (this.state.jigHeightMm === null || this.state.jigHeightMm === undefined) {
      return null
    }
    // Safe travel space = bed height - jig height (space from home to jig surface)
    return this.BED_HEIGHT_MM - this.state.jigHeightMm
  }

  /**
   * Get jig surface position from home
   * @returns {number|null} Jig surface position in mm from home or null if jig height not set
   */
  getJigSurfaceFromHome() {
    if (this.state.jigHeightMm === null || this.state.jigHeightMm === undefined) {
      return null
    }
    // Jig surface = bed surface - jig height
    return this.BED_HEIGHT_MM - this.state.jigHeightMm
  }

  /**
   * Get bed height constant
   * @returns {number} Bed height in mm (280mm) - distance from home to bed surface where jig is placed
   */
  getBedHeight() {
    return this.BED_HEIGHT_MM
  }

  /**
   * Get jig height
   * @returns {number|null} Jig height in mm or null if not set
   */
  getJigHeight() {
    return this.state.jigHeightMm
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
    
    // Calculate remaining percentage from wire length
    let remainingPercentage = 0
    if (spool.initialWireLength > 0) {
      remainingPercentage = (spool.currentWireLength / spool.initialWireLength) * 100
    }
    remainingPercentage = Math.max(0, Math.min(100, remainingPercentage))
    const remainingLength = spool.currentWireLength
    
    // Calculate current wire weight from length
    const calculatedWeight = this._calculateWireWeight(spool.currentWireLength)
    // Net weight = calculated weight - tare weight
    // When tared with machine parts but no wire, tareWeight = machine parts weight
    // So netWeight shows only wire weight (excludes machine parts)
    const netWeightFromLength = calculatedWeight - spool.tareWeight
    
    // Synchronize: If initialWeight is set, use it to sync percentage and weight
    // Priority: Use weight from Arduino/sensor if available, otherwise calculate from length
    let netWeight = netWeightFromLength
    
    // If initialWeight is set (wire loaded after taring), sync weight and percentage
    if (spool.initialWeight > 0) {
      // Calculate netWeight from remaining percentage to ensure sync
      // netWeight = initialWeight * (remainingPercentage / 100)
      const syncedNetWeight = spool.initialWeight * (remainingPercentage / 100)
      // Use synced weight if we have initial weight
      netWeight = Math.max(0, syncedNetWeight)
      
      // Ensure netWeight never exceeds initialWeight
      if (netWeight > spool.initialWeight) {
        netWeight = spool.initialWeight
        // Recalculate percentage from weight if weight is more accurate
        remainingPercentage = (netWeight / spool.initialWeight) * 100
      }
    }
    
    // Track initial weight when wire is first loaded after taring
    // Initial wire weight = total weight of wire assembled with machine before soldering starts
    // This is set when wire is loaded (after taring) - represents 100% wire remaining
    if (spool.isTared && spool.currentWireLength > 0 && spool.initialWeight === 0) {
      // Set initialWeight to net weight (wire only, excluding machine parts)
      const netWeight = calculatedWeight - spool.tareWeight
      if (netWeight > 0) {
        spool.initialWeight = netWeight // This becomes 100% baseline
      }
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
      // Weight information (synchronized with percentage)
      solderDensity: spool.solderDensity,
      currentWeight: calculatedWeight,
      netWeight: Math.max(0, netWeight), // Weight after tare (synchronized with remaining percentage)
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
    
    // If wire is already loaded (currentWireLength > 0), set initialWeight to current net weight
    // Otherwise, reset initial weight - it will be set when wire is first loaded
    if (spool.currentWireLength > 0) {
      const netWeight = currentCalculatedWeight - spool.tareWeight
      if (netWeight > 0) {
        spool.initialWeight = netWeight
      } else {
        spool.initialWeight = 0
      }
    } else {
      spool.initialWeight = 0
    }
    
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
    const { spool } = this.state
    spool.currentWireLength = spool.initialWireLength
    spool.totalRotations = 0
    spool.currentRotation = 0
    spool.lastFeedLength = 0
    
    // Reset weight calculations - synchronize with percentage (100% = initialWeight)
    if (spool.isTared && spool.initialWeight > 0) {
      // If tared and initialWeight is set, weight should be at 100% (initialWeight + tareWeight)
      spool.currentWeight = spool.initialWeight + spool.tareWeight
    } else {
      // Otherwise calculate from length
      const calculatedWeight = this._calculateWireWeight(spool.initialWireLength)
      spool.currentWeight = calculatedWeight
      // If tared, set initialWeight to net weight
      if (spool.isTared) {
        spool.initialWeight = calculatedWeight - spool.tareWeight
      } else {
        spool.initialWeight = calculatedWeight
      }
    }
    
    // Note: tareWeight and isTared are NOT reset - user must manually tare again if needed
    // This preserves the tare setting even after reset
    
    spool.lastUpdated = Date.now()
    
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
    // Single-axis machine: only Z-axis position
    return {
      z: this.state.position.z,
      isMoving: this.state.position.isMoving,
    }
  }

  async jog(axis, direction, stepSize) {
    if (this.state.position.isMoving) {
      return { error: 'Machine is already moving' }
    }

    // Single-axis machine: only Z-axis (up/down) movement is allowed
    const axisLower = axis.toLowerCase()
    if (axisLower !== 'z') {
      return { error: 'Invalid axis. This is a single-axis machine - only Z-axis (up/down) movement is supported.' }
    }

    const axisKey = 'z'
    // direction > 0 means upward (positive), direction < 0 means downward (negative)
    // Upward movement increases Z (towards 0), downward movement decreases Z (negative values)
    const step = direction > 0 ? stepSize : -stepSize
    
    // Calculate new position
    let newPosition = this.state.position[axisKey] + step
    
    // Check if trying to go above limit
    const limitReached = newPosition > 0 && direction > 0
    
    // Clamp to maximum of 0.00mm (home position)
    if (newPosition > 0) {
      newPosition = 0.0
    }
    
    this.state.position.isMoving = true
    this.emit('position:update', this.getPosition())

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Store previous position and commanded distance for movement tracking
        const previousPosition = this.state.position[axisKey]
        const commandedDistance = step
        
        // Send JSON command to Arduino: {"command":"jog","axis":"z","distance":1.0,"speed":50}
        // Speed: 1-200% (1-100% = normal range, 101-200% = turbo mode)
        await this._sendArduinoJsonCommand({
          command: 'jog',
          axis: axis.toLowerCase(),
          distance: step,
          speed: this.state.zAxisSpeed // Send current speed setting
        })
        
        // Store movement tracking data for logging when Arduino confirms position
        // Use the CURRENT position (before local update) as the baseline
        this._lastMovementCommand = {
          previousPosition,  // Position before command was sent
          commandedDistance,
          timestamp: Date.now()
        }
        
        // Don't update local position immediately - wait for Arduino to confirm
        // This ensures we use Arduino's actual reported position for comparison
        this.state.position.isMoving = true

        this._updateCalibrationEntry(
          `${axis.toUpperCase()} Axis`,
          {
            value: `${this.state.position[axisKey].toFixed(2)}`,
          }
        )

        // Set isMoving to false after a delay (Arduino will update this via JSON response)
        setTimeout(() => {
          this.state.position.isMoving = false
          this.emit('position:update', this.getPosition())
        }, 500)

        this.emit('position:update', this.getPosition())
        
        console.log('[SolderingHardware] Jog command sent to Arduino, returning immediately')
        console.log('[SolderingHardware] Note: Limit switch status will come from Arduino JSON updates, not from this response')
        
         // Return a proper result object
        const result = { 
          status: limitReached ? 'Upper limit switch reached' : 'Movement completed', 
          position: this.getPosition(),
          limitReached: false  // Always false here - actual limit status comes from Arduino JSON
        }
        console.log('[SolderingHardware] Returning jog result:', result)
        return result
      } catch (error) {
        console.error('[SolderingHardware] Error in jog:', error)
        this.state.position.isMoving = false
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.position[axisKey] = newPosition
          this.state.position.isMoving = false

          this._updateCalibrationEntry(
            `${axis.toUpperCase()} Axis`,
            {
              value: `${this.state.position[axisKey].toFixed(2)}`,
            }
          )

          this.emit('position:update', this.getPosition())
          resolve({ 
            status: limitReached ? 'Upper limit switch reached' : 'Movement completed', 
            position: this.getPosition(),
            limitReached: limitReached
          })
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

    // Home position is at 0.00mm (top limit switch)
    const HOME_POSITION = 0.0

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Clear any pending movement tracking since home resets position
        this._lastMovementCommand = null
        
        await this._sendArduinoJsonCommand({
          command: 'home',
          speed: this.state.zAxisSpeed // Send current speed setting
        })
        
        // IMPORTANT: DO NOT set position or isMoving here!
        // The Arduino's homeZAxis() function is BLOCKING and will take time to complete.
        // During homing, Arduino's loop() is blocked, so no JSON updates are sent.
        // After homing completes, Arduino sets isMoving = false and sends JSON update.
        // We MUST wait for Arduino to send JSON state updates indicating homing is complete.
        // Position will be updated when Arduino sends: {"pos":{"z":0.0,"moving":false}}
        
        // Note: The app will receive position updates via _handleArduinoData() when:
        // 1. Homing completes (Arduino sets isMoving = false and sends JSON)
        // 2. Arduino's loop() resumes and calls sendMachineState()
        
        // No timeout needed - Arduino controls the state via JSON updates
        // The _handleArduinoData() function will update position.z and isMoving when Arduino reports completion

        this.emit('position:update', this.getPosition())
        return { status: 'Homed to 0.00mm (top limit switch)', position: this.getPosition() }
      } catch (error) {
        this.state.position.isMoving = false
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return new Promise((resolve) => {
        setTimeout(() => {
          // Single-axis machine: only Z-axis is homed
          // Home is at 0.00mm (top limit switch)
          this.state.position.z = HOME_POSITION
          this.state.position.isMoving = false

          this._updateCalibrationEntry('Z Axis', { value: HOME_POSITION.toFixed(2) })

          this.emit('position:update', this.getPosition())
          resolve({ status: 'Homed to 0.00mm (top limit switch)', position: this.getPosition() })
        }, 500)
      })
    }
  }

  async saveMovementSequence() {
    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command to Arduino: {"command":"save"}
        await this._sendArduinoJsonCommand({
          command: 'save'
        })
        
        return { status: 'Movement sequence saved from home position to current position' }
      } catch (error) {
        return { error: error.message }
      }
    } else {
      // Simulation mode
      return { status: 'Movement sequence saved (simulation mode)' }
    }
  }

  /**
   * Calculate Z-axis movement speed in mm/s from speed percentage
   * @param {number} speedPercent - Speed percentage (1-100)
   * @returns {number} Speed in mm/s
   */
  _calculateZAxisSpeedMmPerSecond(speedPercent) {
    // Arduino constants
    const Z_STEP_DELAY_MIN = 50  // microseconds (fastest) - reduced for higher speed
    const Z_STEP_DELAY_MAX = 800 // microseconds (slowest) - reduced from 2000 for faster movement
    // Steps per mm is now calculated: (200 × 16) / 1.0 = 3200 steps/mm (for 1mm pitch, 16 microstepping)
    const Z_STEPS_PER_MM = 3200 // Updated to match calculated value from Arduino
    
    // Convert percentage to step delay (same formula as Arduino)
    // Formula: delay = MAX - ((speed - 1) / (100 - 1)) * (MAX - MIN)
    const stepDelayUs = Z_STEP_DELAY_MAX - ((speedPercent - 1) / 99) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN)
    
    // Calculate speed: Speed (mm/s) = (1,000,000 / stepDelay_us) / stepsPerMm
    const speedMmPerSecond = (1000000 / stepDelayUs) / Z_STEPS_PER_MM
    
    return speedMmPerSecond
  }

  /**
   * Update Z-axis speed display in calibration
   */
  _updateZAxisSpeedDisplay() {
    const speedMmPerSecond = this._calculateZAxisSpeedMmPerSecond(this.state.zAxisSpeed)
    this._updateCalibration('Speed', {
      value: speedMmPerSecond.toFixed(1), // 1 decimal place for mm/s
    })
  }

  /**
   * Set Z-axis movement speed
   * @param {number} speed - Speed percentage (1-100), where 100% = fastest, 1% = slowest
   * @returns {object} Status object
   */
  setZAxisSpeed(speed) {
    const speedValue = Math.max(1, Math.min(200, Number(speed) || 50))
    this.state.zAxisSpeed = speedValue
    
    // Update LCD display with calculated speed
    this._updateZAxisSpeedDisplay()
    
    // If connected to hardware, send speed command to Arduino
    if (this.mode === 'hardware' && this.serialManager && this.connected) {
      this._sendArduinoJsonCommand({
        command: 'setspeed',
        speed: speedValue
      }).catch((error) => {
        console.error('[SolderingHardware] Error setting speed:', error)
      })
    }
    
    const speedLabel = speedValue > 100 ? `Turbo Mode (${speedValue}%)` : `${speedValue}%`
    return { status: `Z-axis speed set to ${speedLabel}` }
  }

  /**
   * Get Z-axis movement speed
   * @returns {number} Speed percentage (1-100)
   */
  getZAxisSpeed() {
    return this.state.zAxisSpeed
  }

  /**
   * Set thermal mass compensation duration
   * @param {number} duration - Duration in milliseconds (1000-5000ms)
   * @returns {object} Status object
   */
  setThermalMassDuration(duration) {
    const durationValue = Math.max(1000, Math.min(5000, Number(duration) || 1000))
    this.state.sequence.thermalMassDuration = durationValue
    
    // Update LCD display with thermal mass duration
    this._updateCalibration('Thermal Duration', {
      value: durationValue.toString(),
    })
    
    return { status: `Thermal mass duration set to ${durationValue}ms (${(durationValue / 1000).toFixed(1)}s)` }
  }

  /**
   * Get thermal mass compensation duration
   * @returns {number} Duration in milliseconds
   */
  getThermalMassDuration() {
    return this.state.sequence.thermalMassDuration || 1000
  }

  /**
   * Calibrate Z-axis steps per millimeter
   * @param {object} options - Calibration options
   * @param {number} [options.stepsPerMm] - Direct value for steps per mm (e.g., 204.1)
   * @param {number} [options.commanded] - Commanded distance in mm (e.g., 5.0)
   * @param {number} [options.actual] - Actual measured distance in mm (e.g., 4.89)
   * @returns {object} Status object
   */
  calibrateZAxisStepsPerMm(options = {}) {
    const { stepsPerMm, commanded, actual } = options
    
    if (this.mode === 'hardware' && this.serialManager && this.connected) {
      try {
        if (stepsPerMm !== undefined) {
          // Direct calibration: set steps per mm value
          const value = Number(stepsPerMm)
          if (value > 0 && value < 10000) {
            this._sendArduinoJsonCommand({
              command: 'calibrate',
              stepsPerMm: value
            }).catch((error) => {
              console.error('[SolderingHardware] Error calibrating steps per mm:', error)
            })
            return { status: `Z-axis steps per mm set to ${value}` }
          } else {
            return { error: 'Invalid steps per mm value (must be > 0 and < 10000)' }
          }
        } else if (commanded !== undefined && actual !== undefined) {
          // Auto-calibration: calculate from commanded vs actual movement
          const commandedValue = Number(commanded)
          const actualValue = Number(actual)
          if (commandedValue > 0 && actualValue > 0) {
            this._sendArduinoJsonCommand({
              command: 'calibrate',
              commanded: commandedValue,
              actual: actualValue
            }).catch((error) => {
              console.error('[SolderingHardware] Error calibrating:', error)
            })
            const correctionFactor = (commandedValue / actualValue).toFixed(4)
            return { 
              status: `Calibration sent: Commanded ${commandedValue}mm, Actual ${actualValue}mm, Correction factor: ${correctionFactor}` 
            }
          } else {
            return { error: 'Invalid commanded/actual values (must be > 0)' }
          }
        } else {
          return { error: 'Must provide either stepsPerMm or both commanded and actual values' }
        }
      } catch (error) {
        return { error: error.message }
      }
    } else {
      return { error: 'Not connected to hardware' }
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
    
    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"fume","enabled":true,"speed":80}
        this._sendArduinoJsonCommand({
          command: 'fume',
          enabled: Boolean(enabled),
          speed: this.state.fumeExtractor.speed
        })
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
    if (this.state.fumeExtractor.enabled && this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"fume","enabled":true,"speed":80}
        this._sendArduinoJsonCommand({
          command: 'fume',
          enabled: true,
          speed: this.state.fumeExtractor.speed
        })
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

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"fluxmist","dispense":true,"duration":500,"flowRate":50}
        await this._sendArduinoJsonCommand({
          command: 'fluxmist',
          dispense: true,
          duration: durationNumeric,
          flowRate: flowRateNumeric
        })
        
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

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"airbreeze","activate":true,"duration":2000,"intensity":60}
        await this._sendArduinoJsonCommand({
          command: 'airbreeze',
          activate: true,
          duration: durationNumeric,
          intensity: intensityNumeric
        })
        
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
      if (this.mode === 'hardware' && this.serialManager) {
        try {
          // Send JSON command: {"command":"airbreeze","enabled":false}
          this._sendArduinoJsonCommand({
            command: 'airbreeze',
            enabled: false
          })
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
    if (this.state.airBreeze.isActive && this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"airbreeze","intensity":60}
        this._sendArduinoJsonCommand({
          command: 'airbreeze',
          intensity: this.state.airBreeze.intensity
        })
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

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"airjet","activate":true,"duration":200,"pressure":80}
        await this._sendArduinoJsonCommand({
          command: 'airjet',
          activate: true,
          duration: durationNumeric,
          pressure: pressureNumeric
        })
        
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
      if (this.mode === 'hardware' && this.serialManager) {
        try {
          // Send JSON command: {"command":"airjet","enabled":false}
          this._sendArduinoJsonCommand({
            command: 'airjet',
            enabled: false
          })
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
    if (this.state.airJetPressure.isActive && this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"airjet","pressure":80}
        this._sendArduinoJsonCommand({
          command: 'airjet',
          pressure: this.state.airJetPressure.pressure
        })
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

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"temp","target":290}
        await this._sendArduinoJsonCommand({
          command: 'temp',
          target: numeric
        })
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

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"heater","enable":true}
        await this._sendArduinoJsonCommand({
          command: 'heater',
          enable: Boolean(enabled)
        })
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

    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command: {"command":"feed","length":10.5}
        await this._sendArduinoJsonCommand({
          command: 'feed',
          length: lengthNumeric
        })
        
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
      
      // Synchronize weight and percentage after feed
      // Calculate new remaining percentage
      let remainingPercentage = 0
      if (spool.initialWireLength > 0) {
        remainingPercentage = (spool.currentWireLength / spool.initialWireLength) * 100
      }
      remainingPercentage = Math.max(0, Math.min(100, remainingPercentage))
      
      // Update weight to match percentage (if initialWeight is set)
      if (spool.initialWeight > 0) {
        // Calculate netWeight from remaining percentage to ensure sync
        const newNetWeight = spool.initialWeight * (remainingPercentage / 100)
        // Update currentWeight to match (add tare weight back)
        spool.currentWeight = newNetWeight + spool.tareWeight
      } else {
        // If initialWeight not set, calculate from length
        spool.currentWeight = this._calculateWireWeight(spool.currentWireLength)
      }
      
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

  _updateSpoolAfterCompleteCycle(totalWireLengthUsed) {
    const { spool } = this.state
    
    // Update wire remaining
    spool.currentWireLength = Math.max(0, spool.currentWireLength - totalWireLengthUsed)
    
    // Synchronize weight and percentage after cycle
    // Calculate new remaining percentage
    let remainingPercentage = 0
    if (spool.initialWireLength > 0) {
      remainingPercentage = (spool.currentWireLength / spool.initialWireLength) * 100
    }
    remainingPercentage = Math.max(0, Math.min(100, remainingPercentage))
    
    // Update weight to match percentage (if initialWeight is set)
    if (spool.initialWeight > 0) {
      // Calculate netWeight from remaining percentage to ensure sync
      const newNetWeight = spool.initialWeight * (remainingPercentage / 100)
      // Update currentWeight to match (add tare weight back)
      spool.currentWeight = newNetWeight + spool.tareWeight
    } else {
      // If initialWeight not set, calculate from length
      spool.currentWeight = this._calculateWireWeight(spool.currentWireLength)
    }
    
    // Update wire remaining in calibration display (LCD)
    this._updateWireRemainingDisplay()
    
    // Store total wire length used for this cycle
    spool.lastCycleWireLengthUsed = totalWireLengthUsed
    
    spool.lastUpdated = Date.now()
    
    // Emit spool update
    this.emit('spool', this.getSpoolState())
  }

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
        : [{ z: 0 }]  // Single-axis machine: only Z position

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

  async _executeStageAction(action, padPosition, stageIndex) {
    const { x, y, z } = padPosition
    // Jig surface = bedHeight - jigHeight (jig height is thickness from bed to jig surface)
    let safeZ = 5 // Default safe height
    if (this.state.jigHeightMm !== null && this.state.jigHeightMm !== undefined) {
      // Jig height is set - calculate jig surface position from home
      const jigSurfaceFromHome = this.BED_HEIGHT_MM - this.state.jigHeightMm
      const componentHeight = this.state.componentHeightMm || 0
      // safeZ = jigSurfaceFromHome + componentHeight + 2 // Jig surface + component + clearance
      safeZ = jigSurfaceFromHome + componentHeight // Jig surface + component
    } else if (this.state.componentHeightMm !== null && this.state.componentHeightMm !== undefined) {
      // Fallback to component height only
      safeZ = this.state.componentHeightMm + 2
    }

    switch (action) {
      // Single-axis machine: X and Y movements are not supported (PCB is moved manually)

      case 'lowerZ':
        // Lower to soldering height (Z-axis only)
        const solderingZ = z || 0
        await this._moveToPosition(null, null, solderingZ)
        
        // Apply flux mist before soldering if auto mode is enabled
        if (this.state.fluxMist.autoMode && !this.state.fluxMist.isDispensing) {
          await this.dispenseFluxMist()
        }
        
        // Thermal mass compensation: Wait for heat to transfer to pad
        // Larger pads need more time for the tip to heat the pad surface
        const dwellDuration = this.state.sequence.thermalMassDuration || 1000
        console.log(`[Sequence] Thermal mass compensation: Waiting ${dwellDuration}ms for heat transfer...`)
        await new Promise((resolve) => setTimeout(resolve, dwellDuration))
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
        // Retract to safe height (Z-axis only)
        await this._moveToPosition(null, null, safeZ)
        
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

  async _sendArduinoJsonCommand(commandObj) {
    // Check if we're in hardware mode and serial is actually connected
    const isSerialReady = this.mode === 'hardware' && 
                         this.serialManager && 
                         this.serialManager.isConnected &&
                         this.serialManager.port &&
                         this.serialManager.port.isOpen
    
    if (isSerialReady) {
      try {
        await this.serialManager.sendJsonCommand(commandObj)
        console.log('[SolderingHardware] JSON command sent to Arduino:', JSON.stringify(commandObj));
      } catch (error) {
        console.error('[SolderingHardware] Error sending JSON command to Arduino:', error)
        throw error
      }
    } else {
      // Simulation mode - log why we're in simulation with detailed state
      const reasons = []
      const state = {
        mode: this.mode,
        hasSerialManager: !!this.serialManager,
        connected: this.connected,
      }
      
      if (this.mode !== 'hardware') reasons.push(`mode=${this.mode}`)
      if (!this.serialManager) {
        reasons.push('no serialManager')
      } else {
        state.serialManagerIsConnected = this.serialManager.isConnected
        state.hasPort = !!this.serialManager.port
        if (!this.serialManager.isConnected) reasons.push('serialManager.isConnected=false')
        if (!this.serialManager.port) {
          reasons.push('no port')
        } else {
          state.portIsOpen = this.serialManager.port.isOpen
          if (!this.serialManager.port.isOpen) reasons.push('port.isOpen=false')
        }
      }
      
      console.log(`[SolderingHardware] JSON command (simulation) - reasons: ${reasons.join(', ')}`)
      console.log('[SolderingHardware] Connection state:', state)
      console.log('[SolderingHardware] Command:', JSON.stringify(commandObj))
    }
  }

  async _moveToPosition(x, y, z) {
    // Single-axis machine: only Z-axis movement is supported
    // X and Y positions are ignored (PCB is moved manually)
    if (this.mode === 'hardware' && this.serialManager) {
      try {
        // Send JSON command to Arduino: {"command":"move","z":5.0}
        if (z !== null && z !== undefined) {
          await this._sendArduinoJsonCommand({
            command: 'move',
            z: z
          })
          // Update only Z position
          this.state.position.z = z
          this.state.position.isMoving = true
          this.emit('position:update', this.getPosition())
          // Set isMoving to false after a delay (Arduino will update this via JSON response)
          setTimeout(() => {
            this.state.position.isMoving = false
            this.emit('position:update', this.getPosition())
          }, 1000)
        }
      } catch (error) {
        throw new Error(`Movement failed: ${error.message}`)
      }
    } else {
      // Simulation mode - simulate movement
      this.state.position.isMoving = true
      this.emit('position:update', this.getPosition())
      
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate movement time
      
      // Update only Z position
      if (z !== null && z !== undefined) this.state.position.z = z
      this.state.position.isMoving = false
      this.emit('position:update', this.getPosition())
    }
  }

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

  /**
   * Alias for _updateCalibration - updates a calibration entry by label
   * @param {string} label - The label of the calibration entry to update
   * @param {object} updates - Object with properties to update (e.g., { value: '123.45' })
   */
  _updateCalibrationEntry(label, updates) {
    this._updateCalibration(label, updates)
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
        // Single-axis machine: only update Z position
        if (position.z !== undefined && position.z !== null) {
          this.state.position.z = position.z
        }

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
      // Update position from hardware status (Z-axis only)
      if (status.position) {
        // Only update Z position (single-axis machine)
        if (status.position.z !== undefined && status.position.z !== null) {
          this.state.position.z = status.position.z
        }
        this.state.position.isMoving = status.state !== 'Idle' && status.state !== 'Hold'

        this._updateCalibrationEntry('Z Axis', {
          value: `${this.state.position.z.toFixed(2)}`,
        })

        this.emit('position:update', this.getPosition())
      }
    })

    this.serialManager.on('data', (line) => {
      // Log incoming data for debugging
      // console.log('[Serial]', line)  // Commented out - Arduino sends status updates every 100ms
    })

    // Handle Arduino JSON data updates
    this.serialManager.on('arduino:data', (updates) => {
      // Mark this data as coming from Arduino (for frontend tracking)
      this.emit('arduino:data:received', { timestamp: Date.now(), updates })
      this._handleArduinoData(updates)
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

  _handleArduinoData(updates) {
    try {
      // Update position (Z-axis only - single-axis machine)
      if (updates.position) {
        const previousZ = this.state.position.z
        const wasMoving = this.state.position.isMoving
        const newZ = updates.position.z ?? this.state.position.z
        const isNowMoving = updates.position.isMoving ?? this.state.position.isMoving
        
        // Only update Z position (X and Y are not controlled by machine)
        this.state.position.z = newZ
        this.state.position.isMoving = isNowMoving
        
        // Log movement comparison when movement completes (was moving, now stopped)
        if (this._lastMovementCommand && wasMoving && !isNowMoving) {
          const actualDistance = newZ - this._lastMovementCommand.previousPosition
          const commandedDistance = this._lastMovementCommand.commandedDistance
          const timeSinceCommand = Date.now() - this._lastMovementCommand.timestamp
          
          // Only process if movement was recent (within 3 seconds) to avoid processing old movements
          if (timeSinceCommand < 3000) {
            const difference = actualDistance - commandedDistance
            const differencePercent = Math.abs(commandedDistance) > 0 
              ? ((difference / Math.abs(commandedDistance)) * 100).toFixed(2)
              : '0.00'
            
            console.log(`[Movement] Previous: ${this._lastMovementCommand.previousPosition.toFixed(2)}mm | Commanded: ${commandedDistance.toFixed(2)}mm | New Position: ${newZ.toFixed(2)}mm | Actual Movement: ${actualDistance.toFixed(2)}mm | Difference: ${difference > 0 ? '+' : ''}${difference.toFixed(2)}mm (${differencePercent}%)`)
            
            // Check if limit switch was hit (movement stopped early)
            // If actual movement is significantly less than commanded, likely hit a limit switch
            const movementStoppedEarly = Math.abs(actualDistance) < Math.abs(commandedDistance) * 0.5
            const isDownwardMovement = commandedDistance < 0
            const isUpwardMovement = commandedDistance > 0
            
            // Don't compensate if limit switch was hit - that's expected behavior
            if (!movementStoppedEarly) {
            // Automatic compensation: if actual movement is less than commanded, add the difference
            // Only compensate if:
            // 1. Not already compensating (prevent loops)
            // 2. Difference is significant (> 0.01mm)
            // 3. Actual movement is less than commanded (difference is negative for downward, positive for upward)
            const needsCompensation = !this._isCompensating && 
                                     Math.abs(difference) > 0.01 &&
                                     ((commandedDistance < 0 && actualDistance > commandedDistance) || // Downward: actual less negative = moved less
                                      (commandedDistance > 0 && actualDistance < commandedDistance))  // Upward: actual less positive = moved less
            
            if (needsCompensation) {
              const compensationDistance = commandedDistance - actualDistance
              console.log(`[Compensation] Actual movement (${actualDistance.toFixed(2)}mm) is less than commanded (${commandedDistance.toFixed(2)}mm). Compensating with additional ${compensationDistance.toFixed(2)}mm movement.`)
              
              // Set compensation flag to prevent loops
              this._isCompensating = true
              
              // Store compensation tracking (use current position as previous)
              // This will be used when compensation movement completes
              this._lastMovementCommand = {
                previousPosition: newZ,
                commandedDistance: compensationDistance,
                timestamp: Date.now(),
                isCompensation: true // Mark this as a compensation movement
              }
              
              // Send compensation jog command
              this._sendArduinoJsonCommand({
                command: 'jog',
                axis: 'z',
                distance: compensationDistance,
                speed: this.state.zAxisSpeed
              }).catch((error) => {
                console.error('[Compensation] Error sending compensation command:', error)
                this._isCompensating = false
                this._lastMovementCommand = null
              })
              }
            } else {
              // If this was a compensation movement, clear the flag when it completes
              if (this._lastMovementCommand && this._lastMovementCommand.isCompensation) {
                console.log(`[Compensation] Compensation movement completed. Total movement should now match commanded distance.`)
                this._isCompensating = false
              }
              
              // Clear the tracking data after logging
              this._lastMovementCommand = null
            }
          }
        }
        
        this._updateCalibrationEntry('Z Axis', { value: `${this.state.position.z.toFixed(2)}` })
        this.emit('position:update', this.getPosition())
      }

      // Update temperature
      if (updates.temperature) {
        this.state.tip.target = updates.temperature.target ?? this.state.tip.target
        this.state.tip.current = updates.temperature.current ?? this.state.tip.current
        this.state.tip.heaterEnabled = updates.temperature.heaterEnabled ?? this.state.tip.heaterEnabled
        this._updateCalibrationEntry('Tip Temp', { value: Math.round(this.state.tip.current) })
        this.emit('tip', this.getTipStatus())
      }

      // Update wire feed
      if (updates.wireFeed) {
        this.state.wireFeed.status = updates.wireFeed.status ?? this.state.wireFeed.status
        this.state.wireFeed.currentFeedRate = updates.wireFeed.feedRate ?? this.state.wireFeed.currentFeedRate
        if (updates.wireFeed.wireBreak) {
          this.state.wireFeed.wireBreak = {
            detected: true,
            timestamp: Date.now(),
            message: 'Wire break detected',
          }
          this.emit('wireBreak', this.state.wireFeed.wireBreak)
        }
        this.emit('wireFeed', this.getWireFeedStatus())
      }

      // Update spool (synchronize percentage and weight)
      if (updates.spool) {
        const { spool } = this.state
        
        // Update wire diameter if provided
        if (updates.spool.wireDiameter !== undefined) {
          spool.wireDiameter = updates.spool.wireDiameter
        }
        
        // Update isFeeding status
        if (updates.spool.isFeeding !== undefined) {
          spool.isFeeding = updates.spool.isFeeding
        }
        
        // Priority 1: If remainingPercentage is provided from Arduino, use it to sync weight
        if (updates.spool.remainingPercentage !== undefined && spool.initialWeight > 0) {
          const arduinoPercentage = Math.max(0, Math.min(100, updates.spool.remainingPercentage))
          
          // Calculate netWeight from percentage
          const syncedNetWeight = spool.initialWeight * (arduinoPercentage / 100)
          
          // Update currentWeight (add tare weight back to get total weight)
          spool.currentWeight = syncedNetWeight + spool.tareWeight
          
          // Calculate wire length from percentage
          if (spool.initialWireLength > 0) {
            spool.currentWireLength = spool.initialWireLength * (arduinoPercentage / 100)
          }
        }
        // Priority 2: If weight is provided from Arduino, use it to sync percentage
        else if (updates.spool.weight !== undefined && spool.initialWeight > 0) {
          const arduinoWeight = Math.max(0, updates.spool.weight)
          // Calculate net weight (subtract tare)
          const arduinoNetWeight = Math.max(0, arduinoWeight - spool.tareWeight)
          
          // Ensure netWeight doesn't exceed initialWeight
          const clampedNetWeight = Math.min(arduinoNetWeight, spool.initialWeight)
          
          // Calculate percentage from weight
          const calculatedPercentage = (clampedNetWeight / spool.initialWeight) * 100
          
          // Update currentWeight
          spool.currentWeight = clampedNetWeight + spool.tareWeight
          
          // Calculate wire length from percentage
          if (spool.initialWireLength > 0) {
            spool.currentWireLength = spool.initialWireLength * (calculatedPercentage / 100)
          }
        }
        // Priority 3: If wireLength is provided, calculate from length
        else if (updates.spool.wireLength !== undefined) {
          spool.currentWireLength = Math.max(0, updates.spool.wireLength)
          // Calculate weight from length
          spool.currentWeight = this._calculateWireWeight(spool.currentWireLength)
        }
        
        // Update initial weight if not set and we have current weight
        if (spool.isTared && spool.currentWireLength > 0 && spool.initialWeight === 0) {
          const calculatedNetWeight = spool.currentWeight - spool.tareWeight
          if (calculatedNetWeight > 0) {
            spool.initialWeight = calculatedNetWeight
          }
        }
        
        // Update calibration display
        this._updateWireRemainingDisplay()
        this.emit('spool', this.getSpoolState())
      }

      // Update flux
      if (updates.flux) {
        this.state.flux.percentage = updates.flux.percentage ?? this.state.flux.percentage
        this.state.flux.remainingMl = updates.flux.remainingMl ?? this.state.flux.remainingMl
        this._updateCalibrationEntry('Flux Remaining', { value: Math.round(this.state.flux.percentage) })
        this.emit('flux', this.getFluxState())
      }

      // Update fans
      if (updates.fans) {
        this.state.fans.machine = updates.fans.machine ?? this.state.fans.machine
        this.state.fans.tip = updates.fans.tip ?? this.state.fans.tip
        this.emit('fan', this.getFanState())
      }

      // Update fume extractor
      if (updates.fumeExtractor) {
        this.state.fumeExtractor.enabled = updates.fumeExtractor.enabled ?? this.state.fumeExtractor.enabled
        this.state.fumeExtractor.speed = updates.fumeExtractor.speed ?? this.state.fumeExtractor.speed
        this.emit('fumeExtractor', this.getFumeExtractorState())
      }

      // Update flux mist
      if (updates.fluxMist) {
        this.state.fluxMist.enabled = updates.fluxMist.enabled ?? this.state.fluxMist.enabled
        this.state.fluxMist.isDispensing = updates.fluxMist.isDispensing ?? this.state.fluxMist.isDispensing
        this.state.fluxMist.flowRate = updates.fluxMist.flowRate ?? this.state.fluxMist.flowRate
        this.emit('fluxMist', this.getFluxMistState())
      }

      // Update air breeze
      if (updates.airBreeze) {
        this.state.airBreeze.enabled = updates.airBreeze.enabled ?? this.state.airBreeze.enabled
        this.state.airBreeze.isActive = updates.airBreeze.isActive ?? this.state.airBreeze.isActive
        this.state.airBreeze.intensity = updates.airBreeze.intensity ?? this.state.airBreeze.intensity
        this.emit('airBreeze', this.getAirBreezeState())
      }

      // Update air jet pressure
      if (updates.airJetPressure) {
        this.state.airJetPressure.enabled = updates.airJetPressure.enabled ?? this.state.airJetPressure.enabled
        this.state.airJetPressure.isActive = updates.airJetPressure.isActive ?? this.state.airJetPressure.isActive
        this.state.airJetPressure.pressure = updates.airJetPressure.pressure ?? this.state.airJetPressure.pressure
        this.emit('airJetPressure', this.getAirJetPressureState())
      }

      // Update sequence
      if (updates.sequence) {
        this.state.sequence.stage = updates.sequence.stage ?? this.state.sequence.stage
        this.state.sequence.isActive = updates.sequence.isActive ?? this.state.sequence.isActive
        this.state.sequence.currentPad = updates.sequence.currentPad ?? this.state.sequence.currentPad
        this.state.sequence.totalPads = updates.sequence.totalPads ?? this.state.sequence.totalPads
        this.state.sequence.progress = updates.sequence.progress ?? this.state.sequence.progress
        this.state.sequence.error = updates.sequence.error ?? this.state.sequence.error
        this.emit('sequence', this.getSequenceState())
      }

      // Update component height
      if (updates.componentHeight !== undefined && updates.componentHeight !== null) {
        this.state.componentHeightMm = updates.componentHeight
      }

      // Update jig height (if sent from Arduino)
      if (updates.jigHeight !== undefined && updates.jigHeight !== null) {
        this.state.jigHeightMm = updates.jigHeight
      }

      // Update limit switch status
      if (updates.limitSwitches) {
        const upperLimitTriggered = Boolean(updates.limitSwitches.upper)
        const lowerLimitTriggered = Boolean(updates.limitSwitches.lower)
        
        console.log('[SolderingHardware] Limit switches - Upper:', upperLimitTriggered, 'Lower:', lowerLimitTriggered)
        
        // Emit limit switch events for both upper and lower
        // ALWAYS emit, even if false, so app knows current state
        const payload = {
          upper: upperLimitTriggered,
          lower: lowerLimitTriggered,
          timestamp: Date.now()
        }
        console.log('[SolderingHardware] Emitting limitSwitch:update:', payload)
        this.emit('limitSwitch:update', payload)
      }
    } catch (error) {
      console.error('[SolderingHardware] Error handling Arduino data:', error)
    }
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

  static async listSerialPorts() {
    return SerialPortManager.listPorts()
  }

  getSerialStatus() {
    if (this.mode === 'hardware' && this.serialManager) {
      return this.serialManager.getStatus()
    }
    return { isConnected: false, mode: 'simulation' }
  }
}

