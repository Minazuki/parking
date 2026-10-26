package app

import (
	"github.com/Minazuki/parking/server/src/internal/beacon"
	"github.com/Minazuki/parking/server/src/internal/domain"
	"github.com/Minazuki/parking/server/src/internal/repository"
	"github.com/Minazuki/parking/server/src/internal/service"
)

func provideRepository(cfg Config, validator *domain.Validator) (*repository.Store, func(), error) {
	store, err := repository.Open(cfg.Workspace, cfg.Version, validator)
	if err != nil {
		return nil, nil, err
	}
	return store, func() { store.Close() }, nil
}
func provideService(cfg Config, repo *repository.Store, validator *domain.Validator) *service.Service {
	return service.New(repo, beacon.Fetcher{}.Fetch, validator, cfg.Version)
}
func provideApplication(cfg Config, repo *repository.Store, activity *service.Service) *Application {
	return &Application{config: cfg, repository: repo, activity: activity}
}
