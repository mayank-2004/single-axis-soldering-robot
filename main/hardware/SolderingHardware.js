import { EventEmitter } from 'events'

const sequenceStages = [
  'Positioning X axis',
  'Positioning Y axis',
  'Lowering Z axis',
  'Dispensing solder',
  'Retracting head',
  'Advancing to next pad',
]

const initialCalibration = [
  { label: 'X Axis', value: '120.00 → 132.50', unit: 'mm' },
  { label: 'Y Axis', value: '045.30 → 048.10', unit: 'mm' },
  { label: 'Z Axis', value: '003.20 → 000.00', unit: 'mm' },
  { label: 'Wire Remaining', value: 100, unit: '%', length: '14.3 m' },
  { label: 'Flux Remaining', value: 82, unit: '%' },
  { label: 'Tip Temp', value: 345, unit: '°C' },
  { label: 'Feed Rate', value: '12.0', unit: 'mm/s' },
  { label: 'Flow Rate', value: '1.0', unit: 'mm³/s' },
  { label: 'Speed', value: '210', unit: 'mm/s' },
]

const ambientTipTemp = 45
const maxFluxMl = 120

const randomIntInclusive = (min, max) => {
  const lower = Math.ceil(min)
  const upper = Math.floor(max)
  return Math.floor(Math.random() * (upper - lower + 1)) + lower
}

export default class SolderingHardware extends EventEmitter {
  constructor() {
    super()

    this.connected = false
    this.timers = []

    this.state = {
      componentHeightMm: null,
      calibration: initialCalibration.map((entry) => ({ ...entry })),
      fans: { machine: false, tip: false },
      flux: {
        percentage: 82,
        remainingMl: 68,
        lastUpdated: Date.now(),
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
      },
      sequence: {
        stage: 'idle',
        isActive: false,
        lastCompleted: null,
        index: 0,
        idleCountdown: 0,
      },
    }
  }

  connect() {
    if (this.connected) {
      return
    }
    this.connected = true
    this._startSimulationLoops()
  }

  disconnect() {
    if (!this.connected) {
      return
    }
    this.connected = false

    this.timers.forEach(({ type, id }) => {
      if (type === 'interval') {
        clearInterval(id)
      } else {
        clearTimeout(id)
      }
    })
    this.timers = []
  }

  getSnapshot() {
    return {
      calibration: this.state.calibration.map((entry) => ({ ...entry })),
      flux: this.getFluxState(),
      fans: this.getFanState(),
      tip: this.getTipStatus(),
      wireFeed: this.getWireFeedStatus(),
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

  getTipStatus() {
    return {
      target: this.state.tip.target,
      heater: this.state.tip.heaterEnabled,
      status: this.state.tip.statusMessage,
    }
  }

  getWireFeedStatus() {
    return {
      status: this.state.wireFeed.status,
      message: this.state.wireFeed.message,
    }
  }

  getSequenceState() {
    const { stage, isActive, lastCompleted } = this.state.sequence
    return { stage, isActive, lastCompleted }
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

  setTipTarget(target) {
    const numeric = Number.parseFloat(target)
    if (!Number.isFinite(numeric) || numeric <= 0) {
      const error = 'Target temperature must be positive.'
      this.state.tip.statusMessage = error
      this.emit('tip', this.getTipStatus())
      return { error }
    }

    this.state.tip.target = numeric
    this.state.tip.statusMessage = `Target set to ${numeric.toFixed(0)}°C`
    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }

  setHeaterEnabled(enabled) {
    this.state.tip.heaterEnabled = Boolean(enabled)
    this.state.tip.statusMessage = this.state.tip.heaterEnabled ? 'Heater enabled' : 'Heater disabled'
    this.emit('tip', this.getTipStatus())
    return { status: this.state.tip.statusMessage }
  }

  startWireFeed(length, rate) {
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

    const durationMs = Math.max(1200, (lengthNumeric / rateNumeric) * 1000)

    this.state.wireFeed.status = 'feeding'
    this.state.wireFeed.message = `Feeding ${lengthNumeric.toFixed(1)} mm at ${rateNumeric.toFixed(1)} mm/s`
    this.emit('wireFeed', this.getWireFeedStatus())

    this._registerTimeout(() => {
      this.state.wireFeed.status = 'completed'
      this.state.wireFeed.message = `Completed feed of ${lengthNumeric.toFixed(1)} mm`
      this.emit('wireFeed', {
        ...this.getWireFeedStatus(),
        completedAt: Date.now(),
      })
    }, durationMs)

    return { status: this.state.wireFeed.message }
  }

  handleWireAlert(payload) {
    console.log('[wire:alert]', payload)
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

  _startSimulationLoops() {
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
      this._updateCalibration('Tip Temp', {
        value: Number(this.state.tip.current.toFixed(1)),
      })

      if (heaterEnabled) {
        this.state.tip.statusMessage = `Heating to ${target.toFixed(0)}°C`
      } else {
        this.state.tip.statusMessage = `Cooling to ${ambientTipTemp.toFixed(0)}°C`
      }
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

    // Sequence cycle
    this._registerInterval(() => {
      const sequence = this.state.sequence

      if (!sequence.isActive) {
        if (sequence.idleCountdown > 0) {
          sequence.idleCountdown -= 1
          if (sequence.idleCountdown <= 0) {
            sequence.isActive = true
            sequence.index = 0
            sequence.stage = sequenceStages[0]
            if (!sequence.lastCompleted) {
              sequence.lastCompleted = 'Awaiting cycle'
            }
            this.emit('sequence', this.getSequenceState())
          }
          return
        }

        sequence.isActive = true
        sequence.index = 0
        sequence.stage = sequenceStages[0]
        if (!sequence.lastCompleted) {
          sequence.lastCompleted = 'Awaiting cycle'
        }
        this.emit('sequence', this.getSequenceState())
        return
      }

      if (sequence.index >= sequenceStages.length) {
        sequence.isActive = false
        sequence.stage = 'idle'
        sequence.lastCompleted = 'Cycle complete'
        sequence.index = 0
        sequence.idleCountdown = randomIntInclusive(2, 4)
        this.emit('sequence', this.getSequenceState())
        return
      }

      if (sequence.index > 0 && sequence.index - 1 < sequenceStages.length) {
        sequence.lastCompleted = sequenceStages[sequence.index - 1]
      }

      sequence.stage = sequenceStages[sequence.index]
      sequence.index += 1
      this.emit('sequence', this.getSequenceState())
    }, 6000)

    // Wire remaining depletion
    this._registerInterval(() => {
      const entry = this.state.calibration.find((item) => item.label === 'Wire Remaining')
      if (!entry) {
        return
      }

      const numeric = Number.parseFloat(entry.value)
      if (!Number.isFinite(numeric)) {
        return
      }

      const drop = Math.random() < 0.5 ? 0 : 1
      const next = Math.max(0, numeric - drop)
      if (next !== numeric) {
        this._updateCalibration('Wire Remaining', { value: next })
      }
    }, 12000)
  }
}

