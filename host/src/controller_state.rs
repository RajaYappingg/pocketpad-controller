use crate::protocol::RawInputPacket;

pub mod buttons {
    pub const DPAD_UP: u16 = 0x0001;
    pub const DPAD_DOWN: u16 = 0x0002;
    pub const DPAD_LEFT: u16 = 0x0004;
    pub const DPAD_RIGHT: u16 = 0x0008;
    pub const START: u16 = 0x0010;
    pub const BACK: u16 = 0x0020;
    pub const LEFT_THUMB: u16 = 0x0040; // LS Click
    pub const RIGHT_THUMB: u16 = 0x0080; // RS Click
    pub const LEFT_SHOULDER: u16 = 0x0100; // LB
    pub const RIGHT_SHOULDER: u16 = 0x0200; // RB
    pub const GUIDE: u16 = 0x0400; // Xbox Guide
    pub const A: u16 = 0x1000;
    pub const B: u16 = 0x2000;
    pub const X: u16 = 0x4000;
    pub const Y: u16 = 0x8000;
    /// All currently defined button bits. Packets must not set bits outside this.
    pub const ALL: u16 = 0xFFFF;
}

/// XInput default left/right thumb deadzone in raw units.
pub const THUMB_DEADZONE: i16 = 7849;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ControllerState {
    pub buttons: u16,
    pub left_trigger: u8,
    pub right_trigger: u8,
    pub thumb_lx: i16,
    pub thumb_ly: i16,
    pub thumb_rx: i16,
    pub thumb_ry: i16,
}

impl Default for ControllerState {
    fn default() -> Self {
        Self::neutral()
    }
}

impl ControllerState {
    /// Returns a completely neutral controller state (no buttons pressed, triggers 0, sticks centered)
    pub const fn neutral() -> Self {
        Self {
            buttons: 0,
            left_trigger: 0,
            right_trigger: 0,
            thumb_lx: 0,
            thumb_ly: 0,
            thumb_rx: 0,
            thumb_ry: 0,
        }
    }

    /// Checks if a specific button bitmask is pressed
    pub const fn is_button_pressed(&self, button_mask: u16) -> bool {
        (self.buttons & button_mask) != 0
    }

    /// Sets or clears a specific button bitmask
    pub fn set_button(&mut self, button_mask: u16, pressed: bool) {
        if pressed {
            self.buttons |= button_mask;
        } else {
            self.buttons &= !button_mask;
        }
    }

    /// Converts a received raw packet into sanitized ControllerState
    pub fn from_raw_packet(raw: &RawInputPacket) -> Self {
        let mut state = Self {
            buttons: raw.buttons,
            left_trigger: raw.left_trigger,
            right_trigger: raw.right_trigger,
            thumb_lx: raw.thumb_lx,
            thumb_ly: raw.thumb_ly,
            thumb_rx: raw.thumb_rx,
            thumb_ry: raw.thumb_ry,
        };
        state.sanitize();
        state
    }

    fn apply_deadzone(v: i16) -> i16 {
        if v.unsigned_abs() < THUMB_DEADZONE as u16 {
            0
        } else {
            v
        }
    }

    /// Clamps and sanitizes inputs to valid hardware bounds.
    /// Masks reserved button bits and applies the XInput thumb deadzone
    /// so drifting sticks settle at center instead of creeping.
    pub fn sanitize(&mut self) {
        self.buttons &= buttons::ALL;
        self.thumb_lx = Self::apply_deadzone(self.thumb_lx);
        self.thumb_ly = Self::apply_deadzone(self.thumb_ly);
        self.thumb_rx = Self::apply_deadzone(self.thumb_rx);
        self.thumb_ry = Self::apply_deadzone(self.thumb_ry);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_neutral_state() {
        let state = ControllerState::neutral();
        assert_eq!(state.buttons, 0);
        assert_eq!(state.left_trigger, 0);
        assert_eq!(state.right_trigger, 0);
        assert_eq!(state.thumb_lx, 0);
        assert_eq!(state.thumb_ly, 0);
        assert_eq!(state.thumb_rx, 0);
        assert_eq!(state.thumb_ry, 0);
    }

    #[test]
    fn test_button_flags() {
        let mut state = ControllerState::neutral();
        assert!(!state.is_button_pressed(buttons::A));

        state.set_button(buttons::A, true);
        assert!(state.is_button_pressed(buttons::A));

        state.set_button(buttons::B, true);
        assert!(state.is_button_pressed(buttons::A));
        assert!(state.is_button_pressed(buttons::B));
        assert_eq!(state.buttons, buttons::A | buttons::B);

        state.set_button(buttons::A, false);
        assert!(!state.is_button_pressed(buttons::A));
        assert!(state.is_button_pressed(buttons::B));
    }

    #[test]
    fn test_from_raw_packet() {
        let raw = RawInputPacket {
            sequence: 10,
            buttons: buttons::START | buttons::X,
            left_trigger: 200,
            right_trigger: 150,
            thumb_lx: -15000,
            thumb_ly: 12000,
            thumb_rx: 30000,
            thumb_ry: -30000,
        };

        let state = ControllerState::from_raw_packet(&raw);
        assert_eq!(state.buttons, buttons::START | buttons::X);
        assert_eq!(state.left_trigger, 200);
        assert_eq!(state.right_trigger, 150);
        assert_eq!(state.thumb_lx, -15000);
        assert_eq!(state.thumb_ly, 12000);
        assert_eq!(state.thumb_rx, 30000);
        assert_eq!(state.thumb_ry, -30000);
    }

    #[test]
    fn test_sanitize_deadzone_and_mask() {
        let raw = RawInputPacket {
            sequence: 1,
            buttons: 0xFFFF,
            left_trigger: 0,
            right_trigger: 0,
            thumb_lx: 100,   // inside deadzone
            thumb_ly: -7000, // inside deadzone
            thumb_rx: 7849,  // boundary: kept
            thumb_ry: -7850, // just outside: kept
        };
        let state = ControllerState::from_raw_packet(&raw);
        assert_eq!(state.buttons, buttons::ALL);
        assert_eq!(state.thumb_lx, 0);
        assert_eq!(state.thumb_ly, 0);
        assert_eq!(state.thumb_rx, 7849);
        assert_eq!(state.thumb_ry, -7850);
    }
}
