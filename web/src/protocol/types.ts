// PocketPad Protocol & Controller Types

export const XINPUT_BUTTONS = {
  DPAD_UP: 0x0001,
  DPAD_DOWN: 0x0002,
  DPAD_LEFT: 0x0004,
  DPAD_RIGHT: 0x0008,
  START: 0x0010,
  BACK: 0x0020,
  LEFT_THUMB: 0x0040,   // LS click
  RIGHT_THUMB: 0x0080,  // RS click
  LEFT_SHOULDER: 0x0100,// LB
  RIGHT_SHOULDER: 0x0200,// RB
  GUIDE: 0x0400,        // Xbox Guide / Home
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
} as const;

export interface ControllerState {
  buttons: number;      // 16-bit bitfield
  leftTrigger: number;  // 0 - 255
  rightTrigger: number; // 0 - 255
  thumbLX: number;      // -32768 - 32767
  thumbLY: number;      // -32768 - 32767 (up is positive)
  thumbRX: number;      // -32768 - 32767
  thumbRY: number;      // -32768 - 32767 (up is positive)
}

export interface ControllerSettings {
  stickSensitivity: number; // 0.5 - 2.0
  stickDeadzone: number;    // 0.0 - 0.3
  invertYLeft: boolean;
  invertYRight: boolean;
  triggerMode: 'analog' | 'hair';
  southpaw: boolean;
  buttonOpacity: number;    // 0.3 - 1.0
  controlScale: number;     // 0.8 - 1.2
  hapticsEnabled: boolean;
}

export const DEFAULT_SETTINGS: ControllerSettings = {
  stickSensitivity: 1.0,
  stickDeadzone: 0.08,
  invertYLeft: false,
  invertYRight: false,
  triggerMode: 'analog',
  southpaw: false,
  buttonOpacity: 0.88,
  controlScale: 1.0,
  hapticsEnabled: true,
};

export interface HostInfo {
  status: 'ok' | 'driver_missing' | 'error';
  driverInstalled: boolean;
  driverName: string;
  driverVersion?: string;
  pairingCode: string;
  serverUrl: string;
  ipAddresses: string[];
  port: number;
  activeClientConnected: boolean;
  activeClientIp?: string;
  activeClients: number;
  controllerSlots: number;
  packetsReceived: number;
  rttMs?: number;
}
