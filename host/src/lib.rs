/// Number of independent virtual controller slots (four-player support).
pub const CONTROLLER_SLOTS: usize = 4;

pub mod controller_state;
pub mod diagnostics;
pub mod network;
pub mod pairing;
pub mod protocol;
pub mod server;
pub mod virtual_controller;
pub mod watchdog;
