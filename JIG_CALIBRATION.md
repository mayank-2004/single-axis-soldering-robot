# Jig Calibration Feature Documentation

## Overview

The Jig Calibration feature allows users to set a reference height for their PCB jig, ensuring safe and consistent positioning during soldering sequences. This feature is essential for preventing head crashes and maintaining repeatable operations.

## Purpose

In a single-axis soldering machine:
- **Z-axis** is automated (controlled by the machine)
- **X/Y axes** are manual (operator moves PCB on jig)
- **Jig height** is the distance from home position (0.00mm) to the jig surface

Setting jig height ensures:
1. **Safety**: Prevents the soldering head from crashing into the jig or PCB
2. **Repeatability**: Consistent reference point for all operations
3. **Accuracy**: Proper safe height calculations during sequences

## How It Works

### Safe Height Calculation

The safe retraction height is calculated as:
```
Safe Height = Jig Height + Component Height + 2mm Clearance
```

**Example:**
- Jig Height: 10.0 mm
- Component Height: 4.75 mm
- Safe Height: 10.0 + 4.75 + 2.0 = **16.75 mm**

### Fallback Behavior

If jig height is not set:
- Falls back to: `Component Height + 2mm`
- If component height is also not set: Defaults to **5mm**

## User Interface

### Location
The Jig Calibration component is accessible via the navigation menu: **"Jig Calibration"**

### Features

#### 1. Current Jig Height Display
- Shows the currently set jig height
- Displays "--" if not calibrated

#### 2. Manual Height Entry
- Input field for entering jig height manually
- Accepts decimal values (e.g., 10.5)
- Unit: millimeters (mm)
- "Set Height" button to save

#### 3. Auto-Calibration
- Uses current Z position as jig height reference
- **Procedure:**
  1. Position the head at the jig surface using manual movement controls
  2. Click "Calibrate from Current Position"
  3. The current Z position (absolute value) becomes the jig height

#### 4. Status Messages
- Shows success/error messages
- Auto-clears after 3 seconds

#### 5. Safety Warning
- Displays safety information about safe height calculation
- Reminds users about clearance requirements

## Implementation Details

### Backend (SolderingHardware.js)

#### State Management
```javascript
this.state = {
  jigHeightMm: null, // Jig reference height in mm
  // ... other state
}
```

#### Methods

**`setJigHeight(height, unit = 'mm')`**
- Sets jig height manually
- Validates input (must be positive number)
- Returns success/error result

**`calibrateJigFromPosition()`**
- Auto-calibrates from current Z position
- Uses absolute value of current Z
- Returns calibration result with current position

**`getJigHeight()`**
- Returns current jig height or null

#### Safe Height Calculation
Updated in `_executeStageAction()`:
```javascript
let safeZ = 5 // Default
if (this.state.jigHeightMm !== null) {
  const componentHeight = this.state.componentHeightMm || 0
  safeZ = this.state.jigHeightMm + componentHeight + 2
} else if (this.state.componentHeightMm !== null) {
  safeZ = this.state.componentHeightMm + 2 // Legacy fallback
}
```

### IPC Communication

#### Channels

**`jig:height:set`** - Set jig height manually
```javascript
window.ipc.send('jig:height:set', {
  height: 10.5,
  unit: 'mm',
  timestamp: Date.now()
})
```

**`jig:calibrate`** - Auto-calibrate from position
```javascript
window.ipc.send('jig:calibrate', {
  timestamp: Date.now()
})
```

**`jig:height:request`** - Request current jig height
```javascript
window.ipc.send('jig:height:request')
```

**Response Channels:**
- `jig:height:ack` - Acknowledgment for manual set
- `jig:calibrate:ack` - Acknowledgment for auto-calibration
- `jig:height:status` - Current jig height status

### Frontend (home.jsx)

#### State
```javascript
const [jigHeight, setJigHeight] = useState(null)
const [jigCalibrationStatus, setJigCalibrationStatus] = useState('')
```

#### Handlers
- `handleJigHeightChange(height)` - Updates local state
- `handleJigCalibrate(method)` - Handles both manual and auto calibration

#### Event Listeners
- Listens for `jig:height:ack` - Manual set response
- Listens for `jig:calibrate:ack` - Auto-calibration response
- Listens for `jig:height:status` - Status updates

