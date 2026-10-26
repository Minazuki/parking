module github.com/Minazuki/parking/tools/verify-draw/go

go 1.26.0

require golang.org/x/crypto v0.58.0

require golang.org/x/sys v0.49.0 // indirect

require github.com/Minazuki/parking/server v0.0.0

replace github.com/Minazuki/parking/server => ../../../server

replace github.com/Minazuki/parking/schemas => ../../../schemas
