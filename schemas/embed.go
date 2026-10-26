// Package schemas embeds the one shared source of checkpoint contracts.
package schemas

import "embed"

//go:embed checkpoints/*.schema.json
var Files embed.FS
