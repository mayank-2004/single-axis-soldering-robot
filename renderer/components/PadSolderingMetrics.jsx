import React from 'react'
import styles from './PadSolderingMetrics.module.css'

export default function PadSolderingMetrics({
  padShape,
  padDimensions,
  solderHeight,
  padArea,
  padVolume,
  wireUsed,
  stepsMoved,
  volumePerMm,
  onShapeChange,
  onDimensionChange,
  onSolderHeightChange,
  onCalculate,
  isCalculating,
}) {
  const renderShapeInputs = () => {
    switch (padShape) {
      case 'square':
        return (
          <div className={styles.controlRow}>
            <label htmlFor="square-side" className={styles.controlLabel}>
              Side Length
            </label>
            <div className={styles.controlFieldGroup}>
              <input
                id="square-side"
                name="square-side"
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                className={styles.controlInput}
                value={padDimensions.side || ''}
                onChange={(e) => onDimensionChange('side', e.target.value)}
                placeholder="e.g. 2.5"
              />
              <span className={styles.controlUnit}>mm</span>
            </div>
          </div>
        )

      case 'rectangle':
        return (
          <>
            <div className={styles.controlRow}>
              <label htmlFor="rect-length" className={styles.controlLabel}>
                Length
              </label>
              <div className={styles.controlFieldGroup}>
                <input
                  id="rect-length"
                  name="rect-length"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  className={styles.controlInput}
                  value={padDimensions.length || ''}
                  onChange={(e) => onDimensionChange('length', e.target.value)}
                  placeholder="e.g. 3.0"
                />
                <span className={styles.controlUnit}>mm</span>
              </div>
            </div>
            <div className={styles.controlRow}>
              <label htmlFor="rect-width" className={styles.controlLabel}>
                Width
              </label>
              <div className={styles.controlFieldGroup}>
                <input
                  id="rect-width"
                  name="rect-width"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  className={styles.controlInput}
                  value={padDimensions.width || ''}
                  onChange={(e) => onDimensionChange('width', e.target.value)}
                  placeholder="e.g. 2.0"
                />
                <span className={styles.controlUnit}>mm</span>
              </div>
            </div>
          </>
        )

      case 'circle':
        return (
          <div className={styles.controlRow}>
            <label htmlFor="circle-radius" className={styles.controlLabel}>
              Radius
            </label>
            <div className={styles.controlFieldGroup}>
              <input
                id="circle-radius"
                name="circle-radius"
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                className={styles.controlInput}
                value={padDimensions.radius || ''}
                onChange={(e) => onDimensionChange('radius', e.target.value)}
                placeholder="e.g. 1.25"
              />
              <span className={styles.controlUnit}>mm</span>
            </div>
          </div>
        )

      case 'concentric':
        return (
          <>
            <div className={styles.controlRow}>
              <label htmlFor="concentric-outer" className={styles.controlLabel}>
                Outer Radius
              </label>
              <div className={styles.controlFieldGroup}>
                <input
                  id="concentric-outer"
                  name="concentric-outer"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  className={styles.controlInput}
                  value={padDimensions.outerRadius || ''}
                  onChange={(e) => onDimensionChange('outerRadius', e.target.value)}
                  placeholder="e.g. 2.0"
                />
                <span className={styles.controlUnit}>mm</span>
              </div>
            </div>
            <div className={styles.controlRow}>
              <label htmlFor="concentric-inner" className={styles.controlLabel}>
                Inner Radius
              </label>
              <div className={styles.controlFieldGroup}>
                <input
                  id="concentric-inner"
                  name="concentric-inner"
                  type="number"
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  className={styles.controlInput}
                  value={padDimensions.innerRadius || ''}
                  onChange={(e) => onDimensionChange('innerRadius', e.target.value)}
                  placeholder="e.g. 0.5"
                />
                <span className={styles.controlUnit}>mm</span>
              </div>
            </div>
          </>
        )

      default:
        return null
    }
  }

  const isCalculateDisabled = () => {
    if (isCalculating) return true
    if (!solderHeight || Number.parseFloat(solderHeight) <= 0) return true
    if (!volumePerMm || volumePerMm <= 0) return true
    
    switch (padShape) {
      case 'square':
        return !padDimensions.side || Number.parseFloat(padDimensions.side) <= 0
      case 'rectangle':
        return !padDimensions.length || !padDimensions.width || 
               Number.parseFloat(padDimensions.length) <= 0 || 
               Number.parseFloat(padDimensions.width) <= 0
      case 'circle':
        return !padDimensions.radius || Number.parseFloat(padDimensions.radius) <= 0
      case 'concentric':
        return !padDimensions.outerRadius || !padDimensions.innerRadius ||
               Number.parseFloat(padDimensions.outerRadius) <= 0 ||
               Number.parseFloat(padDimensions.innerRadius) <= 0 ||
               Number.parseFloat(padDimensions.outerRadius) <= Number.parseFloat(padDimensions.innerRadius)
      default:
        return true
    }
  }

  return (
    <article className={styles.controlCard} aria-label="Pad soldering metrics">
      <header className={styles.controlHeader}>
        <h2 className={styles.controlTitle}>Pad Soldering Metrics</h2>
        <span className={styles.controlSubtitle}>Calculate area, wire usage and movement steps</span>
      </header>

      <div className={styles.controlBody}>
        {/* Shape Selection */}
        <div className={styles.controlRow}>
          <label htmlFor="pad-shape" className={styles.controlLabel}>
            Pad Shape
          </label>
          <div className={styles.controlFieldGroup}>
            <select
              id="pad-shape"
              name="pad-shape"
              className={styles.controlSelect}
              value={padShape}
              onChange={(e) => onShapeChange(e.target.value)}
            >
              <option value="">Select Shape</option>
              <option value="square">Square</option>
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="concentric">Concentric Circle</option>
            </select>
          </div>
        </div>

        {/* Shape-specific Inputs */}
        {padShape && renderShapeInputs()}

        {/* Solder Height Input */}
        {padShape && (
          <div className={styles.controlRow}>
            <label htmlFor="solder-height" className={styles.controlLabel}>
              Solder Height
            </label>
            <div className={styles.controlFieldGroup}>
              <input
                id="solder-height"
                name="solder-height"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className={styles.controlInput}
                value={solderHeight || ''}
                onChange={(e) => onSolderHeightChange(e.target.value)}
                placeholder="e.g. 0.1"
              />
              <span className={styles.controlUnit}>mm</span>
            </div>
          </div>
        )}

        {/* Volume per 1mm Display (if available) */}
        {volumePerMm !== null && volumePerMm > 0 && (
          <div className={styles.volumeInfo}>
            <span className={styles.volumeInfoLabel}>Wire Volume per 1mm:</span>
            <span className={styles.volumeInfoValue}>
              {volumePerMm.toFixed(4)} mm³
            </span>
          </div>
        )}

        {/* Calculate Button */}
        <div className={styles.controlRow}>
          <button
            type="button"
            className={styles.calculateButton}
            onClick={onCalculate}
            disabled={isCalculateDisabled()}
          >
            {isCalculating ? 'Calculating...' : 'Calculate Metrics'}
          </button>
        </div>

        {/* Results Display */}
        {(padArea !== null || padVolume !== null || wireUsed !== null || stepsMoved !== null) && (
          <div className={styles.resultsContainer}>
            {padArea !== null && padArea > 0 && (
              <div className={styles.resultItem}>
                <span className={styles.resultLabel}>Pad Area:</span>
                <span className={styles.resultValue}>
                  {padArea.toFixed(4)} mm²
                </span>
              </div>
            )}
            {padVolume !== null && padVolume > 0 && (
              <div className={styles.resultItem}>
                <span className={styles.resultLabel}>Pad Volume:</span>
                <span className={styles.resultValue}>
                  {padVolume.toFixed(4)} mm³
                </span>
              </div>
            )}
            {wireUsed !== null && (
              <div className={styles.resultItem}>
                <span className={styles.resultLabel}>Wire Length:</span>
                <span className={styles.resultValue}>
                  {wireUsed.toFixed(2)} mm
                </span>
              </div>
            )}
            {stepsMoved !== null && (
              <div className={styles.resultItem}>
                <span className={styles.resultLabel}>Steps Moved:</span>
                <span className={styles.resultValue}>
                  {stepsMoved.toFixed(0)} steps
                </span>
              </div>
            )}
          </div>
        )}

        {/* Info Text */}
        <p className={styles.infoText}>
          Select pad shape, enter dimensions and solder height. Wire length is calculated using volume: (Pad Area × Solder Height) ÷ Wire Volume per 1mm. Ensure wire diameter is set in Wire Feed Control.
        </p>
      </div>
    </article>
  )
}

