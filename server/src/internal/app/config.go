package app

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
)

type Config struct {
	Workspace string
	Addr      string
	DevOrigin string
	NoBrowser bool
	Version   string
}

// Validate runs before opening files or listeners.
func (c Config) Validate() error {
	if strings.TrimSpace(c.Workspace) == "" {
		return fmt.Errorf("--workspace is required")
	}
	host, port, err := net.SplitHostPort(c.Addr)
	if err != nil || net.ParseIP(host) == nil || !net.ParseIP(host).IsLoopback() {
		return fmt.Errorf("--addr must be a loopback IP address and port")
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 0 || n > 65535 {
		return fmt.Errorf("--addr must have a valid port")
	}
	if c.DevOrigin != "" {
		u, err := url.Parse(c.DevOrigin)
		if err != nil || u.Scheme != "http" || u.User != nil || u.Opaque != "" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" ||
			(u.Hostname() != "localhost" && (net.ParseIP(u.Hostname()) == nil || !net.ParseIP(u.Hostname()).IsLoopback())) {
			return fmt.Errorf("--dev-origin must be a local HTTP origin")
		}
		if u.Port() != "" {
			p, err := strconv.Atoi(u.Port())
			if err != nil || p < 1 || p > 65535 {
				return fmt.Errorf("--dev-origin must have a valid port")
			}
		}
	}
	return nil
}
