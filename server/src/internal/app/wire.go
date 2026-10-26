//go:build wireinject

package app

import (
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/google/wire"
)

// Initialize connects the concrete adapters to the application services at build time.
func Initialize(cfg Config) (*Application, func(), error) {
	wire.Build(domain.NewValidator, provideRepository, provideService, provideApplication)
	return nil, nil, nil
}
