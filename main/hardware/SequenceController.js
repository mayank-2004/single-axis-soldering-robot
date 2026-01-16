import { EventEmitter } from 'events'

const sequenceStages = [
  { name: 'Lowering Z axis', action: 'lowerZ' },
  { name: 'Applying flux', action: 'applyFlux' },
  { name: 'Pre-heat dwell', action: 'preHeatDwell' },
  { name: 'Dispensing solder', action: 'dispense' },
  { name: 'Post-solder cooling', action: 'postSolderCooling' },
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
        retractClearance: 7.5,  // mm - clearance above jig surface after soldering (5-10mm range)
        preHeatDwellTime: 500,  // ms - time to wait after lowering Z before dispensing (allows tip to heat pad)
        postSolderCoolingTime: 1000,  // ms - time to wait after dispensing to let solder solidify
        fluxBeforePreHeat: true,  // Apply flux before pre-heat dwell (true) or after lowering Z (false)
        enableMultiplePasses: true,  // Enable multiple passes for large pads
        largePadThreshold: 10.0,  // mm² - pad area threshold for multiple passes
        passesPerLargePad: 2,  // Number of dispense/clean cycles for large pads
        currentPass: 0,  // Track current pass for multiple pass logic
        maxPasses: 1  // Maximum passes for current pad (calculated based on pad size)
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

    // Use saved movement position if padPositions is empty or doesn't have z values
    let pads = padPositions.length > 0 ? padPositions : []
    
    // If no pad positions provided, use saved movement position
    if (pads.length === 0 || pads.every(pad => pad.z === undefined || pad.z === null)) {
      const savedDistance = this.movementController.state.position.savedMovementDistance || 0
      const hasSaved = this.movementController.state.position.hasSavedMovement
      
      if (hasSaved) {
        // Calculate target position: home (0.0) + savedMovementDistance (negative value)
        const savedZ = savedDistance  // savedMovementDistance is already relative to home
        pads = [{ z: savedZ }]
        console.log(`[Sequence] Using saved movement position: ${savedZ.toFixed(2)}mm (hasSaved: ${hasSaved}, savedDistance: ${savedDistance})`)
      } else {
        // Fallback to home position if no saved movement
        pads = [{ z: 0 }]
        console.warn('[Sequence] No saved movement found. Using home position (0.00mm). Please save a movement first.')
      }
    }

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
    this.state.sequence.currentPass = 0
    this.state.sequence.maxPasses = 1
    
    // Set retraction clearance (5-10mm range, default 7.5mm)
    if (options.retractClearance !== undefined) {
      this.state.sequence.retractClearance = Math.max(5.0, Math.min(10.0, Number(options.retractClearance) || 7.5))
    }
    
    // Enhanced sequence options
    if (options.preHeatDwellTime !== undefined) {
      this.state.sequence.preHeatDwellTime = Math.max(0, Math.min(5000, Number(options.preHeatDwellTime) || 500))
    }
    if (options.postSolderCoolingTime !== undefined) {
      this.state.sequence.postSolderCoolingTime = Math.max(0, Math.min(10000, Number(options.postSolderCoolingTime) || 1000))
    }
    if (options.fluxBeforePreHeat !== undefined) {
      this.state.sequence.fluxBeforePreHeat = Boolean(options.fluxBeforePreHeat)
    }
    if (options.enableMultiplePasses !== undefined) {
      this.state.sequence.enableMultiplePasses = Boolean(options.enableMultiplePasses)
    }
    if (options.largePadThreshold !== undefined) {
      this.state.sequence.largePadThreshold = Math.max(1.0, Math.min(100.0, Number(options.largePadThreshold) || 10.0))
    }
    if (options.passesPerLargePad !== undefined) {
      this.state.sequence.passesPerLargePad = Math.max(1, Math.min(5, Number(options.passesPerLargePad) || 2))
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
    const { stage, isActive, isPaused, lastCompleted, currentPad, totalPads, progress, error, totalWireLengthUsed, wireLengthPerPad, currentPass, maxPasses } = this.state.sequence
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
      currentPass: currentPass || 0,
      maxPasses: maxPasses || 1,
    }
  }
  
  // Configuration methods for enhanced sequence options
  setPreHeatDwellTime(timeMs) {
    const timeValue = Math.max(0, Math.min(5000, Number(timeMs) || 500))
    this.state.sequence.preHeatDwellTime = timeValue
    return { status: `Pre-heat dwell time set to ${timeValue}ms (${(timeValue / 1000).toFixed(1)}s)` }
  }
  
  getPreHeatDwellTime() {
    return this.state.sequence.preHeatDwellTime || 500
  }
  
  setPostSolderCoolingTime(timeMs) {
    const timeValue = Math.max(0, Math.min(10000, Number(timeMs) || 1000))
    this.state.sequence.postSolderCoolingTime = timeValue
    return { status: `Post-solder cooling time set to ${timeValue}ms (${(timeValue / 1000).toFixed(1)}s)` }
  }
  
  getPostSolderCoolingTime() {
    return this.state.sequence.postSolderCoolingTime || 1000
  }
  
  setFluxBeforePreHeat(enabled) {
    this.state.sequence.fluxBeforePreHeat = Boolean(enabled)
    return { status: `Flux application ${enabled ? 'before' : 'after'} pre-heat` }
  }
  
  getFluxBeforePreHeat() {
    return this.state.sequence.fluxBeforePreHeat !== false
  }
  
  setEnableMultiplePasses(enabled) {
    this.state.sequence.enableMultiplePasses = Boolean(enabled)
    return { status: `Multiple passes ${enabled ? 'enabled' : 'disabled'}` }
  }
  
  getEnableMultiplePasses() {
    return this.state.sequence.enableMultiplePasses !== false
  }
  
  setLargePadThreshold(thresholdMm2) {
    const thresholdValue = Math.max(1.0, Math.min(100.0, Number(thresholdMm2) || 10.0))
    this.state.sequence.largePadThreshold = thresholdValue
    return { status: `Large pad threshold set to ${thresholdValue.toFixed(1)}mm²` }
  }
  
  getLargePadThreshold() {
    return this.state.sequence.largePadThreshold || 10.0
  }
  
  setPassesPerLargePad(passes) {
    const passesValue = Math.max(1, Math.min(5, Number(passes) || 2))
    this.state.sequence.passesPerLargePad = passesValue
    return { status: `Passes per large pad set to ${passesValue}` }
  }
  
  getPassesPerLargePad() {
    return this.state.sequence.passesPerLargePad || 2
  }

  setThermalMassDuration(duration) {
    const durationValue = Math.max(1000, Math.min(5000, Number(duration) || 1000))
    this.state.sequence.thermalMassDuration = durationValue
    return { status: `Thermal mass duration set to ${durationValue}ms (${(durationValue / 1000).toFixed(1)}s)` }
  }

  getThermalMassDuration() {
    return this.state.sequence.thermalMassDuration || 1000
  }

  // Calculate number of passes needed for a pad based on its size
  _calculatePassesForPad(padPosition) {
    if (!this.state.sequence.enableMultiplePasses) {
      return 1
    }
    
    // Calculate pad area if dimensions are available
    // Pad position can have: z, area, width, height, diameter, etc.
    let padArea = 0
    
    if (padPosition.area !== undefined) {
      padArea = Number(padPosition.area) || 0
    } else if (padPosition.width !== undefined && padPosition.height !== undefined) {
      padArea = Number(padPosition.width) * Number(padPosition.height)
    } else if (padPosition.diameter !== undefined) {
      const radius = Number(padPosition.diameter) / 2
      padArea = Math.PI * radius * radius
    }
    
    // If pad area exceeds threshold, use multiple passes
    if (padArea > this.state.sequence.largePadThreshold) {
      return this.state.sequence.passesPerLargePad
    }
    
    return 1
  }

  async _executeSequence() {
    const sequence = this.state.sequence

    if (!sequence.isActive || sequence.isPaused) {
      console.log(`[Sequence] _executeSequence: sequence not active or paused (isActive: ${sequence.isActive}, isPaused: ${sequence.isPaused})`)
      return
    }
    
    console.log(`[Sequence] _executeSequence: currentPad=${sequence.currentPad}, totalPads=${sequence.totalPads}, index=${sequence.index}`)

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
    
    // Calculate max passes for current pad when starting a new pad (index === 0)
    if (sequence.index === 0) {
      sequence.currentPass = 0
      sequence.maxPasses = this._calculatePassesForPad(currentPad)
      if (sequence.maxPasses > 1) {
        console.log(`[Sequence] Pad ${sequence.currentPad + 1} requires ${sequence.maxPasses} passes (large pad)`)
      }
    }
    
    const currentStage = sequenceStages[sequence.index]

    if (!currentStage) {
      // All stages complete - check if we need more passes
      if (sequence.currentPass < sequence.maxPasses - 1) {
        // More passes needed - reset to dispense stage
        sequence.currentPass++
        sequence.index = sequenceStages.findIndex(stage => stage.action === 'dispense')
        console.log(`[Sequence] Starting pass ${sequence.currentPass + 1} of ${sequence.maxPasses} for pad ${sequence.currentPad + 1}`)
        this.emit('sequence', this.getSequenceState())
        await this._executeSequence()
        return
      }
      
      // All passes complete for this pad - move to next pad
      sequence.currentPad++
      sequence.index = 0
      sequence.currentPass = 0
      sequence.maxPasses = 1
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
        
        console.log(`[Sequence] lowerZ stage: padPosition.z = ${z}, solderingZ = ${solderingZ.toFixed(2)}mm`)
        
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
          console.log(`[Sequence] Moving to soldering position: ${clampedSolderingZ.toFixed(2)}mm (no jig height set)`)
        }
        
        console.log(`[Sequence] Calling moveToPosition with z = ${clampedSolderingZ.toFixed(2)}mm`)
        await this.movementController.moveToPosition(null, null, clampedSolderingZ)
        console.log(`[Sequence] moveToPosition completed`)
        
        // Apply flux immediately after lowering if fluxBeforePreHeat is false
        if (!this.state.sequence.fluxBeforePreHeat && this.auxiliaryController.state.fluxMist.autoMode && !this.auxiliaryController.state.fluxMist.isDispensing) {
          await this.auxiliaryController.dispenseFluxMist()
        }
        break

      case 'applyFlux':
        // Apply flux before pre-heat (if fluxBeforePreHeat is true)
        if (this.state.sequence.fluxBeforePreHeat && this.auxiliaryController.state.fluxMist.autoMode && !this.auxiliaryController.state.fluxMist.isDispensing) {
          await this.auxiliaryController.dispenseFluxMist()
        }
        break

      case 'preHeatDwell':
        // Wait for tip to heat the pad before dispensing solder
        // This allows the pad to reach proper temperature for good solder flow
        // Use thermalMassDuration (from Pad Metrics) if available, otherwise use preHeatDwellTime
        const thermalDuration = this.state.sequence.thermalMassDuration || this.state.sequence.preHeatDwellTime || 500
        console.log(`[Sequence] Pre-heat dwell: waiting ${thermalDuration}ms for pad to heat (thermal mass compensated: ${this.state.sequence.thermalMassDuration ? 'yes' : 'no'})`)
        await new Promise((resolve) => setTimeout(resolve, thermalDuration))
        break

      case 'dispense':
        if (this.auxiliaryController.state.fumeExtractor.autoMode && !this.auxiliaryController.state.fumeExtractor.enabled) {
          this.auxiliaryController.setFumeExtractorEnabled(true)
        }
        
        let wireLength = 5.0
        if (this.state.sequence.wireLength) {
          wireLength = this.state.sequence.wireLength
        }
        
        // For multiple passes, reduce wire length per pass
        if (this.state.sequence.maxPasses > 1) {
          wireLength = wireLength / this.state.sequence.maxPasses
          console.log(`[Sequence] Pass ${this.state.sequence.currentPass + 1}/${this.state.sequence.maxPasses}: dispensing ${wireLength.toFixed(2)}mm wire`)
        }
        
        const currentPadIndex = this.state.sequence.currentPad
        if (!this.state.sequence.wireLengthPerPad[currentPadIndex]) {
          this.state.sequence.wireLengthPerPad[currentPadIndex] = 0
        }
        this.state.sequence.wireLengthPerPad[currentPadIndex] += wireLength
        this.state.sequence.totalWireLengthUsed += wireLength
        
        const feedRate = 8.0
        console.log(`[Sequence] Starting wire feed: ${wireLength.toFixed(2)}mm at ${feedRate}mm/s`)
        await this.wireFeedController.startWireFeed(wireLength, feedRate, true)
        
        // Wait for wire feed to complete - check status from Arduino updates
        let waitCount = 0
        const maxWait = 100  // Maximum 10 seconds (100 * 100ms)
        while (this.wireFeedController.state.wireFeed.status === 'feeding' && waitCount < maxWait) {
          await new Promise(resolve => setTimeout(resolve, 100))
          waitCount++
        }
        
        if (this.wireFeedController.state.wireFeed.status === 'feeding') {
          console.warn(`[Sequence] Wire feed still in 'feeding' status after ${maxWait * 100}ms, continuing anyway`)
        } else {
          console.log(`[Sequence] Wire feed completed with status: ${this.wireFeedController.state.wireFeed.status}`)
        }
        break

      case 'postSolderCooling':
        // Wait after dispensing to let solder solidify before moving
        // This prevents solder from being disturbed while still molten
        const coolingDuration = this.state.sequence.postSolderCoolingTime || 1000
        console.log(`[Sequence] Post-solder cooling: waiting ${coolingDuration}ms for solder to solidify`)
        await new Promise((resolve) => setTimeout(resolve, coolingDuration))
        break

      case 'cleanTip':
        // Only clean tip on the last pass (or if single pass)
        if (this.state.sequence.currentPass >= this.state.sequence.maxPasses - 1) {
          if (this.auxiliaryController.state.airJetPressure.autoMode && !this.auxiliaryController.state.airJetPressure.isActive) {
            await this.auxiliaryController.activateAirJetPressure()
          }
        } else {
          console.log(`[Sequence] Skipping tip clean (pass ${this.state.sequence.currentPass + 1}/${this.state.sequence.maxPasses} - will clean after final pass)`)
        }
        break

      case 'retract':
        // Only retract after all passes are complete for this pad
        if (this.state.sequence.currentPass < this.state.sequence.maxPasses - 1) {
          // More passes needed - skip retraction and loop back to dispense
          console.log(`[Sequence] Skipping retraction (pass ${this.state.sequence.currentPass + 1}/${this.state.sequence.maxPasses} - will retract after final pass)`)
          break
        }
        
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