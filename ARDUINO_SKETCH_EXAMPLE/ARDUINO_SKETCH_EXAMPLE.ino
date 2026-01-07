#include <ArduinoJson.h>
#include <math.h>

// Serial communication settings
const unsigned long BAUD_RATE = 115200;
const unsigned long UPDATE_INTERVAL = 500; // Send data every 100ms

// Mock sensor values (replace with actual sensor readings)
float zPosition = 0.0;  // Z-axis position in mm - starts at home
bool isMoving = false;

float targetTemperature = 290.0;
float currentTemperature = 25.0;  // Default value for simulation
bool heaterEnabled = false;

String wireFeedStatus = "idle";
float wireFeedRate = 8.0;
bool wireBreakDetected = false;  // Default value for simulation

float spoolWeight = 500.0;  // Default value for simulation
float wireLength = 10000.0;  // Default value for simulation
float wireDiameter = 0.5;
float remainingPercentage = 100.0;  // Default value for simulation
bool isWireFeeding = false;

float fluxPercentage = 82.0;
float fluxMl = 68.0;



bool fumeExtractorEnabled = false;
float fumeExtractorSpeed = 80.0;

bool fluxMistEnabled = false;
bool fluxMistDispensing = false;
float fluxMistFlowRate = 50.0;

bool airBreezeEnabled = false;
bool airBreezeActive = false;
float airBreezeIntensity = 60.0;

bool airJetEnabled = false;
bool airJetActive = false;
float airJetPressure = 80.0;

String sequenceStage = "idle";
bool sequenceActive = false;
int currentPad = 0;
int totalPads = 0;
float sequenceProgress = 0.0;
String sequenceError = "";  // Empty string means no error (will send null in JSON)

float componentHeight = 5;

// Z-Axis stepper configuration
const int STEPPER_Z_STEP_PIN = 48;
const int STEPPER_Z_DIR_PIN = 46;
// Enable pin is not used in this configuration

const int LIMIT_SWITCH_Z_MIN_PIN = 2;
const int LIMIT_SWITCH_Z_MAX_PIN = 3;

// --- HARDWARE PIN DEFINITIONS (PLEASE CONFIGURE THESE) ---
// Set these to the actual pin numbers connected to your MOSFETs/Relays
const int HEATER_PIN = -1;          // e.g., 5
const int TEMP_SENSOR_PIN = -1;     // e.g., A3 (Analog Pin)
const int FUME_EXTRACTOR_PIN = -1;  // e.g., 10
const int FLUX_MIST_PIN = -1;       // e.g., 11
const int AIR_BREEZE_PIN = -1;      // e.g., 12
const int AIR_JET_PIN = -1;         // e.g., 4
// ---------------------------------------------------------

// Position system: Home is at 0.00mm (Z_MAX limit switch at top)
const float Z_MAX_POSITION = 60.0f;  // mm - Maximum travel distance from home (downward) - NOT USED (limit switches control movement)
const float Z_HOME_POSITION = 0.0f;  // mm - Home position (at Z_MAX limit switch)

// Lead screw configuration (measured)
const float LEAD_SCREW_PITCH_MM = 1.0f;  // Lead screw pitch: 1mm per revolution (measured)

// Stepper motor configuration (DM542 driver)
const int MOTOR_STEPS_PER_REVOLUTION = 200;  // Standard 1.8° stepper motor = 200 steps/rev (360° / 1.8°)

// DM542 Microstepping configuration
const int MICROSTEPPING = 16;  // Change this to match your DM542 DIP switch setting

// Calculate steps per millimeter automatically
// Formula: Steps per mm = ((Motor steps per revolution × Microstepping) / Lead screw pitch) / Correction
// We divide by 16.0 because the driver is behaving as Full Step (1 microstep) despite the 1/16 DIP settings.
// This ensures 1mm command = 1mm physical movement.
float zStepsPerMm = ((static_cast<float>(MOTOR_STEPS_PER_REVOLUTION) * static_cast<float>(MICROSTEPPING)) / LEAD_SCREW_PITCH_MM) / 16.0f;
const unsigned int Z_STEP_DELAY_US = 100; // Default pulse width for stepper (microseconds)
const unsigned int Z_STEP_DELAY_MIN = 30;  // Minimum delay (fastest speed) - reduced to 30μs for ultra-fast movement
const unsigned int Z_STEP_DELAY_MAX = 800;  // Maximum delay (slowest speed) - reduced from 2000 for faster movement
const unsigned int Z_STEP_DELAY_TURBO_MIN = 20;  // Turbo mode minimum delay (ultra-fast) - use with caution

// Current movement speed (delay in microseconds)
// Lower value = faster movement, Higher value = slower movement
unsigned int currentZStepDelay = Z_STEP_DELAY_MIN; // Default speed set to fastest (30μs) for higher speed

// Standard stepper pulse configuration
const unsigned int PULSE_WIDTH_US = 5; // Minimum pulse width for DM542 driver

// Wire Feed stepper configuration
const int WIRE_FEED_STEP_PIN = 9;
const int WIRE_FEED_DIR_PIN = 8;

const int WIRE_FEED_STEPS_PER_MM = 200;      // Adjust to your wire feed mechanics
const unsigned int WIRE_FEED_STEP_DELAY_US = 500; // Pulse width for wire feed stepper (microseconds)

// Button and Paddle configuration
const int BUTTON_UP_PIN = 39;
const int BUTTON_DOWN_PIN = 37;
const int BUTTON_SAVE_PIN = 35;
const int PADDLE_PIN = 34;

// bool useRealSensors = true;  
bool useRealSensors = false;  // Always use simulation mode since sensors are disabled

// Button debouncing and continuous movement
const unsigned long BUTTON_DEBOUNCE_MS = 50;
const unsigned long BUTTON_REPEAT_DELAY_MS = 100; // Delay between movements when button held
unsigned long lastButtonUpPress = 0;
unsigned long lastButtonDownPress = 0;
unsigned long lastButtonSavePress = 0;
unsigned long lastPaddlePress = 0;
unsigned long lastButtonUpRepeat = 0;
unsigned long lastButtonDownRepeat = 0;
bool lastButtonUpState = HIGH;
bool lastButtonDownState = HIGH;
bool lastButtonSaveState = HIGH;
bool lastPaddleState = HIGH;

