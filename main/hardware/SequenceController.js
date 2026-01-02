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
        wireLength: null
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
        const solderingZ = z || 0
        await this.movementController.moveToPosition(null, null, solderingZ)
        
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
        await this.movementController.moveToPosition(null, null, safeZ)
        
        if (this.auxiliaryController.state.airBreeze.autoMode && !this.auxiliaryController.state.airBreeze.isActive) {
          await this.auxiliaryController.activateAirBreeze()
        }
        break

      default:
        console.warn(`[Sequence] Unknown action: ${action}`)
    }
  }
}