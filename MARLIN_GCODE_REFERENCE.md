# Marlin G-code Command Reference

This document lists all G-code commands used in the single-axis soldering machine, following **Marlin firmware** syntax.

## Movement Commands

### Absolute Movement
```gcode
G0 X120.000 Y45.000 Z5.000    # Rapid move to absolute position
G1 X120.000 Y45.000 Z5.000 F300    # Linear move with feedrate (mm/min)
```

### Relative Movement (Jog)
```gcode
G91          # Set relative positioning
G0 X1.000    # Move +1mm on X axis
G90          # Reset to absolute positioning
```

### Home
```gcode
G28          # Home all axes
G28 X        # Home X axis only
G28 Y        # Home Y axis only
G28 Z        # Home Z axis only
```

## Coordinate System

### Set Positioning Mode
```gcode
G90          # Absolute positioning (default)
G91          # Relative positioning
```

### Set Units
```gcode
G21          # Millimeters (default)
G20          # Inches
```

### Set Current Position (without moving)
```gcode
G92 X0 Y0 Z0    # Set current position to (0,0,0)
G92 X120.000    # Set X position to 120mm
```

## Temperature Control

### Set Temperature
```gcode
M104 S345       # Set hotend temperature to 345°C (continues immediately)
M109 S345       # Set temperature and wait until reached
M104 S0         # Disable heater (set to 0)
```

### Get Temperature
```gcode
M105            # Returns: "ok T:345.0 /345.0 B:0.0 /0.0"
                # Format: T:<current> /<target> B:<bed_current> /<bed_target>
```

## Fan Control

### Set Fan Speed
```gcode
M106 P0 S255    # Set fan 0 to speed 255 (0-255)
M106 P1 S128    # Set fan 1 to speed 128
M107            # Turn off all fans
```

## Stepper Control

### Enable/Disable Steppers
```gcode
M17             # Enable all steppers
M18             # Disable all steppers
M18 X           # Disable X stepper only
M18 Y Z         # Disable Y and Z steppers
```

## Status and Information

### Get Position
```gcode
M114            # Returns: "X:120.00 Y:45.30 Z:3.20 E:0.00"
```

### Get Firmware Info
```gcode
M115            # Returns firmware name, version, and capabilities
```

## Safety Commands

### Emergency Stop
```gcode
M112            # Immediately stops all motion and disables heaters
```

### Reset After Emergency Stop
```gcode
M999            # Reset and continue (clears error state)
M108            # Break out of waiting for heaters (if stuck)
```

## Custom Commands (Soldering-Specific)

### Wire Feed
```gcode
M700 L5.2 R8.0  # Feed 5.2mm wire at 8.0mm/s rate
                # (Custom command - implement in your firmware)
```

## Response Format

### Standard Response
```
ok              # Command executed successfully
```

### Error Response
```
error:1         # Error code 1
Error:Invalid command
```

### Position Response (M114)
```
X:120.00 Y:45.30 Z:3.20 E:0.00 Count X: 24000 Y:9060 Z:640
```

### Temperature Response (M105)
```
ok T:345.0 /345.0 B:0.0 /0.0 @:127 @0:0
```

## Command Execution Flow

1. **Send Command**: `G0 X120.000 Y45.000`
2. **Wait for Response**: `ok`
3. **Update Position**: Poll with `M114` to get actual position
4. **Update Temperature**: Poll with `M105` to get temperature

## Notes

- Marlin responds with `ok` after each command
- Commands are case-insensitive (G0 = g0)
- Multiple commands can be on one line separated by spaces
- Comments can be added with `;` or `()`: `G0 X10 ; Move to X=10`
- Feedrate (F) is in mm/min, not mm/s
- Position polling is required (Marlin doesn't send automatic status reports like GRBL)