// Movement recording and playback
float savedMovementDistance = 0.0f;  // Saved movement distance from home position
bool hasSavedMovement = false;
float homePosition = 0.0f;  // Home position is 0.00mm (at Z_MAX limit switch)
bool isExecutingSavedMovement = false;

// Forward declarations for motion helpers
void moveZAxisByDistance(float distanceMm, unsigned int stepDelayUs = 0);
void moveZAxisTo(float targetMm, unsigned int stepDelayUs = 0);
void homeZAxis(unsigned int stepDelayUs = 0);
void feedWireByLength(float lengthMm);
void handleButtonControls();
void saveMovementSequence();
void executeSavedMovement();
void manageHeater();
float readThermistor(int pin);


void setup() {
  Serial.begin(BAUD_RATE);

  // Print configuration on startup
  Serial.println("[SETUP] Z-Axis Configuration:");
  Serial.print("[SETUP]   Lead screw pitch: ");
  Serial.print(LEAD_SCREW_PITCH_MM, 1);
  Serial.println(" mm");
  Serial.print("[SETUP]   Motor steps per revolution: ");
  Serial.println(MOTOR_STEPS_PER_REVOLUTION);
  Serial.print("[SETUP]   Microstepping: ");
  Serial.println(MICROSTEPPING);
  Serial.print("[SETUP]   Calculated steps per mm: ");
  Serial.print(zStepsPerMm, 3);
  Serial.print(" (Formula: (");
  Serial.print(MOTOR_STEPS_PER_REVOLUTION);
  Serial.print(" × ");
  Serial.print(MICROSTEPPING);
  Serial.print(") / ");
  Serial.print(LEAD_SCREW_PITCH_MM, 1);
  Serial.println(")");
  
  // Initialize Hardware Pins
  if (HEATER_PIN != -1) pinMode(HEATER_PIN, OUTPUT);
  if (TEMP_SENSOR_PIN != -1) pinMode(TEMP_SENSOR_PIN, INPUT);
  if (FUME_EXTRACTOR_PIN != -1) pinMode(FUME_EXTRACTOR_PIN, OUTPUT);
  if (FLUX_MIST_PIN != -1) pinMode(FLUX_MIST_PIN, OUTPUT);
  if (AIR_BREEZE_PIN != -1) pinMode(AIR_BREEZE_PIN, OUTPUT);
  if (AIR_JET_PIN != -1) pinMode(AIR_JET_PIN, OUTPUT);
  
  // Z-axis stepper motor pins
  pinMode(STEPPER_Z_STEP_PIN, OUTPUT);
  pinMode(STEPPER_Z_DIR_PIN, OUTPUT);
  pinMode(LIMIT_SWITCH_Z_MIN_PIN, INPUT_PULLUP);
  pinMode(LIMIT_SWITCH_Z_MAX_PIN, INPUT_PULLUP);

  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  digitalWrite(STEPPER_Z_DIR_PIN, LOW);

  // Wire feed stepper motor pins
  pinMode(WIRE_FEED_STEP_PIN, OUTPUT);
  pinMode(WIRE_FEED_DIR_PIN, OUTPUT);

  digitalWrite(WIRE_FEED_STEP_PIN, LOW);
  digitalWrite(WIRE_FEED_DIR_PIN, LOW);

  // Button and paddle pins (INPUT_PULLUP - buttons connect to ground when pressed)
  pinMode(BUTTON_UP_PIN, INPUT_PULLUP);
  pinMode(BUTTON_DOWN_PIN, INPUT_PULLUP);
  pinMode(BUTTON_SAVE_PIN, INPUT_PULLUP);
  pinMode(PADDLE_PIN, INPUT_PULLUP);

  // Initialize button states
  lastButtonUpState = digitalRead(BUTTON_UP_PIN);
  lastButtonDownState = digitalRead(BUTTON_DOWN_PIN);
  lastButtonSaveState = digitalRead(BUTTON_SAVE_PIN);
  lastPaddleState = digitalRead(PADDLE_PIN);
  
  delay(1000); // Give time for serial connection to stabilize
}

void loop() {
  // Handle button controls (up, down, save, paddle)
  handleButtonControls();

  // Manage heater temperature
  manageHeater();
  
  // Read sensors and update values
  readSensors();
  
  // Send JSON data to Electron app
  sendMachineState();
  
  // Process incoming commands from app
  processCommands();
  
  delay(UPDATE_INTERVAL);
}

void readSensors() {  
  // Always try to read real temperature if pin is defined
  if (TEMP_SENSOR_PIN != -1) {
    currentTemperature = readThermistor(TEMP_SENSOR_PIN);
  } else {
    // If no pin defined, use simulation behavior below
    // (This allows testing without hardware changes if pin is -1)
  }

  if (useRealSensors) {
    // If you have an encoder, uncomment the line below and comment out position tracking in movement functions
    // zPosition = readEncoderPosition(Z_ENCODER_PIN);
    
    // Ensure Z position doesn't exceed home (0.00mm)
    if (zPosition > 0.0) {
      zPosition = 0.0;  // Clamp to home position
    }
  } else {
    // Simulation mode for other sensors
  static unsigned long lastSensorUpdate = 0;
  if (millis() - lastSensorUpdate > 1000) {
      // Clamp Z position: cannot go above 0.00mm (home), can go negative (downward)
      if (zPosition > 0.0) {
        zPosition = 0.0;  // Clamp to home position
      }
    
    // Only simulate temp if NO PIN is defined
    if (TEMP_SENSOR_PIN == -1) {
      if (heaterEnabled && currentTemperature < targetTemperature) {
        currentTemperature += 1.0;  // Heat up at 1°C per second
        if (currentTemperature > targetTemperature) {
          currentTemperature = targetTemperature;  // Don't overshoot
        }
      } else if (!heaterEnabled && currentTemperature > 25.0) {
        currentTemperature -= 0.5;  // Cool down at 0.5°C per second
        if (currentTemperature < 25.0) {
          currentTemperature = 25.0;  // Room temperature minimum
        }
      }
    }
    
    // Simulate movement completing
    if (isMoving) {
      static unsigned long movementStartTime = 0;
      if (movementStartTime == 0) {
        movementStartTime = millis();
      }
      // Simulate movement takes 500ms
      if (millis() - movementStartTime > 500) {
        isMoving = false;
        movementStartTime = 0;
      }
    }
    
    // Simulate wire feeding completing
    if (isWireFeeding) {
      static unsigned long feedStartTime = 0;
      if (feedStartTime == 0) {
        feedStartTime = millis();
      }
      // Simulate wire feed takes 2 seconds
      if (millis() - feedStartTime > 2000) {
        isWireFeeding = false;
        wireFeedStatus = "idle";
        feedStartTime = 0;
      }
    }
    
    lastSensorUpdate = millis();
    }
  }
}

