# Arduino Uno Compatibility Analysis

## ❌ **NO - The sketch will NOT work on Arduino Uno without modifications**

## Pin Compatibility Issues

### Pins Used in Mega 2560 Sketch:
```
STEPPER_Z_STEP_PIN = 48      ❌ Uno doesn't have pin 48
STEPPER_Z_DIR_PIN = 46       ❌ Uno doesn't have pin 46
BUTTON_UP_PIN = 39           ❌ Uno doesn't have pin 39
BUTTON_DOWN_PIN = 37         ❌ Uno doesn't have pin 37
BUTTON_SAVE_PIN = 35         ❌ Uno doesn't have pin 35
PADDLE_PIN = 34              ❌ Uno doesn't have pin 34
LIMIT_SWITCH_Z_MIN_PIN = 2   ✅ Uno has pin 2
LIMIT_SWITCH_Z_MAX_PIN = 3   ✅ Uno has pin 3
WIRE_FEED_STEP_PIN = 9       ✅ Uno has pin 9
WIRE_FEED_DIR_PIN = 8        ✅ Uno has pin 8
```

### Arduino Uno Pin Availability:
- **Digital Pins:** 0-13 (14 pins total)
- **Analog Pins:** A0-A5 (can be used as digital pins 14-19)
- **Total usable pins:** 20 pins (0-13 + A0-A5)

### Arduino Mega 2560 Pin Availability:
- **Digital Pins:** 0-53 (54 pins total)
- **Analog Pins:** A0-A15 (can be used as digital pins 54-69)
- **Total usable pins:** 70 pins

## Memory Comparison

| Feature | Arduino Uno | Arduino Mega 2560 | Status |
|---------|-------------|-------------------|--------|
| Flash Memory | 32 KB | 256 KB | ⚠️ May be tight |
| SRAM | 2 KB | 8 KB | ⚠️ **CRITICAL** - String usage |
| EEPROM | 1 KB | 4 KB | ✅ OK |

### Memory Concerns:
- **String objects** (used extensively) consume SRAM
- **ArduinoJson** library needs RAM for parsing
- **Serial buffer** uses RAM
- Uno has only **2 KB RAM** - very limited!

## What Needs to Change for Uno

### 1. Pin Remapping Required:
```cpp
// Arduino Uno Pin Mapping (example)
const int STEPPER_Z_STEP_PIN = 4;        // Changed from 48
const int STEPPER_Z_DIR_PIN = 5;         // Changed from 46
const int BUTTON_UP_PIN = 10;            // Changed from 39
const int BUTTON_DOWN_PIN = 11;          // Changed from 37
const int BUTTON_SAVE_PIN = 12;          // Changed from 35
const int PADDLE_PIN = 13;               // Changed from 34
// Keep these the same:
const int LIMIT_SWITCH_Z_MIN_PIN = 2;    // OK
const int LIMIT_SWITCH_Z_MAX_PIN = 3;     // OK
const int WIRE_FEED_STEP_PIN = 9;        // OK
const int WIRE_FEED_DIR_PIN = 8;         // OK
```

### 2. Memory Optimization Required:
- Replace `String` objects with `char[]` arrays (saves RAM)
- Reduce JSON document size
- Minimize Serial buffer usage
- Use `PROGMEM` for constant strings

### 3. Code Size:
- Current sketch: ~23 KB (9% of Mega)
- Uno has 32 KB flash - should fit, but tight

## Recommendation

### ✅ **Use Arduino Mega 2560** (Recommended)
- More pins available
- More RAM (8 KB vs 2 KB)
- More flash memory
- Better suited for this application

### ⚠️ **If you MUST use Uno:**
1. **Remap all pins** to Uno-compatible pins (0-13, A0-A5)
2. **Optimize memory usage** (replace String with char arrays)
3. **Reduce JSON document size**
4. **Test thoroughly** - may run out of RAM

## Pin Mapping Suggestions for Uno

If you want to use Uno, here's a suggested pin layout:

```
Function              | Suggested Pin | Notes
---------------------|---------------|------------------
Z-Axis Stepper Step  | 4             | PWM capable
Z-Axis Stepper Dir   | 5             | PWM capable
Wire Feed Step       | 9             | PWM capable (keep)
Wire Feed Dir        | 8             | Keep
Limit Switch Z-Min   | 2             | Interrupt capable (keep)
Limit Switch Z-Max   | 3             | Interrupt capable (keep)
Button Up            | 10            | 
Button Down          | 11            |
Button Save          | 12            |
Paddle               | 13            | Built-in LED (can use for feedback)
```

**Available pins for future expansion:** 0, 1 (Serial), 6, 7, A0-A5

## Conclusion

**The sketch will NOT compile/work on Uno without:**
1. ✅ Changing all pin numbers
2. ✅ Memory optimization (critical!)
3. ✅ Testing and debugging

**Better option:** Stick with Arduino Mega 2560 for this project.

