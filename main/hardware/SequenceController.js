import { EventEmitter } from 'events'

const sequenceStages = [
  { name: 'Lowering Z axis', action: 'lowerZ' },
  { name: 'Dispensing solder', action: 'dispense' },
  { name: 'Cleaning tip', action: 'cleanTip' },
  { name: 'Retracting head', action: 'retract' },
]

export default class SequenceController extends EventEmitter {
  constructor(movementController, wireFeedController, auxiliaryController) {
    super()
    this.movementController = movementController
    this.wireFeedController = wireFeedController
    this.auxiliaryController = auxiliaryController
    
    this.state = {
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
        totalWireLengthUsed: 0,
        wireLengthPerPad: [],
        thermalMassDuration: 1000,
        wireLength: null,
        retractClearance: 7.5  // mm - clearance above jig surface after soldering (5-10mm range)
      }
    }
  }

  async startSequence(padPositions = [], options = {}) {
    if (this.state.sequence.isActive) {
      return { error: 'Sequence is already running' }
    }

    if (this.movementController.state.position.isMoving) {
      return { error: 'Machine is currently moving' }
    }

    const pads = padPositions.length > 0 ? padPositions : [{ z: 0 }]

    // Validate pad positions against jig surface (if jig height is set)
    if (this.movementController.state.jigHeightMm !== null) {
      const jigSurfaceFromHome = this.movementController.BED_HEIGHT_MM - this.movementController.state.jigHeightMm
      const jigSurfaceZ = -jigSurfaceFromHome  // Convert to negative (below home)
      
      const invalidPads = pads.filter((pad, index) => {
        const padZ = pad.z || 0
        return padZ < jigSurfaceZ
      })
      
      if (invalidPads.length > 0) {
        console.warn(`[Sequence] WARNING: ${invalidPads.length} pad position(s) are below jig surface (${jigSurfaceZ.toFixed(2)}mm). They will be clamped to jig surface to prevent collision.`)
      }
    }

    this.state.sequence.isActive = true
    this.state.sequence.isPaused = false
    this.state.sequence.currentPad = 0
    this.state.sequence.totalPads = pads.length
    this.state.sequence.padPositions = pads
    this.state.sequence.index = 0
    this.state.sequence.progress = 0
    this.state.sequence.error = null
    this.state.sequence.stage = 'idle'
    this.state.sequence.wireLength = options.wireLength || null
    this.state.sequence.totalWireLengthUsed = 0
    this.state.sequence.wireLengthPerPad = []
    // Set retraction clearance (5-10mm range, default 7.5mm)
    if (options.retractClearance !== undefined) {
      this.state.sequence.retractClearance = Math.max(5.0, Math.min(10.0, Number(options.retractClearance) || 7.5))
    }

    this.emit('sequence', this.getSequenceState())
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
    this._executeSequence()
    return { status: 'Sequence resumed' }
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

  setThermalMassDuration(duration) {
    const durationValue = Math.max(1000, Math.min(5000, Number(duration) || 1000))
    this.state.sequence.thermalMassDuration = durationValue
    return { status: `Thermal mass duration set to ${durationValue}ms (${(durationValue / 1000).toFixed(1)}s)` }
  }

  getThermalMassDuration() {
    return this.state.sequence.thermalMassDuration || 1000
  }

  async _executeSequence() {
    const sequence = this.state.sequence

    if (!sequence.isActive || sequence.isPaused) {
      return
    }

    if (sequence.currentPad >= sequence.totalPads) {
      sequence.isActive = false
      sequence.stage = 'idle'
      sequence.lastCompleted = 'All pads complete'
      sequence.progress = 100
      
      if (sequence.totalWireLengthUsed > 0) {
        this.wireFeedController._updateSpoolAfterCompleteCycle?.(sequence.totalWireLengthUsed)
      }
      
      this.emit('sequence', this.getSequenceState())
      return
    }

    const currentPad = sequence.padPositions[sequence.currentPad]
    const currentStage = sequenceStages[sequence.index]

    if (!currentStage) {
      sequence.currentPad++
      sequence.index = 0
      sequence.progress = Math.round((sequence.currentPad / sequence.totalPads) * 100)
      this.emit('sequence', this.getSequenceState())
      await this._executeSequence()
      return
    }

    sequence.stage = currentStage.name
    this.emit('sequence', this.getSequenceState())

    try {
      await this._executeStageAction(currentStage.action, currentPad, sequence.index)

      if (sequence.index > 0) {
        sequence.lastCompleted = sequenceStages[sequence.index - 1].name
      }
      sequence.index++

      await new Promise(resolve => setTimeout(resolve, 200))
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
    const { z } = padPosition
    let safeZ = 5

    if (this.movementController.state.jigHeightMm !== null) {
      const jigSurfaceFromHome = this.movementController.BED_HEIGHT_MM - this.movementController.state.jigHeightMm
      const componentHeight = this.movementController.state.componentHeightMm || 0
      safeZ = jigSurfaceFromHome + componentHeight
    } else if (this.movementController.state.componentHeightMm !== null) {
      safeZ = this.movementController.state.componentHeightMm + 2
    }

    switch (action) {
      case 'lowerZ':
        // Calculate safe soldering position - never below jig surface
        let solderingZ = z || 0
        let clampedSolderingZ = solderingZ
        
        if (this.movementController.state.jigHeightMm !== null) {
          // Calculate jig surface position (negative value, below home)
          const jigSurfaceFromHome = this.movementController.BED_HEIGHT_MM - this.movementController.state.jigHeightMm
          const jigSurfaceZ = -jigSurfaceFromHome  // Convert to negative (below home)
          
          // Minimum safe position: jig surface (or slightly above for safety)
          // Never allow soldering position below jig surface to prevent PCB collision
          const minSafeZ = jigSurfaceZ  // Can solder at jig surface level
          
          // Clamp soldering position to never go below jig surface
          if (solderingZ < minSafeZ) {
            clampedSolderingZ = minSafeZ
            console.warn(`[Sequence] Soldering position ${solderingZ.toFixed(2)}mm clamped to jig surface ${minSafeZ.toFixed(2)}mm to prevent collision`)
          } else {
            clampedSolderingZ = solderingZ
          }
          
          console.log(`[Sequence] Moving to soldering position: ${clampedSolderingZ.toFixed(2)}mm (jig surface at ${jigSurfaceZ.toFixed(2)}mm)`)
        } else {
          // If jig height not set, use position as-is but warn if it seems too low
          if (solderingZ < -250) {
            console.warn(`[Sequence] WARNING: Soldering position ${solderingZ.toFixed(2)}mm seems very low. Consider setting jig height for safety.`)
          }
        }
        
        await this.movementController.moveToPosition(null, null, clampedSolderingZ)
        
        if (this.auxiliaryController.state.fluxMist.autoMode && !this.auxiliaryController.state.fluxMist.isDispensing) {
          await this.auxiliaryController.dispenseFluxMist()
        }
        
        const dwellDuration = this.state.sequence.thermalMassDuration || 1000
        await new Promise((resolve) => setTimeout(resolve, dwellDuration))
        break

      case 'dispense':
        if (this.auxiliaryController.state.fumeExtractor.autoMode && !this.auxiliaryController.state.fumeExtractor.enabled) {
          this.auxiliaryController.setFumeExtractorEnabled(true)
        }
        
        let wireLength = 5.0
        if (this.state.sequence.wireLength) {
          wireLength = this.state.sequence.wireLength
        }
        
        const currentPadIndex = this.state.sequence.currentPad
        if (!this.state.sequence.wireLengthPerPad[currentPadIndex]) {
          this.state.sequence.wireLengthPerPad[currentPadIndex] = 0
        }
        this.state.sequence.wireLengthPerPad[currentPadIndex] += wireLength
        this.state.sequence.totalWireLengthUsed += wireLength
        
        const feedRate = 8.0
        await this.wireFeedController.startWireFeed(wireLength, feedRate, true)
        while (this.wireFeedController.state.wireFeed.status === 'feeding') {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        break

      case 'cleanTip':
        if (this.auxiliaryController.state.airJetPressure.autoMode && !this.auxiliaryController.state.airJetPressure.isActive) {
          await this.auxiliaryController.activateAirJetPressure()
        }
        break

      case 'retract':
        // Retract only 5-10mm from jig surface (not to home position)
        // This keeps the head close to the work area for efficient movement between components
        let retractZ = null
        const retractClearance = this.state.sequence.retractClearance || 7.5  // mm - clearance above jig surface (5-10mm range)
        
        if (this.movementController.state.jigHeightMm !== null) {
          // Calculate jig surface position (negative value, below home)
          const jigSurfaceFromHome = this.movementController.BED_HEIGHT_MM - this.movementController.state.jigHeightMm
          const jigSurfaceZ = -jigSurfaceFromHome  // Convert to negative (below home)
          
          // Retract to jig surface + clearance (5-10mm above jig surface)
          // This keeps head close to work area but with safe clearance
          retractZ = jigSurfaceZ + retractClearance
          
          console.log(`[Sequence] Retracting to ${retractZ.toFixed(2)}mm (${retractClearance.toFixed(1)}mm above jig surface at ${jigSurfaceZ.toFixed(2)}mm)`)
        } else {
          // Fallback: If jig height not set, retract upward from current soldering position
          const solderingZ = z || this.movementController.state.position.z || 0
          retractZ = solderingZ + retractClearance  // Move up by clearance amount from soldering position
          console.log(`[Sequence] Retracting ${retractClearance.toFixed(1)}mm upward from soldering position (jig height not set)`)
        }
        
        // Ensure we don't retract above home position (0.00mm)
        if (retractZ > 0) {
          retractZ = 0.0
          console.log(`[Sequence] Retraction clamped to home position (0.00mm)`)
        }
        
        await this.movementController.moveToPosition(null, null, retractZ)
        
        if (this.auxiliaryController.state.airBreeze.autoMode && !this.auxiliaryController.state.airBreeze.isActive) {
          await this.auxiliaryController.activateAirBreeze()
        }
        break

      default:
        console.warn(`[Sequence] Unknown action: ${action}`)
    }
  }
}