void sendMachineState() {
  // Create JSON document (adjust size based on your data)
  StaticJsonDocument<1024> doc;
  
  // Position data (single-axis machine: only Z-axis)
  JsonObject pos = doc.createNestedObject("pos");
  pos["z"] = zPosition;
  pos["moving"] = isMoving;
  
  // Configuration data (for app to display/verify)
  JsonObject config = doc.createNestedObject("config");
  config["leadScrewPitch"] = LEAD_SCREW_PITCH_MM;
  config["motorStepsPerRev"] = MOTOR_STEPS_PER_REVOLUTION;
  config["microstepping"] = MICROSTEPPING;
  config["stepsPerMm"] = zStepsPerMm;
  
  // Limit switch status (for app warnings)
  JsonObject limits = doc.createNestedObject("limits");
  limits["upper"] = isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN);  // Upper limit (home position)
  limits["lower"] = isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN);  // Lower limit (bottom)
  
  // Temperature data
  JsonObject temp = doc.createNestedObject("temp");
  temp["target"] = targetTemperature;
  temp["current"] = currentTemperature;
  temp["heater"] = heaterEnabled;
  
  // Wire feed data
  JsonObject wire = doc.createNestedObject("wire");
  wire["status"] = wireFeedStatus;
  wire["feedRate"] = wireFeedRate;
  wire["break"] = wireBreakDetected;
  
  // Spool data
  JsonObject spool = doc.createNestedObject("spool");
  spool["weight"] = spoolWeight;
  spool["wireLength"] = wireLength;
  spool["diameter"] = wireDiameter;
  spool["remaining"] = remainingPercentage;
  spool["feeding"] = isWireFeeding;
  
  // Flux data
  JsonObject flux = doc.createNestedObject("flux");
  flux["percentage"] = fluxPercentage;
  flux["ml"] = fluxMl;
  

  
  // Fume extractor
  JsonObject fume = doc.createNestedObject("fume");
  fume["enabled"] = fumeExtractorEnabled;
  fume["speed"] = fumeExtractorSpeed;
  
  // Flux mist
  JsonObject fluxMist = doc.createNestedObject("fluxMist");
  fluxMist["enabled"] = fluxMistEnabled;
  fluxMist["dispensing"] = fluxMistDispensing;
  fluxMist["flowRate"] = fluxMistFlowRate;
  
  // Air breeze
  JsonObject airBreeze = doc.createNestedObject("airBreeze");
  airBreeze["enabled"] = airBreezeEnabled;
  airBreeze["active"] = airBreezeActive;
  airBreeze["intensity"] = airBreezeIntensity;
  
  // Air jet pressure
  JsonObject airJet = doc.createNestedObject("airJet");
  airJet["enabled"] = airJetEnabled;
  airJet["active"] = airJetActive;
  airJet["pressure"] = airJetPressure;
  
  // Sequence data
  JsonObject seq = doc.createNestedObject("seq");
  seq["stage"] = sequenceStage;
  seq["active"] = sequenceActive;
  seq["pad"] = currentPad;
  seq["total"] = totalPads;
  seq["progress"] = sequenceProgress;
  // Send null if no error, otherwise send error message
  if (sequenceError.length() > 0) {
    seq["error"] = sequenceError;
  } else {
    seq["error"] = nullptr;  // Send null for no error (JSON null)
  }
  
  // Component height
  doc["height"] = componentHeight;
  
  // Serialize JSON and send via Serial
  serializeJson(doc, Serial);
  Serial.println(); // Important: Send newline after JSON
}

