use std::net::{Ipv4Addr, SocketAddr, UdpSocket};

pub struct NetworkUtils;

impl NetworkUtils {
    /// Detects the primary local LAN IP address suitable for phone connection
    pub fn get_primary_local_ip() -> Ipv4Addr {
        // Connect a UDP socket to an external address (no packets are actually sent).
        // This queries the Windows routing table for the outbound interface.
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect("8.8.8.8:80").is_ok() {
                if let Ok(SocketAddr::V4(addr)) = socket.local_addr() {
                    let ip = *addr.ip();
                    if !ip.is_loopback() && !ip.is_unspecified() {
                        return ip;
                    }
                }
            }
        }

        // Fallback to loopback
        Ipv4Addr::new(127, 0, 0, 1)
    }

    /// Returns a list of all plausible local IPv4 addresses
    pub fn get_local_ip_candidates() -> Vec<String> {
        let primary = Self::get_primary_local_ip();
        let mut ips = Vec::new();
        if !primary.is_loopback() {
            ips.push(primary.to_string());
        }
        ips.push("127.0.0.1".to_string());
        ips
    }

    /// Formats a full mobile controller URL
    pub fn build_controller_url(ip: &str, port: u16, code: &str) -> String {
        format!("http://{ip}:{port}/?mode=controller&code={code}")
    }

    /// Formats the desktop dashboard URL
    pub fn build_dashboard_url(ip: &str, port: u16) -> String {
        format!("http://{ip}:{port}/?mode=dashboard")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_primary_ip_detection() {
        let ip = NetworkUtils::get_primary_local_ip();
        // Should return a valid IPv4 address (either local LAN or 127.0.0.1)
        assert!(!ip.is_unspecified());
    }

    #[test]
    fn test_url_formatting() {
        let url = NetworkUtils::build_controller_url("192.168.1.50", 41234, "AB12CD");
        assert_eq!(
            url,
            "http://192.168.1.50:41234/?mode=controller&code=AB12CD"
        );
    }
}
