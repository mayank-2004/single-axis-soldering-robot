# Steps Per Millimeter Calculation - Implementation Guide

## Overview

This document explains how `zStepsPerMm` is automatically calculated based on your hardware configuration: lead screw pitch and DM542 microstepping settings.

---

## Mathematical Formula

### **Basic Formula:**
```
Steps per mm = (Motor steps per revolution × Microstepping) / Lead screw pitch (mm)
```

### **Your Configuration:**
- **Lead Screw Pitch:** 2.0 mm per revolution (measured)
- **Motor Steps per Revolution:** 200 steps (standard 1.8° stepper motor)
- **Microstepping:** Configurable via DM542 DIP switches (default: 16)

### **Calculation Example:**
```
Steps per mm = (200 × 16) / 2.0
             = 3200 / 2.0
             = 1600 steps/mm
```

---

## DM542 Microstepping Settings

The DM542 driver uses DIP switches (SW5-SW8) to configure microstepping. Common settings:

| Microstepping | Steps/Revolution | DIP Switch (SW5-SW8) | Steps/mm (2mm pitch) |
|---------------|------------------|----------------------|----------------------|
| 1 (Full step) | 200 | ON, ON, ON, ON | 100 |
| 2 | 400 | OFF, ON, ON, ON | 200 |
| 4 | 800 | ON, OFF, ON, ON | 400 |
| 8 | 1600 | OFF, OFF, ON, ON | 800 |
| **16** | **3200** | **ON, ON, OFF, ON** | **1600** |
| 32 | 6400 | OFF, ON, OFF, ON | 3200 |
| 64 | 12800 | ON, OFF, OFF, ON | 6400 |
| 128 | 25600 | OFF, OFF, OFF, ON | 12800 |

**Note:** Check your DM542 DIP switch configuration and update `MICROSTEPPING` constant in the code accordingly.

---

## Implementation in Arduino Code

### **Configuration Constants:**

```cpp
// Lead screw configuration (measured)
const float LEAD_SCREW_PITCH_MM = 2.0f;  // 2mm per revolution

// Stepper motor configuration (DM542 driver)
const int MOTOR_STEPS_PER_REVOLUTION = 200;  // Standard 1.8° stepper

// DM542 Microstepping (match your DIP switch settings)
const int MICROSTEPPING = 16;  // Change this to match your DM542 DIP switches

// Automatic calculation
float zStepsPerMm = (200.0f × 16.0f) / 2.0f;  // = 1600 steps/mm
```

### **On Startup:**

The Arduino prints the configuration:
```
[SETUP] Z-Axis Configuration:
[SETUP]   Lead screw pitch: 2.0 mm
[SETUP]   Motor steps per revolution: 200
[SETUP]   Microstepping: 16
[SETUP]   Calculated steps per mm: 1600.000 (Formula: (200 × 16) / 2.0)
```

---

## How to Configure

### **Step 1: Check DM542 DIP Switches**

1. Locate your DM542 driver board
2. Check DIP switches SW5, SW6, SW7, SW8
3. Refer to DM542 manual or the table above to determine microstepping value

### **Step 2: Update Arduino Code**

**Location:** `ARDUINO_SKETCH_EXAMPLE.ino` → Line ~77

```cpp
// Change this value to match your DIP switch setting
const int MICROSTEPPING = 16;  // ← Update this value
```

**Common Values:**
- `1` = Full step (200 steps/rev)
- `2` = Half step (400 steps/rev)
- `4` = Quarter step (800 steps/rev)
- `8` = Eighth step (1600 steps/rev)
- `16` = Sixteenth step (3200 steps/rev) ← **Default**
- `32` = Thirty-second step (6400 steps/rev)
- `64` = Sixty-fourth step (12800 steps/rev)
- `128` = One-hundred-twenty-eighth step (25600 steps/rev)

### **Step 3: Verify Lead Screw Pitch**

The code uses:
```cpp
const float LEAD_SCREW_PITCH_MM = 2.0f;  // ← You measured this as 2mm
```

If your pitch is different, update this value.

### **Step 4: Upload and Test**

1. Upload the updated code to Arduino
2. Check Serial Monitor for configuration output
3. Test movement accuracy:
   - Command 10mm movement
   - Measure actual movement
   - Should match exactly (or very close)

---

## Calibration Commands

### **Command 1: Recalculate from Microstepping**

If you change microstepping setting:
```json
{"command":"calibrate","microstepping":32}
```

**Result:**
- Recalculates: `(200 × 32) / 2.0 = 3200 steps/mm`
- Updates `zStepsPerMm` automatically

### **Command 2: Recalculate from Both Parameters**

If you want to change both:
```json
{"command":"calibrate","leadScrewPitch":2.0,"microstepping":16}
```