void processCommands() {
  // Process incoming commands from Electron app
  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    // Skip if empty
    if (command.length() == 0) {
      return;
    }
    
    // Parse JSON commands
    if (command.startsWith("{")) {
      StaticJsonDocument<512> cmdDoc;
      DeserializationError error = deserializeJson(cmdDoc, command);
      
      if (error) {
        Serial.print("[CMD] JSON Parse Error: ");
        Serial.println(error.c_str());
        return;
      }
      
      // JSON parsed successfully
      String cmd = cmdDoc["command"] | "";
      Serial.print("[CMD] Parsed command: ");
      Serial.println(cmd);
        
        if (cmd == "move") {
          // Move to absolute position (single-axis: only Z movement)
          float z = cmdDoc["z"] | zPosition;
          Serial.print("[CMD] Executing move command: z=");
          Serial.println(z);
          moveZAxisTo(z);
        }
        else if (cmd == "temp" || cmd == "temperature") {
          targetTemperature = cmdDoc["target"] | targetTemperature;
          Serial.print("[CMD] Set target temperature: ");
          Serial.println(targetTemperature);
        }
        else if (cmd == "heater") {
          heaterEnabled = cmdDoc["enable"] | heaterEnabled;
          Serial.print("[CMD] Heater ");
          Serial.println(heaterEnabled ? "ENABLED" : "DISABLED");
          // Simple ON/OFF control
          if (HEATER_PIN != -1) digitalWrite(HEATER_PIN, heaterEnabled ? HIGH : LOW);
        }
        else if (cmd == "feed" || cmd == "wirefeed") {
          float length = cmdDoc["length"] | 0;
          if (length > 0) {
            wireFeedStatus = "feeding";
            isWireFeeding = true;
            feedWireByLength(length);
            // After feeding, update status
            wireFeedStatus = "idle";
            isWireFeeding = false;
          }
        }

        else if (cmd == "fume") {
          fumeExtractorEnabled = cmdDoc["enabled"] | fumeExtractorEnabled;
          fumeExtractorSpeed = cmdDoc["speed"] | fumeExtractorSpeed;
          // TODO: Control fume extractor
          if (FUME_EXTRACTOR_PIN != -1) digitalWrite(FUME_EXTRACTOR_PIN, fumeExtractorEnabled ? HIGH : LOW);
        }
        else if (cmd == "fluxmist") {
          fluxMistEnabled = cmdDoc["enabled"] | fluxMistEnabled;
          fluxMistFlowRate = cmdDoc["flowRate"] | fluxMistFlowRate;
          if (cmdDoc["dispense"]) {
            fluxMistDispensing = true;
            // TODO: Start flux mist dispensing
            if (FLUX_MIST_PIN != -1) {
                digitalWrite(FLUX_MIST_PIN, HIGH);
                float duration = cmdDoc["duration"] | 500;
                delay(duration); 
                digitalWrite(FLUX_MIST_PIN, LOW);
                fluxMistDispensing = false;
            }
          }
        }
        else if (cmd == "airbreeze") {
          airBreezeEnabled = cmdDoc["enabled"] | airBreezeEnabled;
          airBreezeIntensity = cmdDoc["intensity"] | airBreezeIntensity;
          if (cmdDoc["activate"]) {
            airBreezeActive = true;
            // TODO: Activate air breeze
             if (AIR_BREEZE_PIN != -1) {
                digitalWrite(AIR_BREEZE_PIN, HIGH);
                float duration = cmdDoc["duration"] | 2000;
                delay(duration);
                digitalWrite(AIR_BREEZE_PIN, LOW);
                airBreezeActive = false;
             }
          } else {
             // If just enabled/disabled without "activate" (toggle switch)
             if (AIR_BREEZE_PIN != -1) digitalWrite(AIR_BREEZE_PIN, airBreezeEnabled ? HIGH : LOW);
          }
        }
        else if (cmd == "airjet") {
          airJetEnabled = cmdDoc["enabled"] | airJetEnabled;
          airJetPressure = cmdDoc["pressure"] | airJetPressure;
          if (cmdDoc["activate"]) {
            airJetActive = true;
            // TODO: Activate air jet
            if (AIR_JET_PIN != -1) {
                digitalWrite(AIR_JET_PIN, HIGH);
                float duration = cmdDoc["duration"] | 200;
                delay(duration);
                digitalWrite(AIR_JET_PIN, LOW);
                airJetActive = false;
             }
          } else {
             if (AIR_JET_PIN != -1) digitalWrite(AIR_JET_PIN, airJetEnabled ? HIGH : LOW);
          }
        }
        else if (cmd == "jog") {
          // Manual movement commands (single-axis: only Z-axis)
          String axis = cmdDoc["axis"] | "";
          float distance = cmdDoc["distance"] | 0;
          unsigned int speedDelay = 0;
          if (cmdDoc.containsKey("speed")) {
            float speedValue = cmdDoc["speed"] | 0;
            if (speedValue > 0 && speedValue <= 100) {
              // Normal range: 1-100% maps to Z_STEP_DELAY_MAX (800μs) to Z_STEP_DELAY_MIN (30μs)
              speedDelay = Z_STEP_DELAY_MAX - static_cast<unsigned int>(((speedValue - 1.0f) / 99.0f) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN));
            } else if (speedValue > 100 && speedValue <= 200) {
              // Turbo range: 101-200% maps to Z_STEP_DELAY_MIN (30μs) to Z_STEP_DELAY_TURBO_MIN (20μs)
              speedDelay = Z_STEP_DELAY_MIN - static_cast<unsigned int>(((speedValue - 101.0f) / 99.0f) * (Z_STEP_DELAY_MIN - Z_STEP_DELAY_TURBO_MIN));
              if (speedDelay < Z_STEP_DELAY_TURBO_MIN) speedDelay = Z_STEP_DELAY_TURBO_MIN;
            } else if (speedValue > 200) {
              // Direct delay value in microseconds (for advanced users)
              speedDelay = static_cast<unsigned int>(speedValue);
              if (speedDelay < Z_STEP_DELAY_TURBO_MIN) speedDelay = Z_STEP_DELAY_TURBO_MIN;
              if (speedDelay > Z_STEP_DELAY_MAX) speedDelay = Z_STEP_DELAY_MAX;
            }
          }
          
          Serial.print("[CMD] Jog command: axis=");
          Serial.print(axis);
          Serial.print(", distance=");
          Serial.print(distance);
          if (speedDelay > 0) {
            Serial.print(", speedDelay=");
            Serial.print(speedDelay);
            Serial.print("us");
          }
          Serial.println();
          
          // Single-axis machine: only Z-axis movement is supported
          if (axis == "z" || axis == "Z") {
            moveZAxisByDistance(distance, speedDelay);
            // Note: moveZAxisByDistance() now calls sendMachineState() internally
            // so we don't need to call it again here (but calling twice is harmless)
          } else {
            Serial.println("[CMD] WARNING: X/Y axis not supported (single-axis machine)");
          }
        }
        else if (cmd == "setspeed" || cmd == "speed") {
          float speedValue = cmdDoc["speed"] | 0;
          if (speedValue > 0 && speedValue <= 100) {
            currentZStepDelay = Z_STEP_DELAY_MAX - static_cast<unsigned int>(((speedValue - 1.0f) / 99.0f) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN));
            Serial.print("[CMD] Speed set to ");
            Serial.print(speedValue);
            Serial.print("% (delay: ");
            Serial.print(currentZStepDelay);
            Serial.println("us)");
          } else if (speedValue > 100) {
            currentZStepDelay = static_cast<unsigned int>(speedValue);
            if (currentZStepDelay < Z_STEP_DELAY_MIN) currentZStepDelay = Z_STEP_DELAY_MIN;
            if (currentZStepDelay > Z_STEP_DELAY_MAX) currentZStepDelay = Z_STEP_DELAY_MAX;
            Serial.print("[CMD] Speed delay set to ");
            Serial.print(currentZStepDelay);
            Serial.println("us");
          }
        }
        else if (cmd == "home") {
          // Optional speed parameter for homing
          unsigned int speedDelay = 0;
          if (cmdDoc.containsKey("speed")) {
            float speedValue = cmdDoc["speed"] | 0;
            if (speedValue > 0 && speedValue <= 100) {
              // Formula: delay = MAX - ((speed - 1) / (100 - 1)) * (MAX - MIN)
              speedDelay = Z_STEP_DELAY_MAX - static_cast<unsigned int>(((speedValue - 1.0f) / 99.0f) * (Z_STEP_DELAY_MAX - Z_STEP_DELAY_MIN));
            } else if (speedValue > 100) {
              speedDelay = static_cast<unsigned int>(speedValue);
            }
          }
          Serial.println("[CMD] Executing home command");
          homeZAxis(speedDelay);
        }
        else if (cmd == "save") {
          // Save movement sequence from home position to current position
          Serial.println("[CMD] Executing save command");
          saveMovementSequence();
        }
        else if (cmd == "calibrate" || cmd == "setstepspermm") {
          // Calibrate Z-axis steps per millimeter
          // Usage options:
          // 1. {"command":"calibrate","stepsPerMm":1600.0} - Direct value
          // 2. {"command":"calibrate","commanded":5.0,"actual":4.89} - Auto-calculate correction
          // 3. {"command":"calibrate","microstepping":16} - Recalculate from microstepping
          // 4. {"command":"calibrate","leadScrewPitch":2.0,"microstepping":16} - Recalculate from both
          
          if (cmdDoc.containsKey("stepsPerMm")) {
            // Direct steps per mm value
            float newStepsPerMm = cmdDoc["stepsPerMm"] | zStepsPerMm;
            if (newStepsPerMm > 0 && newStepsPerMm < 10000) {
              zStepsPerMm = newStepsPerMm;
              Serial.print("[CMD] Z-axis steps per mm set to: ");
              Serial.println(zStepsPerMm, 3);
            } else {
              Serial.println("[CMD] ERROR: Invalid steps per mm value (must be > 0 and < 10000)");
            }
          } else if (cmdDoc.containsKey("leadScrewPitch") && cmdDoc.containsKey("microstepping")) {
            // Recalculate from lead screw pitch and microstepping
            float newPitch = cmdDoc["leadScrewPitch"] | LEAD_SCREW_PITCH_MM;
            int newMicrostepping = cmdDoc["microstepping"] | MICROSTEPPING;
            if (newPitch > 0 && newMicrostepping > 0) {
              zStepsPerMm = (static_cast<float>(MOTOR_STEPS_PER_REVOLUTION) * static_cast<float>(newMicrostepping)) / newPitch;
              Serial.print("[CMD] Recalculated steps per mm: ");
              Serial.print("(");
              Serial.print(MOTOR_STEPS_PER_REVOLUTION);
              Serial.print(" × ");
              Serial.print(newMicrostepping);
              Serial.print(") / ");
              Serial.print(newPitch, 1);
              Serial.print(" = ");
              Serial.println(zStepsPerMm, 3);
            } else {
              Serial.println("[CMD] ERROR: Lead screw pitch and microstepping must be positive");
            }
          } else if (cmdDoc.containsKey("microstepping")) {
            // Recalculate using current lead screw pitch and new microstepping
            int newMicrostepping = cmdDoc["microstepping"] | MICROSTEPPING;
            if (newMicrostepping > 0) {
              zStepsPerMm = (static_cast<float>(MOTOR_STEPS_PER_REVOLUTION) * static_cast<float>(newMicrostepping)) / LEAD_SCREW_PITCH_MM;
              Serial.print("[CMD] Recalculated steps per mm with microstepping ");
              Serial.print(newMicrostepping);
              Serial.print(": (");
              Serial.print(MOTOR_STEPS_PER_REVOLUTION);
              Serial.print(" × ");
              Serial.print(newMicrostepping);
              Serial.print(") / ");
              Serial.print(LEAD_SCREW_PITCH_MM, 1);
              Serial.print(" = ");
              Serial.println(zStepsPerMm, 3);
            } else {
              Serial.println("[CMD] ERROR: Microstepping must be positive");
            }
          } else if (cmdDoc.containsKey("commanded") && cmdDoc.containsKey("actual")) {
            // Auto-calibrate based on commanded vs actual movement
            float commanded = cmdDoc["commanded"] | 0;
            float actual = cmdDoc["actual"] | 0;
            if (commanded > 0 && actual > 0) {
              // Calculate correction factor: new_steps_per_mm = old_steps_per_mm * (commanded / actual)
              float correctionFactor = commanded / actual;
              zStepsPerMm = zStepsPerMm * correctionFactor;
              Serial.print("[CMD] Calibration: Commanded ");
              Serial.print(commanded, 2);
              Serial.print("mm, Actual ");
              Serial.print(actual, 2);
              Serial.print("mm, Correction factor: ");
              Serial.print(correctionFactor, 4);
              Serial.print(", New steps per mm: ");
              Serial.println(zStepsPerMm, 3);
            } else {
              Serial.println("[CMD] ERROR: Commanded and actual must be positive numbers");
            }
          } else {
            // Show current configuration and usage
            Serial.println("[CMD] Current configuration:");
            Serial.print("[CMD]   Lead screw pitch: ");
            Serial.print(LEAD_SCREW_PITCH_MM, 1);
            Serial.println(" mm");
            Serial.print("[CMD]   Motor steps/rev: ");
            Serial.println(MOTOR_STEPS_PER_REVOLUTION);
            Serial.print("[CMD]   Microstepping: ");
            Serial.println(MICROSTEPPING);
            Serial.print("[CMD]   Calculated steps per mm: ");
            Serial.println(zStepsPerMm, 3);
            Serial.println("[CMD] Usage options:");
            Serial.println("[CMD]   1. {\"command\":\"calibrate\",\"stepsPerMm\":1600.0}");
            Serial.println("[CMD]   2. {\"command\":\"calibrate\",\"commanded\":5.0,\"actual\":4.89}");
            Serial.println("[CMD]   3. {\"command\":\"calibrate\",\"microstepping\":16}");
            Serial.println("[CMD]   4. {\"command\":\"calibrate\",\"leadScrewPitch\":1.0,\"microstepping\":16}");
          }
        }
        else {
          Serial.print("[CMD] WARNING: Unknown command: ");
          Serial.println(cmd);
        }
    }
    // Debug: echo received command (ENABLED FOR TESTING)
    Serial.print("[CMD] Received: ");
    Serial.println(command);
  }
}

