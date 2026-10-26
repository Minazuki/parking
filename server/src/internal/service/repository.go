package service

// Repository is the application's storage port; its implementation owns the lock.
type Repository interface {
	Root() string
	Snapshot() (Snapshot, error)
	WithOperation(string, func(Transaction) error) (Snapshot, error)
}

// Transaction serializes one operation and may commit more than one checkpoint.
// Each Commit is independently durable; failures retain earlier checkpoints.
type Transaction interface {
	Snapshot() *Snapshot
	Commit(int, map[string][]byte) error
	Record(string, any) error
	SaveActivity([]byte) error
}
