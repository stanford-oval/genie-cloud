package sql

// Key shared by tables
type Key struct {
	UniqueID string `json:"uniqueId" gorm:"primaryKey;column:uniqueId"`
	UserID   uint   `json:"userId" gorm:"primaryKey;column:userId"`
}

// Model defines the interface for table and row
type Model interface {
	TableName() string
	NewRow() Model
	NewRows() interface{}
	SetKey(Key)
	GetKey() Key
}

var models map[string]Model

func init() {
	models = make(map[string]Model)
	registerModel(&UserDevice{})
	registerModel(&UserChannel{})
}

func registerModel(t Model) {
	models[t.TableName()] = t
}

// GetModel returns registerd model keyed by table name
func GetModel(n string) (Model, bool) {
	m, ok := models[n]
	return m, ok
}