// Z-axis motion helper functions

bool isLimitSwitchTriggered(int pin) {
  // Both switches seem to be behaving as Active Low.
  // Safe State (Open) = Internal Pullup = HIGH
  // Triggered State (Closed) = Connects to GND = LOW
  return digitalRead(pin) == LOW;
}

// Standard digital pulse function
void pulseZStep(unsigned int stepDelayUs = 0) {
  unsigned int delayUs = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  
  // Standard stepper pulse
  digitalWrite(STEPPER_Z_STEP_PIN, HIGH);
  delayMicroseconds(PULSE_WIDTH_US); // Minimum pulse width
  digitalWrite(STEPPER_Z_STEP_PIN, LOW);
  
  // The delay determines the speed. 
  // We subtract the pulse width to maintain accurate timing, though negligible at low speeds.
  if (delayUs > PULSE_WIDTH_US) {
    delayMicroseconds(delayUs - PULSE_WIDTH_US);
  } else {
    delayMicroseconds(1); // Safety minimum
  }
}

void applyZMovement(long steps, bool moveUp, unsigned int stepDelayUs = 0) {
  if (steps <= 0) {
    return;
  }

  // moveUp = true means moving towards home (0.00mm) - direction HIGH
  // moveUp = false means moving away from home (downward, negative) - direction LOW
  digitalWrite(STEPPER_Z_DIR_PIN, moveUp ? HIGH : LOW);

  // Use provided delay or default
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  // Allow delays below Z_STEP_DELAY_MIN for turbo mode (but not below Z_STEP_DELAY_TURBO_MIN)
  if (delay < Z_STEP_DELAY_TURBO_MIN) delay = Z_STEP_DELAY_TURBO_MIN;
  if (delay > Z_STEP_DELAY_MAX) delay = Z_STEP_DELAY_MAX;

  long stepsCompleted = 0;
  // Check limit switches every step for immediate detection and safety
  // This ensures warnings show immediately when limit switches trigger
  bool limitHit = false;
  
  while (stepsCompleted < steps) {
    // Check limit switches EVERY STEP for immediate detection
    // This ensures the app gets notified immediately when a limit switch is triggered
    if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
      limitHit = true;
      break; // Hit bottom limit
    }
    if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
      zPosition = Z_HOME_POSITION;  // 0.00mm - reached home
      limitHit = true;
      break;
    }

    pulseZStep(delay);
    stepsCompleted++;
  }

  // If limit switch was hit, stop movement immediately
  if (limitHit) {
    isMoving = false;  // Stop movement flag immediately
  }

  // Calculate position change (optimized - removed debug Serial prints)
  float deltaMm = (static_cast<float>(stepsCompleted) / zStepsPerMm) * (moveUp ? 1.0f : -1.0f);
  zPosition = zPosition + deltaMm;
  
  // Clamp: cannot go above home (0.00mm), can go negative (downward)
  if (zPosition > Z_HOME_POSITION) {
    zPosition = Z_HOME_POSITION;
  }
  
  // If limit switch was hit, ensure position is correct
  if (limitHit) {
    if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
      zPosition = Z_HOME_POSITION;  // At home position
    }
  }
}

