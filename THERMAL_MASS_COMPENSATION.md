# Thermal Mass Compensation in Single-Axis Soldering Machine

## What is Thermal Mass Compensation?

**Thermal mass compensation** is a technique that automatically adjusts the soldering tip temperature based on the thermal mass (heat capacity) of the pad or component being soldered. Larger pads/components require more heat energy to reach soldering temperature, while smaller ones need less.

## Why It's Important

### The Problem Without Compensation:

1. **Small Pads (Low Thermal Mass):**
   - Heat up quickly
   - Risk of overheating
   - Can damage components or lift pads
   - Solder may become too fluid

2. **Large Pads (High Thermal Mass):**
   - Heat up slowly
   - Risk of insufficient heat
   - Solder may not flow properly
   - Cold solder joints (weak connections)

3. **Fixed Temperature Issues:**
   - Using the same temperature (e.g., 345°C) for all pads
   - Small pads: Too hot → damage
   - Large pads: Too cold → poor joints

### The Solution - Thermal Mass Compensation:

Automatically adjust temperature based on pad size/thermal mass:
- **Small pads** → Lower temperature (e.g., 320°C)
- **Medium pads** → Standard temperature (e.g., 345°C)
- **Large pads** → Higher temperature (e.g., 370°C)

---

## How It Works in Your Single-Axis Machine

### 1. Pad Size Detection

Your machine already calculates pad area in `PadSolderingMetrics`:
- **Square:** Area = side²
- **Rectangle:** Area = length × width
- **Circle:** Area = π × radius²
- **Concentric:** Area = π × (outerRadius² - innerRadius²)

### 2. Thermal Mass Calculation

**Thermal Mass** is proportional to pad area:
```
Thermal Mass ∝ Pad Area
```

Larger pad area = Higher thermal mass = More heat needed

### 3. Temperature Adjustment Formula

**Basic Compensation Formula:**
```
Compensated Temperature = Base Temperature + (Pad Area × Compensation Factor)
```

**Example Calculation:**
- Base temperature: 345°C
- Compensation factor: 2°C per mm² (adjustable)
- Small pad (2mm²): 345 + (2 × 2) = 349°C
- Large pad (20mm²): 345 + (2 × 20) = 385°C

**Better Formula (Non-linear):**
```
Compensated Temperature = Base Temperature + (√Pad Area × Compensation Factor)
```

This prevents excessive temperature for very large pads.

---

## Implementation in Your Machine

### Current State:
- ✅ Pad area is calculated in `PadSolderingMetrics`
- ✅ Temperature can be set via `setTipTarget()`
- ❌ No automatic temperature adjustment based on pad size

### How to Implement:

1. **Calculate Thermal Mass from Pad Area:**
   ```javascript
   const calculateThermalMass = (padArea) => {
     // Thermal mass is proportional to pad area
     // Can also consider pad thickness, copper weight, etc.
     return padArea * 1.0 // Base factor (adjust based on testing)
   }
   ```

2. **Calculate Compensated Temperature:**
   ```javascript
   const calculateCompensatedTemperature = (baseTemp, padArea) => {
     // Base temperature (e.g., 345°C)
     const base = baseTemp || 345
     
     // Compensation factor (adjustable - typically 1-5°C per mm²)
     const factor = 2.0 // °C per mm²
     
     // Calculate compensation (use square root for non-linear scaling)
     const compensation = Math.sqrt(padArea) * factor
     
     // Clamp to safe range (e.g., 280°C - 400°C)
     const compensated = base + compensation
     return Math.max(280, Math.min(400, compensated))
   }
   ```

3. **Apply When Soldering:**
   - When user calculates pad metrics, automatically calculate compensated temperature
   - Display suggested temperature
   - Optionally auto-apply when starting soldering sequence

---

## Benefits for Single-Axis Machine

### 1. **Consistent Solder Quality**
- Small pads: Lower temp prevents damage
- Large pads: Higher temp ensures proper flow
- Reduces cold joints and lifted pads

### 2. **Automated Optimization**
- No manual temperature adjustment needed
- Machine automatically adapts to each pad
- Faster workflow

### 3. **Better Joint Reliability**
- Proper temperature = better wetting
- Stronger mechanical bonds
- Reduced rework

### 4. **Component Protection**
- Prevents overheating small components
- Reduces thermal stress
- Extends component lifespan

---

## Example Scenarios

### Scenario 1: Small Pad (2mm × 2mm = 4mm²)
- **Without Compensation:** 345°C (too hot)
- **With Compensation:** ~330°C
- **Result:** Proper heating without damage

### Scenario 2: Medium Pad (5mm × 5mm = 25mm²)
- **Without Compensation:** 345°C (adequate)
- **With Compensation:** ~355°C
- **Result:** Slightly faster heating, better flow

### Scenario 3: Large Pad (10mm × 10mm = 100mm²)
- **Without Compensation:** 345°C (too cold)
- **With Compensation:** ~375°C
- **Result:** Proper heating, good solder flow

---

## Additional Factors to Consider

### 1. **Pad Thickness**
- Thicker copper = higher thermal mass
- May need additional compensation

### 2. **Component Size**
- Large components (capacitors, connectors) add thermal mass
- May need higher temperature even for small pads

### 3. **PCB Material**
- FR4 standard PCB
- Different materials have different thermal properties

### 4. **Ambient Temperature**
- Cold environment may need higher compensation
- Hot environment may need less

### 5. **Dwell Time**
- Larger pads may need longer contact time
- Temperature + time = total heat energy

---

## Implementation Recommendation

### Option 1: Automatic (Recommended)
- Calculate compensated temperature when pad metrics are calculated
- Display suggested temperature in UI
- Auto-apply when starting soldering sequence

### Option 2: Manual
- Show suggested temperature
- User can accept or adjust
- More control but slower workflow

### Option 3: Hybrid
- Auto-apply for small/medium pads
- Show warning for large pads requiring approval
- Best of both worlds

---

## Formula Examples

### Linear Compensation:
```
T_compensated = T_base + (Area × Factor)
```

### Square Root Compensation (Recommended):
```
T_compensated = T_base + (√Area × Factor)
```

### Logarithmic Compensation (For very large pads):
```
T_compensated = T_base + (log(Area + 1) × Factor)
```

### Example Values:
- **Base Temperature:** 345°C
- **Compensation Factor:** 2.0°C per √mm²
- **Min Temperature:** 280°C
- **Max Temperature:** 400°C

### Calculation Examples:

| Pad Area (mm²) | √Area | Compensation | Final Temp |
|----------------|-------|--------------|------------|
| 1              | 1.0   | +2°C         | 347°C      |
| 4              | 2.0   | +4°C         | 349°C      |
| 9              | 3.0   | +6°C         | 351°C      |
| 16             | 4.0   | +8°C         | 353°C      |
| 25             | 5.0   | +10°C        | 355°C      |
| 50             | 7.1   | +14°C        | 359°C      |
| 100            | 10.0  | +20°C        | 365°C      |

---

## Summary

**Thermal mass compensation** is essential for:
1. ✅ **Quality:** Consistent solder joints across all pad sizes
2. ✅ **Safety:** Prevents component damage from overheating
3. ✅ **Efficiency:** Optimizes temperature automatically
4. ✅ **Reliability:** Reduces cold joints and rework

**For your single-axis machine:**
- You already calculate pad area
- You can calculate thermal mass from area
- You can adjust temperature automatically
- This will significantly improve soldering quality

The feature would automatically adjust the tip temperature based on the pad size calculated in your `PadSolderingMetrics` component, ensuring optimal soldering conditions for each pad.

