import { EventEmitter } from 'events'

const maxFluxMl = 120

export default class AuxiliaryController extends EventEmitter {
  constructor(serialManager) {
    super()
    this.serialManager = serialManager

    this.state = {
      fans: { machine: false, tip: false },
      fumeExtractor: {
        enabled: false,
        speed: 90,
        autoMode: true,
      },
      flux: {
        percentage: 82,
        remainingMl: 68,
        lastUpdated: Date.now(),
      },
      fluxMist: {
        enabled: false,
        isDispensing: false,
        duration: 500,
        flowRate: 50,
        autoMode: true,
        lastDispensed: null,
      },
      airBreeze: {
        enabled: false,
        isActive: false,
        duration: 2000,
        intensity: 60,
        autoMode: true,
        lastActivated: null,
      },
      airJetPressure: {
        enabled: false,
        isActive: false,
        duration: 200,
        pressure: 80,
        autoMode: true,
        lastActivated: null,
      }
    }
  }

  setFanState(fan, enabled) {
    if (fan !== 'machine' && fan !== 'tip') {
      return { error: 'Unknown fan selection.' }
    }
    this.state.fans[fan] = Boolean(enabled)
    this.emit('fan', this.getFanState())
    return { status: this.getFanState() }
  }

  getFanState() {
    return { ...this.state.fans }
  }

  setFumeExtractorEnabled(enabled) {
    this.state.fumeExtractor.enabled = Boolean(enabled)

    if (this.serialManager?.isConnected) {
      try {
        this._sendCommand({
          command: 'fume',
          enabled: Boolean(enabled),
          speed: this.state.fumeExtractor.speed
        })
      } catch (error) {
        console.error('[AuxiliaryController] Error controlling fume extractor:', error)
      }
    }

    this.emit('fumeExtractor', this.getFumeExtractorState())
    return { status: this.getFumeExtractorState() }
  }

  setFumeExtractorSpeed(speed) {
    const speedNumeric = Number.parseFloat(speed)
    if (!Number.isFinite(speedNumeric) || speedNumeric < 0 || speedNumeric > 100) {
      return { error: 'Fume extractor speed must be between 0 and 100.' }
    }

    this.state.fumeExtractor.speed = Math.round(speedNumeric)

    if (this.state.fumeExtractor.enabled && this.serialManager?.isConnected) {
      try {
        this._sendCommand({
          command: 'fume',
          enabled: true,
          speed: this.state.fumeExtractor.speed
        })
      } catch (error) {
        console.error('[AuxiliaryController] Error setting fume extractor speed:', error)
      }
    }

    this.emit('fumeExtractor', this.getFumeExtractorState())
    return { status: this.getFumeExtractorState() }
  }

  getFumeExtractorState() {
    return {
      enabled: this.state.fumeExtractor.enabled,
      speed: this.state.fumeExtractor.speed,
      autoMode: this.state.fumeExtractor.autoMode,
    }
  }