void moveZAxisByDistance(float distanceMm, unsigned int stepDelayUs) {
  if (fabsf(distanceMm) < 0.001f) {
    return;
  }

  // distanceMm > 0 means move up (towards home/0.00mm)
  // distanceMm < 0 means move down (away from home, negative values)
  bool moveUp = distanceMm > 0;

  // Check limit switches before moving
  // Cannot move down if at bottom limit (safety check)
  if (!moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    isMoving = false;  // Ensure movement flag is cleared
    sendMachineState();  // Immediately notify app that limit switch is triggered
    return;  // Already at bottom, cannot move further down
  }
  // Cannot move up if already at home (0.00mm)
  if (moveUp && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_HOME_POSITION;  // Ensure at home
    isMoving = false;  // Ensure movement flag is cleared
    sendMachineState();  // Immediately notify app that limit switch is triggered
    return;
  }
  // Also check if already at home and trying to move up
  if (moveUp && zPosition >= Z_HOME_POSITION) {
    zPosition = Z_HOME_POSITION;  // Clamp to home
    isMoving = false;  // Ensure movement flag is cleared
    sendMachineState();  // Immediately notify app
    return;
  }

  // Calculate target position (optimized - removed debug Serial prints)
  float target = zPosition + distanceMm;
  
  // Clamp target: cannot exceed home (0.00mm), can go negative
  if (target > Z_HOME_POSITION) {
    target = Z_HOME_POSITION;
  }
  
  float actualDistance = target - zPosition;
  // For downward movement, use ceilf to ensure at least the commanded distance
  // For upward movement, use roundf for normal rounding
   float stepsFloat = fabsf(actualDistance * zStepsPerMm);
   long stepsToMove;
   if (actualDistance < 0) { // Downward movement
     stepsToMove = static_cast<long>(ceilf(stepsFloat)); // Round up to ensure at least commanded distance
   } else { // Upward movement
     stepsToMove = static_cast<long>(roundf(stepsFloat)); // Round to nearest for upward
   }

  if (stepsToMove == 0) {
    zPosition = target;
    return;
  }

  // Use provided delay, or clamp to valid range if using global delay
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  // Allow delays below Z_STEP_DELAY_MIN for turbo mode (but not below Z_STEP_DELAY_TURBO_MIN)
  if (delay < Z_STEP_DELAY_TURBO_MIN) delay = Z_STEP_DELAY_TURBO_MIN;
  if (delay > Z_STEP_DELAY_MAX) delay = Z_STEP_DELAY_MAX;

  isMoving = true;
  applyZMovement(stepsToMove, actualDistance > 0, delay);
  
  // Check if limit switch was hit during movement (applyZMovement may have set isMoving = false)
  bool limitHitDuringMovement = false;
  if (actualDistance > 0 && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    limitHitDuringMovement = true;
    zPosition = Z_HOME_POSITION;  // Ensure at home
  } else if (actualDistance < 0 && isLimitSwitchTriggered(LIMIT_SWITCH_Z_MIN_PIN)) {
    limitHitDuringMovement = true;
  }
  
  isMoving = false;  // Movement complete
  
  // Immediately send state update so app knows if limit switch was hit
  // This ensures warnings show immediately when limit switches trigger
  sendMachineState();
}