### **Command 3: Direct Value (Manual Override)**

If calculated value needs fine-tuning:
```json
{"command":"calibrate","stepsPerMm":1600.5}
```

### **Command 4: Auto-Calibration (Measured)**

If movement is slightly off, measure and correct:
```json
{"command":"calibrate","commanded":10.0,"actual":9.95}
```

**Result:**
- Calculates correction factor: `10.0 / 9.95 = 1.005`
- Updates: `1600 × 1.005 = 1608 steps/mm`

---

## Verification

### **Test Movement Accuracy:**

1. **Home the machine** (position = 0.00mm)
2. **Jog down 10mm** (command: `{"command":"jog","axis":"z","distance":-10}`)
3. **Measure actual movement** with caliper
4. **Compare:**
   - If actual = 10.0mm → Perfect! ✅
   - If actual ≠ 10.0mm → Use auto-calibration command

### **Example:**

**Commanded:** 10.0mm  
**Actual:** 9.8mm  
**Correction:**
```json
{"command":"calibrate","commanded":10.0,"actual":9.8}
```

**Result:**
- Correction factor: `10.0 / 9.8 = 1.0204`
- New steps/mm: `1600 × 1.0204 = 1632.6`

---

## Configuration Examples

### **Example 1: Standard Setup (Default)**
```cpp
LEAD_SCREW_PITCH_MM = 2.0f
MOTOR_STEPS_PER_REVOLUTION = 200
MICROSTEPPING = 16
zStepsPerMm = (200 × 16) / 2.0 = 1600 steps/mm
```

### **Example 2: Higher Resolution**
```cpp
LEAD_SCREW_PITCH_MM = 2.0f
MOTOR_STEPS_PER_REVOLUTION = 200
MICROSTEPPING = 32  // Higher microstepping for smoother movement
zStepsPerMm = (200 × 32) / 2.0 = 3200 steps/mm
```

### **Example 3: Different Lead Screw**
```cpp
LEAD_SCREW_PITCH_MM = 4.0f  // 4mm pitch lead screw
MOTOR_STEPS_PER_REVOLUTION = 200
MICROSTEPPING = 16
zStepsPerMm = (200 × 16) / 4.0 = 800 steps/mm
```

---

## JSON Response

The Arduino now includes configuration in status updates:

```json
{
  "pos": {"z": 0.0, "moving": false},
  "config": {
    "leadScrewPitch": 2.0,
    "motorStepsPerRev": 200,
    "microstepping": 16,
    "stepsPerMm": 1600.0
  },
  "temp": {...},
  "wire": {...}
}
```

This allows the app to:
- Display current configuration
- Verify settings match hardware
- Show calculated steps/mm value

---

## Troubleshooting

### **Issue: Movement is too short**

**Symptom:** Command 10mm, but only moves 9.5mm

**Solution:**
```json
{"command":"calibrate","commanded":10.0,"actual":9.5}
```

This increases steps/mm to compensate.

### **Issue: Movement is too long**

**Symptom:** Command 10mm, but moves 10.5mm

**Solution:**
```json
{"command":"calibrate","commanded":10.0,"actual":10.5}
```

This decreases steps/mm to compensate.

### **Issue: Wrong microstepping value**

**Symptom:** Movement is way off (e.g., 5mm instead of 10mm)

**Solution:**
1. Check DM542 DIP switches
2. Update `MICROSTEPPING` constant in code
3. Re-upload Arduino sketch
4. Or use command: `{"command":"calibrate","microstepping":32}`

---

## Summary

### **Automatic Calculation:**
- ✅ Calculated from lead screw pitch (2mm) and microstepping (16)
- ✅ Formula: `(200 × 16) / 2.0 = 1600 steps/mm`
- ✅ No manual calculation needed

### **Configuration:**
- Update `MICROSTEPPING` constant to match DM542 DIP switches
- Update `LEAD_SCREW_PITCH_MM` if different from 2mm

### **Calibration:**
- Use auto-calibration if movement is slightly off
- Recalculate if microstepping changes
- Direct override if needed

### **Verification:**
- Test with known distances (e.g., 10mm)
- Measure actual movement
- Fine-tune with calibration commands

---

## Quick Reference

**Formula:**
```
zStepsPerMm = (MOTOR_STEPS_PER_REVOLUTION × MICROSTEPPING) / LEAD_SCREW_PITCH_MM
```

**Your Setup:**
```
zStepsPerMm = (200 × 16) / 2.0 = 1600 steps/mm
```

**To Change:**
1. Update `MICROSTEPPING` constant (line ~80)
2. Re-upload Arduino sketch
3. Or use calibration command

**To Fine-Tune:**
```json
{"command":"calibrate","commanded":10.0,"actual":9.95}
```

