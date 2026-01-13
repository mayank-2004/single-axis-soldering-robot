import { EventEmitter } from 'events'

export default class WireFeedController extends EventEmitter {
  constructor(serialManager) {
    super()
    this.serialManager = serialManager
    this.timers = []
    
    this.state = {
      wireFeed: {
        status: 'idle',
        message: 'Ready to feed',
        currentFeedRate: 8.0,
        wireBreak: { detected: false, timestamp: null, message: null },
      },
      spool: {
        spoolDiameter: 50.0,
        wireDiameter: 0.5,
        initialWireLength: 10000.0,
        currentWireLength: 10000.0,
        solderDensity: 8.5,
        tareWeight: 0.0,
        currentWeight: 0.0,
        initialWeight: 0.0,
        isTared: false,
        totalRotations: 0,
        currentRotation: 0.0,
        stepsPerRotation: 200,
        stepsPerMm: 8,
        isFeeding: false,
        lastFeedLength: 0,
        lastUpdated: Date.now(),
        lastCycleWireLengthUsed: 0,
      }
    }
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

    if (lengthNumeric > this.state.spool.currentWireLength) {
      const error = `Insufficient wire. Requested: ${lengthNumeric.toFixed(1)} mm, Available: ${this.state.spool.currentWireLength.toFixed(1)} mm`
      this.state.wireFeed.status = 'error'
      this.state.wireFeed.message = error
      this.emit('wireFeed', this.getWireFeedStatus())
      return { error }
    }

    this.state.wireFeed.status = 'feeding'
    this.state.wireFeed.message = `Feeding ${lengthNumeric.toFixed(1)} mm at ${rateNumeric.toFixed(1)} mm/s`
    this.state.wireFeed.currentFeedRate = rateNumeric
    this.state.spool.isFeeding = true
    this.state.spool.lastFeedLength = lengthNumeric

    this.emit('wireFeed', this.getWireFeedStatus())
    this.emit('spool', this.getSpoolState())

    const { spool } = this.state
    const effectiveDiameter = spool.spoolDiameter + (spool.wireDiameter * 2)
    const circumference = Math.PI * effectiveDiameter
    const rotationsNeeded = lengthNumeric / circumference

    if (this.serialManager?.isConnected) {
      try {
        console.log(`[WireFeedController] Sending wire feed command: { command: 'feed', length: ${lengthNumeric} }`)
        await this._sendCommand({ command: 'feed', length: lengthNumeric })
        console.log(`[WireFeedController] Wire feed command sent successfully`)
        const durationMs = Math.max(1200, (lengthNumeric / rateNumeric) * 1000)
        
        this._registerTimeout(() => {
          if (!this.state.wireFeed.wireBreak.detected) {
            this._updateSpoolAfterFeed(lengthNumeric, rotationsNeeded, skipWireRemainingUpdate)
            this.state.wireFeed.status = 'completed'
            this.state.wireFeed.message = `Completed feed of ${lengthNumeric.toFixed(1)} mm`
            this.state.spool.isFeeding = false
            this.emit('wireFeed', { ...this.getWireFeedStatus(), completedAt: Date.now() })
            this.emit('spool', this.getSpoolState())
          }
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
      const durationMs = Math.max(1200, (lengthNumeric / rateNumeric) * 1000)
      this._registerTimeout(() => {
        if (!this.state.wireFeed.wireBreak.detected) {
          this._updateSpoolAfterFeed(lengthNumeric, rotationsNeeded, skipWireRemainingUpdate)
          this.state.wireFeed.status = 'completed'
          this.state.wireFeed.message = `Completed feed of ${lengthNumeric.toFixed(1)} mm`
          this.state.spool.isFeeding = false
          this.emit('wireFeed', { ...this.getWireFeedStatus(), completedAt: Date.now() })
          this.emit('spool', this.getSpoolState())
        }
      }, durationMs)
    }

    return { status: this.state.wireFeed.message }
  }

  getWireFeedStatus() {
    return {
      status: this.state.wireFeed.status,
      message: this.state.wireFeed.message,
      currentFeedRate: this.state.wireFeed.currentFeedRate,
      wireBreak: this.state.wireFeed.wireBreak,
    }
  }

  getSpoolState() {
    const { spool } = this.state
    const wireRadius = spool.wireDiameter / 2
    const layers = Math.floor((spool.initialWireLength - spool.currentWireLength) / (Math.PI * spool.spoolDiameter))
    const effectiveDiameter = spool.spoolDiameter + (layers * 2 * wireRadius)
    
    let remainingPercentage = 0
    if (spool.initialWireLength > 0) {
      remainingPercentage = (spool.currentWireLength / spool.initialWireLength) * 100
    }
    remainingPercentage = Math.max(0, Math.min(100, remainingPercentage))
    
    const calculatedWeight = this._calculateWireWeight(spool.currentWireLength)
    const netWeightFromLength = calculatedWeight - spool.tareWeight
    let netWeight = netWeightFromLength
    
    if (spool.initialWeight > 0) {
      const syncedNetWeight = spool.initialWeight * (remainingPercentage / 100)
      netWeight = Math.max(0, syncedNetWeight)
      if (netWeight > spool.initialWeight) {
        netWeight = spool.initialWeight
        remainingPercentage = (netWeight / spool.initialWeight) * 100
      }
    }
    
    return {
      spoolDiameter: spool.spoolDiameter,
      wireDiameter: spool.wireDiameter,
      initialWireLength: spool.initialWireLength,
      currentWireLength: spool.currentWireLength,
      remainingPercentage: Math.max(0, Math.min(100, remainingPercentage)),
      remainingLength: Math.max(0, spool.currentWireLength),
      totalRotations: spool.totalRotations,
      currentRotation: spool.currentRotation,
      effectiveDiameter: effectiveDiameter,
      isFeeding: spool.isFeeding,
      lastFeedLength: spool.lastFeedLength,
      lastUpdated: spool.lastUpdated,
      solderDensity: spool.solderDensity,
      currentWeight: calculatedWeight,
      netWeight: Math.max(0, netWeight),
      initialWeight: spool.initialWeight,
      tareWeight: spool.tareWeight,
      isTared: spool.isTared,
      lastCycleWireLengthUsed: spool.lastCycleWireLengthUsed || 0,
      currentFeedRate: this.state.wireFeed.currentFeedRate || 8.0,
    }
  }

  _calculateWireWeight(wireLength) {
    const { spool } = this.state
    const radiusMm = spool.wireDiameter / 2
    const volumeMm3 = Math.PI * radiusMm * radiusMm * wireLength
    const densityGPerMm3 = spool.solderDensity / 1000
    return volumeMm3 * densityGPerMm3
  }

  _updateSpoolAfterFeed(feedLength, rotations, skipWireRemainingUpdate = false) {
    const { spool } = this.state
    
    if (!skipWireRemainingUpdate) {
      spool.currentWireLength = Math.max(0, spool.currentWireLength - feedLength)
      let remainingPercentage = 0
      if (spool.initialWireLength > 0) {
        remainingPercentage = (spool.currentWireLength / spool.initialWireLength) * 100
      }
      remainingPercentage = Math.max(0, Math.min(100, remainingPercentage))
      
      if (spool.initialWeight > 0) {
        const newNetWeight = spool.initialWeight * (remainingPercentage / 100)
        spool.currentWeight = newNetWeight + spool.tareWeight
      } else {
        spool.currentWeight = this._calculateWireWeight(spool.currentWireLength)
      }
    }
    
    spool.totalRotations += rotations
    spool.currentRotation = (spool.currentRotation + (rotations * 360)) % 360
    spool.lastUpdated = Date.now()
  }

  _registerTimeout(callback, delay) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((timer) => timer.id !== id)
      callback()
    }, delay)
    this.timers.push({ type: 'timeout', id })
    return id
  }

  async _sendCommand(commandObj) {
    if (this.serialManager?.sendJsonCommand) {
      await this.serialManager.sendJsonCommand(commandObj)
    }
  }

  handleArduinoData(updates) {
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

    if (updates.spool) {
      const { spool } = this.state
      if (updates.spool.wireDiameter !== undefined) {
        spool.wireDiameter = updates.spool.wireDiameter
      }
      if (updates.spool.isFeeding !== undefined) {
        spool.isFeeding = updates.spool.isFeeding
      }
      this.emit('spool', this.getSpoolState())
    }
  }
}