void moveZAxisTo(float targetMm, unsigned int stepDelayUs) {
  // Clamp target: cannot exceed home (0.00mm), can be negative
  float clampedTarget = targetMm;
  if (clampedTarget > Z_HOME_POSITION) {
    clampedTarget = Z_HOME_POSITION;
  }
  float distance = clampedTarget - zPosition;
  moveZAxisByDistance(distance, stepDelayUs);
}

void homeZAxis(unsigned int stepDelayUs) {
  // Use provided delay, or clamp to valid range if using global delay
  unsigned int delay = (stepDelayUs > 0) ? stepDelayUs : currentZStepDelay;
  // Allow delays below Z_STEP_DELAY_MIN for turbo mode (but not below Z_STEP_DELAY_TURBO_MIN)
  if (delay < Z_STEP_DELAY_TURBO_MIN) delay = Z_STEP_DELAY_TURBO_MIN;
  if (delay > Z_STEP_DELAY_MAX) delay = Z_STEP_DELAY_MAX;

  // Check if already at home position
  if (isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    zPosition = Z_HOME_POSITION;  // Already at home
    Serial.println("[Home] Already at home position");
    sendMachineState();  // Send status update
    return;
  }

  Serial.println("[Home] Starting homing sequence - moving upward until limit switch triggers...");

  isMoving = true;
  digitalWrite(STEPPER_Z_DIR_PIN, HIGH); // Move towards home (upward, towards Z_MAX limit switch)

  // Use ONLY limit switch - no Z_MAX_POSITION dependency
  // This ensures homing works regardless of machine configuration
  long stepsTaken = 0;
  const long SAFETY_MAX_STEPS = 100000;  // Large safety limit (only for failsafe, should never reach)
  
  // Move until limit switch triggers (like testing-25.ino - simple and reliable)
  while (!isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    // Safety failsafe: if we've taken too many steps, something is wrong
    if (stepsTaken >= SAFETY_MAX_STEPS) {
      Serial.println("[Home] ERROR: Safety limit reached - limit switch may be disconnected!");
      Serial.println("[Home] Stopping for safety. Check limit switch connection.");
      break;
    }
    
    pulseZStep(delay);
    stepsTaken++;
    
    // Progress update every 5000 steps
    if (stepsTaken % 5000 == 0) {
      Serial.print("[Home] Steps: ");
      Serial.println(stepsTaken);
    }
  }

  // Home position is 0.00mm (at Z_MAX limit switch)
  zPosition = Z_HOME_POSITION;  // 0.00mm
  isMoving = false;
  
  if (isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
    Serial.print("[Home] Complete! Reached home position after ");
    Serial.print(stepsTaken);
    Serial.println(" steps.");
  } else {
    Serial.println("[Home] WARNING: Stopped before reaching limit switch!");
  }
  
  // Immediately send state update to app
  sendMachineState();
}

// ----------------------------------
// Wire feed helper functions
// ----------------------------------

// Standard wire feed step function
void pulseWireFeedStep() {
  digitalWrite(WIRE_FEED_STEP_PIN, HIGH);
  delayMicroseconds(PULSE_WIDTH_US);
  digitalWrite(WIRE_FEED_STEP_PIN, LOW);
  
  if (WIRE_FEED_STEP_DELAY_US > PULSE_WIDTH_US) {
    delayMicroseconds(WIRE_FEED_STEP_DELAY_US - PULSE_WIDTH_US);
  } else {
    delayMicroseconds(1);
  }
}

void feedWireByLength(float lengthMm) {
  if (lengthMm <= 0) {
    return;
  }

  // Set direction: HIGH = feed wire out, LOW = retract (if needed)
  digitalWrite(WIRE_FEED_DIR_PIN, HIGH);

  // Calculate number of steps needed
  long stepsToMove = static_cast<long>(lengthMm * WIRE_FEED_STEPS_PER_MM);

  if (stepsToMove <= 0) {
    return;
  }

  // Feed wire by pulsing the stepper motor
  for (long i = 0; i < stepsToMove; i++) {
    pulseWireFeedStep();
    
    // Optional: Add small delay between steps for smoother operation
    // This can be adjusted based on your feed rate requirements
    // delayMicroseconds(100); // Uncomment if needed
  }
}

// ----------------------------------
// Button control functions
// ----------------------------------