### Component (JigCalibration.jsx)

#### Props
- `jigHeight` - Current jig height value
- `onJigHeightChange` - Callback for height input changes
- `onCalibrate` - Callback for calibration actions ('manual' or 'auto')
- `statusMessage` - Status/error message to display
- `isCalibrating` - Loading state (optional)
- `currentZPosition` - Current Z position for auto-calibration

## Usage Workflow

### Initial Setup (First Time)

1. **Home the machine** - Ensure head is at home position (0.00mm)
2. **Position head at jig surface** - Use manual movement controls to lower head until it touches jig surface
3. **Auto-calibrate** - Click "Calibrate from Current Position"
4. **Verify** - Check that jig height is displayed correctly

### Manual Entry Method

1. **Measure jig height** - Measure distance from home position to jig surface
2. **Enter value** - Type the measured height in the input field
3. **Set height** - Click "Set Height" button
4. **Verify** - Check status message for confirmation

### During Operation

- Jig height is used automatically in all sequences
- Safe retraction height is calculated using: Jig Height + Component Height + 2mm
- No manual intervention needed after initial calibration

## Integration with Sequences

When a soldering sequence runs:

1. **Lower Z** - Moves to pad position (Z coordinate)
2. **Dispense** - Feeds solder wire
3. **Clean Tip** - Activates air jet
4. **Retract** - Moves to safe height using jig calibration

**Safe Height Calculation:**
```javascript
safeZ = jigHeightMm + componentHeightMm + 2mm
```

## Benefits

1. **Safety**: Prevents crashes by ensuring proper clearance
2. **Consistency**: Same reference point for all operations
3. **Efficiency**: One-time calibration per jig setup
4. **Accuracy**: Precise safe height calculations
5. **User-Friendly**: Simple UI with two calibration methods

## Technical Notes

### Coordinate System
- **Home Position**: 0.00mm (upper limit switch)
- **Positive Z**: Above home (not used in normal operation)
- **Negative Z**: Below home (towards jig/PCB)
- **Jig Height**: Always positive (distance from home to jig)

### Storage
- Jig height is stored in `SolderingHardware` state
- Persists during app session
- Not persisted to disk (resets on app restart)
- Can be extended to save to local storage if needed

### Validation
- Jig height must be a positive number
- Auto-calibration requires valid Z position
- Error messages guide user if validation fails

## Future Enhancements

Potential improvements:
1. **Persistent Storage**: Save jig height to local storage
2. **Multiple Jig Profiles**: Save different jig heights for different setups
3. **Visual Indicator**: Show jig height in position display
4. **Arduino Integration**: Send jig height to Arduino for hardware-level safety
5. **Calibration Wizard**: Step-by-step guided calibration process

## Troubleshooting

### Issue: Jig height not saving
- **Check**: IPC communication working
- **Check**: No errors in console
- **Solution**: Verify serial connection is active

### Issue: Auto-calibration not working
- **Check**: Current Z position is available
- **Check**: Machine is homed and connected
- **Solution**: Home machine first, then position at jig surface

### Issue: Safe height seems incorrect
- **Check**: Both jig height and component height are set
- **Check**: Values are correct (positive numbers)
- **Solution**: Re-calibrate jig height and verify component height

## Related Features

- **Component Height**: Maximum component height on PCB
- **Manual Movement**: Used to position head for auto-calibration
- **Sequence Monitor**: Uses jig height for safe retraction
- **Limit Switches**: Home position reference (0.00mm)

## Code Files

- **Component**: `renderer/components/JigCalibration.jsx`
- **Styles**: `renderer/components/JigCalibration.module.css`
- **Backend Logic**: `main/hardware/SolderingHardware.js`
- **IPC Handlers**: `main/robotController.js`
- **Frontend Integration**: `renderer/pages/home.jsx`

## Summary

The Jig Calibration feature is a critical safety and accuracy feature for single-axis soldering machines. It provides:
- ✅ Safe height calculations
- ✅ Consistent reference point
- ✅ Easy calibration methods
- ✅ Integration with sequences
- ✅ User-friendly interface

By implementing jig calibration, users can ensure safe and repeatable soldering operations with proper clearance above the jig and PCB components.
