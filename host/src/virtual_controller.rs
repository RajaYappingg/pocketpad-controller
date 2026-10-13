#![allow(dead_code)]

use crate::controller_state::ControllerState;
use std::fmt;
use vigem_client::{Client, TargetId, XButtons, XGamepad, Xbox360Wired};

#[derive(Debug)]
pub enum ControllerError {
    DriverNotInstalled(String),
    PluginFailed(String),
    UpdateFailed(String),
    AlreadyDisconnected,
}

impl fmt::Display for ControllerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::DriverNotInstalled(msg) => write!(f, "ViGEmBus driver error: {msg}"),
            Self::PluginFailed(msg) => write!(f, "Failed to plug in virtual Xbox 360 controller: {msg}"),
            Self::UpdateFailed(msg) => write!(f, "Failed to update virtual controller state: {msg}"),
            Self::AlreadyDisconnected => write!(f, "Controller is already disconnected"),
        }
    }
}

impl std::error::Error for ControllerError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DriverStatus {
    Available { backend: &'static str },
    DriverMissing { reason: String, help_url: &'static str },
}

pub trait VirtualController: Send + Sync {
    /// Updates the virtual controller hardware with the given state
    fn update(&mut self, state: &ControllerState) -> Result<(), ControllerError>;

    /// Immediately resets all buttons, triggers, and thumbsticks to neutral
    fn reset_neutral(&mut self) -> Result<(), ControllerError>;

    /// Unplugs the virtual controller from Windows
    fn disconnect(&mut self) -> Result<(), ControllerError>;

    /// Returns true if virtual device is currently plugged into Windows
    fn is_connected(&self) -> bool;

    /// Returns the human-readable backend name
    fn backend_name(&self) -> &'static str;
}

/// Real Windows Xbox 360 Virtual Controller Backend using ViGEmBus
pub struct ViGEmXbox360Backend {
    target: Xbox360Wired<Client>,
    plugged_in: bool,
}

impl ViGEmXbox360Backend {
    pub fn new(client: Client) -> Result<Self, ControllerError> {
        let mut target = Xbox360Wired::new(client, TargetId::XBOX360_WIRED);
        target
            .plugin()
            .map_err(|e| ControllerError::PluginFailed(format!("{e:?}")))?;

        let _ = target.wait_ready();

        // Send initial neutral state
        let neutral = XGamepad::default();
        let _ = target.update(&neutral);

        Ok(Self {
            target,
            plugged_in: true,
        })
    }
}

impl VirtualController for ViGEmXbox360Backend {
    fn update(&mut self, state: &ControllerState) -> Result<(), ControllerError> {
        if !self.plugged_in {
            return Err(ControllerError::AlreadyDisconnected);
        }

        let gamepad = XGamepad {
            buttons: XButtons(state.buttons),
            left_trigger: state.left_trigger,
            right_trigger: state.right_trigger,
            thumb_lx: state.thumb_lx,
            thumb_ly: state.thumb_ly,
            thumb_rx: state.thumb_rx,
            thumb_ry: state.thumb_ry,
        };

        self.target
            .update(&gamepad)
            .map_err(|e| ControllerError::UpdateFailed(format!("{e:?}")))
    }

    fn reset_neutral(&mut self) -> Result<(), ControllerError> {
        let neutral = ControllerState::neutral();
        self.update(&neutral)
    }

    fn disconnect(&mut self) -> Result<(), ControllerError> {
        if self.plugged_in {
            let _ = self.reset_neutral();
            let _ = self.target.unplug();
            self.plugged_in = false;
        }
        Ok(())
    }

    fn is_connected(&self) -> bool {
        self.plugged_in
    }

    fn backend_name(&self) -> &'static str {
        "ViGEmBus (Xbox 360)"
    }
}

impl Drop for ViGEmXbox360Backend {
    fn drop(&mut self) {
        if self.plugged_in {
            let _ = self.reset_neutral();
            let _ = self.target.unplug();
            self.plugged_in = false;
        }
    }
}

/// Mock Virtual Controller for testing and offline development
pub struct MockVirtualController {
    pub last_state: ControllerState,
    pub is_plugged_in: bool,
    pub update_count: usize,
}

impl MockVirtualController {
    pub fn new() -> Self {
        Self {
            last_state: ControllerState::neutral(),
            is_plugged_in: true,
            update_count: 0,
        }
    }
}

impl VirtualController for MockVirtualController {
    fn update(&mut self, state: &ControllerState) -> Result<(), ControllerError> {
        if !self.is_plugged_in {
            return Err(ControllerError::AlreadyDisconnected);
        }
        self.last_state = *state;
        self.update_count += 1;
        Ok(())
    }