void handleButtonControls() {
  // Read current button states (LOW = pressed, HIGH = not pressed with INPUT_PULLUP)
  bool currentButtonUp = digitalRead(BUTTON_UP_PIN);
  bool currentButtonDown = digitalRead(BUTTON_DOWN_PIN);
  bool currentButtonSave = digitalRead(BUTTON_SAVE_PIN);
  bool currentPaddle = digitalRead(PADDLE_PIN);
  
  unsigned long currentTime = millis();
  
  // Handle UP button (moves head upward towards home/0.00mm)
  if (currentButtonUp == LOW) {
    // Button is pressed
    if (currentTime - lastButtonUpPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonUpRepeat == 0 || (currentTime - lastButtonUpRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Check if already at home (cannot move above 0.00mm)
          if (zPosition >= Z_HOME_POSITION || isLimitSwitchTriggered(LIMIT_SWITCH_Z_MAX_PIN)) {
            zPosition = Z_HOME_POSITION;  // Ensure at home
            // Don't move if already at home
          } else {
            // Move head up by a small increment (positive distance = move up)
          moveZAxisByDistance(0.1f);
          }
          lastButtonUpRepeat = currentTime;
        }
      }
    }
  } else {
    // Button released - reset repeat timer
    if (lastButtonUpState == LOW) {
      lastButtonUpRepeat = 0;
      lastButtonUpPress = 0; // Reset debounce timer
    }
  }
  lastButtonUpState = currentButtonUp;
  
  // Handle DOWN button (moves head downward, negative values)
  if (currentButtonDown == LOW) {
    // Button is pressed
    if (currentTime - lastButtonDownPress > BUTTON_DEBOUNCE_MS) {
      // First press or repeat - check if enough time has passed
      if (lastButtonDownRepeat == 0 || (currentTime - lastButtonDownRepeat > BUTTON_REPEAT_DELAY_MS)) {
        if (!isExecutingSavedMovement) {
          // Move head down by a small increment (negative distance = move down)
          moveZAxisByDistance(-0.1f);
          lastButtonDownRepeat = currentTime;
        }
      }
    }
  } else {
    // Button released - reset repeat timer
    if (lastButtonDownState == LOW) {
      lastButtonDownRepeat = 0;
      lastButtonDownPress = 0; // Reset debounce timer
    }
  }
  lastButtonDownState = currentButtonDown;
  
  // Handle SAVE button (saves movement sequence from home position)
  if (currentButtonSave == LOW && lastButtonSaveState == HIGH) {
    // Button just pressed (falling edge)
    if (currentTime - lastButtonSavePress > BUTTON_DEBOUNCE_MS) {
      saveMovementSequence();
      lastButtonSavePress = currentTime;
    }
  }
  lastButtonSaveState = currentButtonSave;
  
  // Handle PADDLE (executes saved movement sequence)
  if (currentPaddle == LOW && lastPaddleState == HIGH) {
    // Paddle just pressed (falling edge)
    if (currentTime - lastPaddlePress > BUTTON_DEBOUNCE_MS) {
      if (hasSavedMovement && !isMoving && !isExecutingSavedMovement) {
        executeSavedMovement();
      }
      lastPaddlePress = currentTime;
    }
  }
  lastPaddleState = currentPaddle;
}

void saveMovementSequence() {
  // Save the movement from home position to current position
  // Home position is 0.00mm (at Z_MAX limit switch)
  homePosition = Z_HOME_POSITION;  // 0.00mm
  savedMovementDistance = zPosition - homePosition;  // Will be negative if below home
  hasSavedMovement = true;
  
  // Send confirmation via Serial
  Serial.print("Movement saved: ");
  Serial.print(savedMovementDistance);
  Serial.print(" mm from home position (current Z: ");
  Serial.print(zPosition);
  Serial.println(" mm)");
}

void executeSavedMovement() {
  if (!hasSavedMovement) {
    Serial.println("No saved movement to execute");
    return;
  }
  
  isExecutingSavedMovement = true;
  isMoving = true;
  
  // Check current position relative to home
  // If we are close to home (within 0.5mm), go to saved position
  // Otherwise, go back to home
  float distToHome = abs(zPosition - homePosition);
  
  if (distToHome < 0.5f) {
    // Go Down to Saved Position
    Serial.print("Paddle: Going DOWN to saved position (");
    Serial.print(savedMovementDistance);
    Serial.println(" mm)");
    
    if (savedMovementDistance != 0.0f) {
      moveZAxisByDistance(savedMovementDistance);
    }
  } else {
    // Go Up to Home
    Serial.println("Paddle: Going UP to home position");
    moveZAxisTo(homePosition);
  }
  
  Serial.println("Paddle movement execution complete");
  isExecutingSavedMovement = false;
  isMoving = false;
}
void manageHeater() {
  if (HEATER_PIN == -1) return;

  // Simple hysteresis (Bang-Bang) control
  // Adjust HYSTERESIS value as needed (e.g., 2.0 degrees)
  const float HYSTERESIS = 2.0;

  if (heaterEnabled) {
    if (currentTemperature < (targetTemperature - HYSTERESIS)) {
      digitalWrite(HEATER_PIN, HIGH); // Turn ON
    } else if (currentTemperature > targetTemperature) {
      digitalWrite(HEATER_PIN, LOW);  // Turn OFF
    }
    // If between (Target - Hysteresis) and Target, keep current state (maintain heat)
  } else {
    digitalWrite(HEATER_PIN, LOW); // Always OFF if disabled
  }
}

// Read NTC 100k Thermistor using Beta equation
// Assumes 4.7k pull-up resistor (standard RAMPS/Arduino setup)
float readThermistor(int pin) {
  int rawADC = analogRead(pin);
  if (rawADC == 0) return -999.0; // Error or open circuit
  
  // Steinhart-Hart / Beta equation parameters for 100k NTC (3950 Beta)
  // Standard RepRap/RAMPS style thermistor
  const float BETA = 3950.0; 
  const float SERIES_RESISTOR = 4700.0;
  const float THERMISTOR_NOMINAL = 100000.0;
  const float TEMP_NOMINAL = 25.0;
  
  // Calculate resistance
  float resistance = SERIES_RESISTOR / ((1023.0 / rawADC) - 1.0);
  
  // Calculate temperature (Kelvin)
  float steinhart;
  steinhart = resistance / THERMISTOR_NOMINAL;     // (R/Ro)
  steinhart = log(steinhart);                  // ln(R/Ro)
  steinhart /= BETA;                           // 1/B * ln(R/Ro)
  steinhart += 1.0 / (TEMP_NOMINAL + 273.15); // + (1/To)
  steinhart = 1.0 / steinhart;                 // Invert
  steinhart -= 273.15;                         // Convert to Celsius

  return steinhart;
}