  async dispenseFluxMist(duration = null, flowRate = null) {
    if (this.state.flux.percentage <= 0 || this.state.flux.remainingMl <= 0) {
      const error = 'No flux available. Please refill flux container.'
      this.emit('fluxMist', this.getFluxMistState())
      return { error }
    }

    const dispenseDuration = duration !== null ? duration : this.state.fluxMist.duration
    const dispenseFlowRate = flowRate !== null ? flowRate : this.state.fluxMist.flowRate

    const durationNumeric = Number.parseFloat(dispenseDuration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return { error: 'Duration must be greater than zero.' }
    }

    const flowRateNumeric = Number.parseFloat(dispenseFlowRate)
    if (!Number.isFinite(flowRateNumeric) || flowRateNumeric < 0 || flowRateNumeric > 100) {
      return { error: 'Flow rate must be between 0 and 100.' }
    }

    if (this.state.fluxMist.isDispensing) {
      return { error: 'Flux mist is already dispensing.' }
    }

    this.state.fluxMist.isDispensing = true
    this.emit('fluxMist', this.getFluxMistState())

    const fluxConsumptionPerSecond = (flowRateNumeric / 100) * 0.3
    const fluxConsumption = (durationNumeric / 1000) * fluxConsumptionPerSecond

    if (this.serialManager?.isConnected) {
      try {
        await this._sendCommand({
          command: 'fluxmist',
          dispense: true,
          duration: durationNumeric,
          flowRate: flowRateNumeric
        })

        await new Promise(resolve => setTimeout(resolve, durationNumeric))

        this.state.flux.remainingMl = Math.max(0, this.state.flux.remainingMl - fluxConsumption)
        this.state.flux.percentage = Math.max(0, (this.state.flux.remainingMl / maxFluxMl) * 100)
        this.emit('flux', this.getFluxState())

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
      return new Promise((resolve) => {
        setTimeout(() => {
          this.state.flux.remainingMl = Math.max(0, this.state.flux.remainingMl - fluxConsumption)
          this.state.flux.percentage = Math.max(0, (this.state.flux.remainingMl / maxFluxMl) * 100)
          this.emit('flux', this.getFluxState())

          this.state.fluxMist.isDispensing = false
          this.state.fluxMist.lastDispensed = Date.now()
          this.emit('fluxMist', this.getFluxMistState())

          resolve({ status: `Flux mist dispensed for ${durationNumeric}ms at ${flowRateNumeric}% flow rate` })
        }, durationNumeric)
      })
    }
  }

  getFluxState() {
    return {
      value: this.state.flux.percentage,
      unit: '%',
      volume: `${Math.max(0, this.state.flux.remainingMl).toFixed(1)} ml`,
      updatedAt: Date.now(),
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

  async activateAirBreeze(duration = null, intensity = null) {
    const breezeDuration = duration !== null ? duration : this.state.airBreeze.duration
    const breezeIntensity = intensity !== null ? intensity : this.state.airBreeze.intensity

    const durationNumeric = Number.parseFloat(breezeDuration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return { error: 'Duration must be greater than zero.' }
    }

    const intensityNumeric = Number.parseFloat(breezeIntensity)
    if (!Number.isFinite(intensityNumeric) || intensityNumeric < 0 || intensityNumeric > 100) {
      return { error: 'Intensity must be between 0 and 100.' }
    }

    if (this.state.airBreeze.isActive) {
      return { error: 'Air breeze is already active.' }
    }

    if (this.state.airJetPressure.isActive) {
      return { error: 'Air jet pressure is currently active. Please wait for it to complete before activating air breeze.' }
    }

    this.state.airBreeze.isActive = true
    this.state.airBreeze.enabled = true
    this.emit('airBreeze', this.getAirBreezeState())

    if (this.serialManager?.isConnected) {
      try {
        await this._sendCommand({
          command: 'airbreeze',
          activate: true,
          duration: durationNumeric,
          intensity: intensityNumeric
        })

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

  setAirBreezeEnabled(enabled) {
    this.state.airBreeze.enabled = Boolean(enabled)

    if (this.serialManager?.isConnected) {
      try {
        this._sendCommand({
          command: 'airbreeze',
          enabled: Boolean(enabled),
          intensity: this.state.airBreeze.intensity
        })
      } catch (error) {
        console.error('[AuxiliaryController] Error setting air breeze enabled:', error)
      }
    }

    this.emit('airBreeze', this.getAirBreezeState())
    return { status: this.getAirBreezeState() }
  }

  async activateAirJetPressure(duration = null, pressure = null) {
    const jetDuration = duration !== null ? duration : this.state.airJetPressure.duration
    const jetPressure = pressure !== null ? pressure : this.state.airJetPressure.pressure

    const durationNumeric = Number.parseFloat(jetDuration)
    if (!Number.isFinite(durationNumeric) || durationNumeric <= 0) {
      return { error: 'Duration must be greater than zero.' }
    }

    const pressureNumeric = Number.parseFloat(jetPressure)
    if (!Number.isFinite(pressureNumeric) || pressureNumeric < 0 || pressureNumeric > 100) {
      return { error: 'Pressure must be between 0 and 100.' }
    }

    if (this.state.airJetPressure.isActive) {
      return { error: 'Air jet pressure is already active.' }
    }

    if (this.state.airBreeze.isActive) {
      return { error: 'Air breeze is currently active. Please wait for it to complete before activating air jet pressure.' }
    }

    this.state.airJetPressure.isActive = true
    this.state.airJetPressure.enabled = true
    this.emit('airJetPressure', this.getAirJetPressureState())

    if (this.serialManager?.isConnected) {
      try {
        await this._sendCommand({
          command: 'airjet',
          activate: true,
          duration: durationNumeric,
          pressure: pressureNumeric
        })

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

  setAirJetPressureEnabled(enabled) {
    this.state.airJetPressure.enabled = Boolean(enabled)

    if (this.serialManager?.isConnected) {
      try {
        this._sendCommand({
          command: 'airjet',
          enabled: Boolean(enabled),
          pressure: this.state.airJetPressure.pressure
        })
      } catch (error) {
        console.error('[AuxiliaryController] Error setting air jet pressure enabled:', error)
      }
    }

    this.emit('airJetPressure', this.getAirJetPressureState())
    return { status: this.getAirJetPressureState() }
  }

  async _sendCommand(commandObj) {
    if (this.serialManager?.sendJsonCommand) {
      await this.serialManager.sendJsonCommand(commandObj)
    }
  }

  simulateFlux() {
    const drop = Math.random() < 0.6 ? 0 : 1
    if (drop <= 0) return

    const next = Math.max(0, this.state.flux.percentage - drop)
    if (next === this.state.flux.percentage) return

    this.state.flux.percentage = next
    this.state.flux.remainingMl = Math.max(0, this.state.flux.remainingMl - drop * (maxFluxMl / 100))
    this.emit('flux', this.getFluxState())
  }

  handleArduinoData(updates) {
    if (updates.flux) {
      this.state.flux.percentage = updates.flux.percentage ?? this.state.flux.percentage
      this.state.flux.remainingMl = updates.flux.remainingMl ?? this.state.flux.remainingMl
      this.emit('flux', this.getFluxState())
    }

    if (updates.fans) {
      this.state.fans.machine = updates.fans.machine ?? this.state.fans.machine
      this.state.fans.tip = updates.fans.tip ?? this.state.fans.tip
      this.emit('fan', this.getFanState())
    }

    if (updates.fumeExtractor) {
      this.state.fumeExtractor.enabled = updates.fumeExtractor.enabled ?? this.state.fumeExtractor.enabled
      this.state.fumeExtractor.speed = updates.fumeExtractor.speed ?? this.state.fumeExtractor.speed
      this.emit('fumeExtractor', this.getFumeExtractorState())
    }

    if (updates.fluxMist) {
      this.state.fluxMist.enabled = updates.fluxMist.enabled ?? this.state.fluxMist.enabled
      this.state.fluxMist.isDispensing = updates.fluxMist.isDispensing ?? this.state.fluxMist.isDispensing
      this.state.fluxMist.flowRate = updates.fluxMist.flowRate ?? this.state.fluxMist.flowRate
      this.emit('fluxMist', this.getFluxMistState())
    }

    if (updates.airBreeze) {
      this.state.airBreeze.enabled = updates.airBreeze.enabled ?? this.state.airBreeze.enabled
      this.state.airBreeze.isActive = updates.airBreeze.isActive ?? this.state.airBreeze.isActive
      this.state.airBreeze.intensity = updates.airBreeze.intensity ?? this.state.airBreeze.intensity
      this.emit('airBreeze', this.getAirBreezeState())
    }

    if (updates.airJetPressure) {
      this.state.airJetPressure.enabled = updates.airJetPressure.enabled ?? this.state.airJetPressure.enabled
      this.state.airJetPressure.isActive = updates.airJetPressure.isActive ?? this.state.airJetPressure.isActive
      this.state.airJetPressure.pressure = updates.airJetPressure.pressure ?? this.state.airJetPressure.pressure
      this.emit('airJetPressure', this.getAirJetPressureState())
    }
  }
}