    fn reset_neutral(&mut self) -> Result<(), ControllerError> {
        self.last_state = ControllerState::neutral();
        Ok(())
    }

    fn disconnect(&mut self) -> Result<(), ControllerError> {
        self.is_plugged_in = false;
        self.reset_neutral()
    }

    fn is_connected(&self) -> bool {
        self.is_plugged_in
    }

    fn backend_name(&self) -> &'static str {
        "Mock Controller (Unit Test / Offline)"
    }
}

/// Creates the best available virtual controller backend and reports driver status
pub fn create_virtual_controller() -> (Box<dyn VirtualController>, DriverStatus) {
    match Client::connect() {
        Ok(client) => match ViGEmXbox360Backend::new(client) {
            Ok(backend) => (
                Box::new(backend),
                DriverStatus::Available {
                    backend: "ViGEmBus (Xbox 360)",
                },
            ),
            Err(e) => {
                let reason = format!("ViGEmBus client connected but target creation failed: {e}");
                (
                    Box::new(MockVirtualController::new()),
                    DriverStatus::DriverMissing {
                        reason,
                        help_url: "https://github.com/nefarius/ViGEmBus/releases",
                    },
                )
            }
        },
        Err(err) => {
            let reason = format!(
                "ViGEmBus driver not running or not found ({err:?}). Real Xbox 360 controller emulation requires the official ViGEmBus kernel driver."
            );
            (
                Box::new(MockVirtualController::new()),
                DriverStatus::DriverMissing {
                    reason,
                    help_url: "https://github.com/nefarius/ViGEmBus/releases",
                },
            )
        }
    }
}

/// Creates the requested number of independent controller targets.
///
/// Each target uses the Xbox 360 target identity; ViGEmBus assigns each
/// plugged-in target its own virtual controller instance.
pub fn create_virtual_controllers(
    count: usize,
) -> (Vec<Box<dyn VirtualController>>, DriverStatus) {
    let mut controllers = Vec::with_capacity(count);
    let mut status = None;

    for _ in 0..count {
        let (controller, controller_status) = create_virtual_controller();
        if status.is_none() {
            status = Some(controller_status.clone());
        }
        controllers.push(controller);
    }

    (
        controllers,
        status.unwrap_or(DriverStatus::DriverMissing {
            reason: "No controller slots were configured.".to_string(),
            help_url: "https://github.com/nefarius/ViGEmBus/releases",
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::controller_state::buttons;

    #[test]
    fn test_mock_controller_lifecycle() {
        let mut ctrl = MockVirtualController::new();
        assert!(ctrl.is_connected());
        assert_eq!(ctrl.update_count, 0);

        let mut st = ControllerState::neutral();
        st.set_button(buttons::A, true);
        st.left_trigger = 255;
        ctrl.update(&st).unwrap();

        assert_eq!(ctrl.update_count, 1);
        assert!(ctrl.last_state.is_button_pressed(buttons::A));
        assert_eq!(ctrl.last_state.left_trigger, 255);

        ctrl.reset_neutral().unwrap();
        assert_eq!(ctrl.last_state.buttons, 0);
        assert_eq!(ctrl.last_state.left_trigger, 0);

        ctrl.disconnect().unwrap();
        assert!(!ctrl.is_connected());
        assert!(ctrl.update(&st).is_err());
    }
}
